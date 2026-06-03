import { NextResponse } from "next/server";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

type RefineRequest = {
  cvText?: string;
  instructions?: string;
  format?: "markdown" | "text";
};

type RefinePayload = {
  refinedCv: string;
  changeSummary: string[];
  cacheFilePath?: string;
  cacheRelativePath?: string;
  cacheVersion?: number;
  cacheLatestPath?: string;
};

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 20000;
const CACHE_DIR = ".cache/refinements";
const VERSION_DIR = "versions";
const LATEST_FILE = "latest.json";

export async function POST(request: Request) {
  const body = (await request.json()) as RefineRequest;
  const cvText = body.cvText?.trim() ?? "";
  const instructions = body.instructions?.trim() ?? "";
  const format = body.format === "markdown" ? "markdown" : "text";

  if (!cvText) {
    return NextResponse.json(
      { error: "Add a CV before refining." },
      { status: 400 },
    );
  }

  if (!instructions) {
    return NextResponse.json(
      { error: "Add update instructions before refining." },
      { status: 400 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured." },
      { status: 500 },
    );
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
      max_tokens: getMaxTokens(),
      system:
        "You refine stale CVs. Preserve the user's original format. Do not invent facts. If a detail is missing, keep a clear placeholder rather than making it up.",
      tools: [
        {
          name: "return_refined_cv",
          description: "Return the refined CV and a short summary of changes.",
          input_schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              refinedCv: {
                type: "string",
                description:
                  "The complete refined CV in the same format as the input.",
              },
              changeSummary: {
                type: "array",
                description: "Short factual bullets describing the edits made.",
                items: { type: "string" },
              },
            },
            required: ["refinedCv", "changeSummary"],
          },
        },
      ],
      tool_choice: {
        type: "tool",
        name: "return_refined_cv",
      },
      messages: [
        {
          role: "user",
          content: buildPrompt(cvText, instructions, format),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: `Claude request failed: ${errorText}` },
      { status: response.status },
    );
  }

  const data = await response.json();
  const parsed = parseResponse(data);

  if (!parsed) {
    logUnexpectedClaudeResponse(data);
    return NextResponse.json(
      {
        error:
          "Claude returned a response that could not be parsed. Check the dev server console for the raw response preview.",
      },
      { status: 502 },
    );
  }

  const cacheInfo = await saveRefinedCv(parsed.refinedCv, format);

  return NextResponse.json({
    ...parsed,
    ...cacheInfo,
  } satisfies RefinePayload);
}

function buildPrompt(cvText: string, instructions: string, format: "markdown" | "text") {
  return [
    `Input format: ${format}.`,
    "Use the return_refined_cv tool with the full refined CV and a concise change summary.",
    "Rules:",
    "- The refinedCv value must be the full updated CV, not a patch.",
    "- Preserve Markdown syntax if the input is Markdown.",
    "- Preserve plain text structure if the input is plain text.",
    "- Do not add facts, employers, dates, skills, metrics, degrees, or titles unless the user provided them.",
    "- If the instructions imply missing details, use concise placeholders like [Add start date].",
    "- Keep the tone professional and truthful.",
    "",
    "Stale CV:",
    cvText,
    "",
    "Update instructions:",
    instructions,
  ].join("\n");
}

function parseResponse(data: unknown): RefinePayload | null {
  const toolInput = getToolInput(data);
  const parsedToolInput = normalizePayload(toolInput);

  if (parsedToolInput) {
    return parsedToolInput;
  }

  const outputText = getOutputText(data);

  if (!outputText) {
    return null;
  }

  try {
    const parsed = JSON.parse(extractJsonObject(outputText)) as Partial<RefinePayload>;
    if (
      typeof parsed.refinedCv === "string" &&
      Array.isArray(parsed.changeSummary) &&
      parsed.changeSummary.every((item) => typeof item === "string")
    ) {
      return {
        refinedCv: parsed.refinedCv,
        changeSummary: parsed.changeSummary,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function getToolInput(data: unknown): unknown {
  if (!data || typeof data !== "object") {
    return null;
  }

  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return null;
  }

  for (const part of content) {
    if (!part || typeof part !== "object") {
      continue;
    }

    const block = part as { type?: unknown; name?: unknown; input?: unknown };
    if (block.type === "tool_use" && block.name === "return_refined_cv") {
      return block.input;
    }
  }

  return null;
}

function normalizePayload(value: unknown): RefinePayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybePayload = value as Partial<RefinePayload>;

  if (
    typeof maybePayload.refinedCv === "string" &&
    Array.isArray(maybePayload.changeSummary) &&
    maybePayload.changeSummary.every((item) => typeof item === "string")
  ) {
    return {
      refinedCv: maybePayload.refinedCv,
      changeSummary: maybePayload.changeSummary,
    };
  }

  return null;
}

function getMaxTokens() {
  const configured = Number(process.env.ANTHROPIC_MAX_TOKENS);

  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  return DEFAULT_MAX_TOKENS;
}

function getOutputText(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return null;
  }

  return content
    .map((part) => {
      if (!part || typeof part !== "object") {
        return "";
      }

      const text = (part as { text?: unknown; type?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .join("")
    .trim();
}

function extractJsonObject(value: string) {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return cleaned;
  }

  return cleaned.slice(firstBrace, lastBrace + 1);
}

function logUnexpectedClaudeResponse(data: unknown) {
  const outputText = getOutputText(data) ?? "";
  const meta =
    data && typeof data === "object"
      ? {
          id: (data as { id?: unknown }).id,
          model: (data as { model?: unknown }).model,
          stop_reason: (data as { stop_reason?: unknown }).stop_reason,
          usage: (data as { usage?: unknown }).usage,
        }
      : null;

  console.error("[refine] Claude response parse failed", {
    meta,
    outputLength: outputText.length,
    outputPreview: outputText.slice(0, 2000),
  });
}

async function saveRefinedCv(
  refinedCv: string,
  format: "markdown" | "text",
) {
  const extension = format === "markdown" ? "md" : "txt";
  const cacheDir = resolve(process.cwd(), CACHE_DIR);
  const versionDir = join(cacheDir, VERSION_DIR);
  const version = await getNextCacheVersion(versionDir);
  const cacheFileName = `refined-cv-v${String(version).padStart(4, "0")}.${extension}`;
  const cacheRelativePath = `${CACHE_DIR}/${VERSION_DIR}/${cacheFileName}`;
  const cacheFilePath = join(versionDir, cacheFileName);
  const latestPath = join(cacheDir, LATEST_FILE);
  const latestRelativePath = `${CACHE_DIR}/${LATEST_FILE}`;

  await mkdir(versionDir, { recursive: true });
  await writeFile(cacheFilePath, refinedCv, "utf8");
  await writeFile(
    latestPath,
    JSON.stringify(
      {
        version,
        format,
        path: cacheRelativePath,
        absolutePath: cacheFilePath,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );

  console.info("[refine] Saved refined CV", {
    cacheVersion: version,
    cacheRelativePath,
    cacheFilePath,
    cacheLatestPath: latestRelativePath,
  });

  return {
    cacheVersion: version,
    cacheFilePath,
    cacheRelativePath,
    cacheLatestPath: latestRelativePath,
  };
}

async function getNextCacheVersion(versionDir: string) {
  await mkdir(versionDir, { recursive: true });

  const files = await readdir(versionDir);
  const latestVersion = files.reduce((latest, fileName) => {
    const match = /^refined-cv-v(\d+)\.(?:md|txt)$/.exec(fileName);

    if (!match) {
      return latest;
    }

    return Math.max(latest, Number(match[1]));
  }, 0);

  return latestVersion + 1;
}
