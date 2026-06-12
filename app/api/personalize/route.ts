import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { NextResponse } from "next/server";

type PersonalizeRequest = {
  jobMarkdown?: string;
  jobUrl?: string | null;
  jobFetchedAt?: string | null;
  fitInstructions?: string;
  styleInstructions?: string;
};

type CvPartBlock = {
  title?: string;
  subtitle?: string;
  organization?: string;
  role?: string;
  dates?: string;
  items?: string[];
  rawText: string;
};

type CvParts = {
  contact: {
    name?: string;
    phone?: string;
    email?: string;
    links?: Array<{ label: string; url: string }>;
    rawText: string;
  };
  profile: {
    rawText: string;
  };
  technicalSkills: {
    groups: Array<{ label: string; items: string[]; rawText: string }>;
    rawText: string;
  };
  professionalExperience: CvPartBlock[];
  additionalExperience?: CvPartBlock[];
  honorsAwards?: CvPartBlock[];
  patents?: CvPartBlock[];
  publications?: CvPartBlock[];
  education: CvPartBlock[];
  customSections?: Array<{ heading: string; rawText: string }>;
};

type TemplateDesign = {
  templateName?: string;
  designSummary?: string[];
  layout?: {
    type?: string;
    sectionOrder?: string[];
    leftRailSections?: string[];
    mainSections?: string[];
  };
  visualStyle?: {
    tone?: string;
    typography?: string;
    colorPalette?: string[];
    spacing?: string;
  };
  htmlPreview?: string;
  css?: string;
  implementationNotes?: string[];
};

type SourcePointer = {
  version?: number;
  path?: string;
  createdAt?: string;
};

type PersonalizationPayload = {
  roleSummary: string;
  fitSummary: string[];
  warnings: string[];
  partDecisions: Array<{
    section: string;
    decision: "changed" | "unchanged" | "ignored";
    reason: string;
  }>;
  personalizedCvParts: CvParts;
  style: TemplateDesign;
};

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 20000;
const CV_PARTS_CACHE_DIR = ".cache/cv-parts";
const TEMPLATE_CACHE_DIR = ".cache/templates";
const VERSION_DIR = "versions";
const LATEST_FILE = "latest.json";

export async function POST(request: Request) {
  const body = (await request.json()) as PersonalizeRequest;
  const jobMarkdown = body.jobMarkdown?.trim() ?? "";

  if (!hasEnoughJobText(jobMarkdown)) {
    return NextResponse.json(
      { error: "Add a non-empty job description before personalizing." },
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

  const source = await readPipelineSources();

  if (!source.cvParts || !source.cvPartsPath) {
    return NextResponse.json(
      {
        error:
          "No CV parts cache was found. Run the CV to components step before personalizing.",
      },
      { status: 404 },
    );
  }

  if (!source.template || !source.templatePath) {
    return NextResponse.json(
      {
        error:
          "No template cache was found. Generate or load a template before personalizing.",
      },
      { status: 404 },
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
      system: buildSystemPrompt(),
      tools: [
        {
          name: "return_cv_parts",
          description:
            "Return job-personalized CV parts, part-level decisions, and saved style data.",
          input_schema: PERSONALIZATION_TOOL_SCHEMA,
        },
      ],
      tool_choice: {
        type: "tool",
        name: "return_cv_parts",
      },
      messages: [
        {
          role: "user",
          content: buildPrompt({
            cvParts: source.cvParts,
            fitInstructions: body.fitInstructions?.trim() ?? "",
            jobMarkdown,
            jobUrl: body.jobUrl?.trim() ?? "",
            styleInstructions: body.styleInstructions?.trim() ?? "",
            template: source.template,
          }),
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
          "Claude returned personalization data that could not be parsed. Check the dev server console for the raw response preview.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    bundle: {
      version: 1,
      saveName: "",
      createdAt: new Date().toISOString(),
      job: {
        url: body.jobUrl?.trim() || null,
        markdown: jobMarkdown,
        fetchedAt: body.jobFetchedAt?.trim() || null,
      },
      instructions: {
        fit: body.fitInstructions?.trim() ?? "",
        style: body.styleInstructions?.trim() ?? "",
      },
      source: {
        cvPartsPath: source.cvPartsPath,
        templatePath: source.templatePath,
      },
      ...parsed,
    },
  });
}

function buildSystemPrompt() {
  return [
    "You personalize CV parts for one specific job posting.",
    "The goal is to produce a professional, concise CV targeted to that job while preserving the candidate's established voice and prior writing style.",
    "You must stay grounded in the provided CV parts.",
    "Do not invent employers, dates, degrees, publications, patents, awards, metrics, skills, or credentials.",
    "You may reorder, emphasize, compress, or lightly rewrite truthful content when it improves fit for the job.",
    "Do not make the CV sound AI-generated, generic, inflated, or overly polished.",
    "Use professional concise language in the same style as the previously written CV.",
    "Do not use em dashes.",
    "Do not use icons.",
    "Low-relevance sections such as education, patents, honors, and publications may remain unchanged or be marked ignored.",
    "Only change saved style data when the user explicitly provides style instructions.",
    "Do not propose source-code edits.",
    "Use the required tool only.",
  ].join("\n");
}

function hasEnoughJobText(value: string) {
  const words = value.split(/\s+/).filter(Boolean);

  return words.length >= 12;
}

function buildPrompt(input: {
  cvParts: CvParts;
  fitInstructions: string;
  jobMarkdown: string;
  jobUrl: string;
  styleInstructions: string;
  template: TemplateDesign;
}) {
  return [
    "Target job URL:",
    input.jobUrl || "[not provided]",
    "",
    "Target job Markdown:",
    input.jobMarkdown,
    "",
    "Optional fit instructions:",
    input.fitInstructions || "[none]",
    "",
    "Optional style instructions:",
    input.styleInstructions || "[none]",
    "",
    "Current CV parts:",
    JSON.stringify(input.cvParts, null, 2),
    "",
    "Current saved template/style data:",
    JSON.stringify(input.template, null, 2),
    "",
    "Rules:",
    "- personalizedCvParts must keep the same section-level schema as current CV parts.",
    "- Preserve rawText fields with truthful job-targeted wording where changed.",
    "- Match the prior CV writing style: professional, concise, direct, and not AI-sounding.",
    "- Do not use em dashes or icons anywhere in generated CV text.",
    "- For every meaningful section, include a partDecisions entry with changed, unchanged, or ignored.",
    "- If style instructions are empty, return the current style data unchanged.",
    "- If style instructions exist, update only saved style/template data needed for this job result.",
    "- warnings should list missing role evidence, unsupported requirements, or constraints.",
  ].join("\n");
}

function parseResponse(data: unknown): PersonalizationPayload | null {
  const toolInput = getToolInput(data);

  if (
    toolInput &&
    typeof toolInput === "object" &&
    hasPersonalizationShape(toolInput)
  ) {
    return toolInput;
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
    if (block.type === "tool_use" && block.name === "return_cv_parts") {
      return block.input;
    }
  }

  return null;
}

function hasPersonalizationShape(
  value: object,
): value is PersonalizationPayload {
  const payload = value as Partial<PersonalizationPayload>;

  return (
    typeof payload.roleSummary === "string" &&
    Array.isArray(payload.fitSummary) &&
    Array.isArray(payload.warnings) &&
    Array.isArray(payload.partDecisions) &&
    !!payload.personalizedCvParts &&
    typeof payload.personalizedCvParts === "object" &&
    !!payload.style &&
    typeof payload.style === "object"
  );
}

async function readPipelineSources() {
  const cvPartsRead = await readLatestCacheObject<{
    cvParts?: CvParts;
  }>(CV_PARTS_CACHE_DIR, /^cv-parts-v\d{4}\.json$/);
  const templateRead = await readLatestCacheObject<{
    templateDesign?: TemplateDesign;
  }>(TEMPLATE_CACHE_DIR, /^template-design-v\d{4}\.json$/);

  return {
    cvParts: cvPartsRead.object?.cvParts,
    cvPartsPath: cvPartsRead.relativePath,
    template: templateRead.object?.templateDesign,
    templatePath: templateRead.relativePath,
  };
}

async function readLatestCacheObject<T>(
  cacheDirName: string,
  filePattern: RegExp,
) {
  const cacheDir = resolve(
    /* turbopackIgnore: true */ process.cwd(),
    cacheDirName,
  );
  const latestPath = join(cacheDir, LATEST_FILE);

  try {
    const latestJson = await readFile(latestPath, "utf8");
    const latest = JSON.parse(latestJson) as SourcePointer;
    const fileName = basename(latest.path ?? "");

    if (!filePattern.test(fileName)) {
      return { object: null, relativePath: null };
    }

    const cacheJson = await readFile(join(cacheDir, VERSION_DIR, fileName), "utf8");

    return {
      object: JSON.parse(cacheJson) as T,
      relativePath: `${cacheDirName}/${VERSION_DIR}/${fileName}`,
    };
  } catch {
    return { object: null, relativePath: null };
  }
}

function getMaxTokens() {
  const configured = Number(process.env.ANTHROPIC_MAX_TOKENS);

  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  return DEFAULT_MAX_TOKENS;
}

function logUnexpectedClaudeResponse(data: unknown) {
  const meta =
    data && typeof data === "object"
      ? {
          id: (data as { id?: unknown }).id,
          model: (data as { model?: unknown }).model,
          stop_reason: (data as { stop_reason?: unknown }).stop_reason,
          usage: (data as { usage?: unknown }).usage,
        }
      : null;

  console.error("[personalize] Claude response parse failed", {
    meta,
    responsePreview: JSON.stringify(data).slice(0, 2000),
  });
}

const CV_PART_BLOCK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    subtitle: { type: "string" },
    organization: { type: "string" },
    role: { type: "string" },
    dates: { type: "string" },
    items: { type: "array", items: { type: "string" } },
    rawText: { type: "string" },
  },
  required: ["rawText"],
} as const;

const CV_PARTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    contact: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        links: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              label: { type: "string" },
              url: { type: "string" },
            },
            required: ["label", "url"],
          },
        },
        rawText: { type: "string" },
      },
      required: ["rawText"],
    },
    profile: {
      type: "object",
      additionalProperties: false,
      properties: {
        rawText: { type: "string" },
      },
      required: ["rawText"],
    },
    technicalSkills: {
      type: "object",
      additionalProperties: false,
      properties: {
        groups: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              label: { type: "string" },
              items: { type: "array", items: { type: "string" } },
              rawText: { type: "string" },
            },
            required: ["label", "items", "rawText"],
          },
        },
        rawText: { type: "string" },
      },
      required: ["groups", "rawText"],
    },
    professionalExperience: {
      type: "array",
      items: CV_PART_BLOCK_SCHEMA,
    },
    additionalExperience: {
      type: "array",
      items: CV_PART_BLOCK_SCHEMA,
    },
    honorsAwards: {
      type: "array",
      items: CV_PART_BLOCK_SCHEMA,
    },
    patents: {
      type: "array",
      items: CV_PART_BLOCK_SCHEMA,
    },
    publications: {
      type: "array",
      items: CV_PART_BLOCK_SCHEMA,
    },
    education: {
      type: "array",
      items: CV_PART_BLOCK_SCHEMA,
    },
    customSections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          heading: { type: "string" },
          rawText: { type: "string" },
        },
        required: ["heading", "rawText"],
      },
    },
  },
  required: [
    "contact",
    "profile",
    "technicalSkills",
    "professionalExperience",
    "education",
  ],
} as const;

const TEMPLATE_STYLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    templateName: { type: "string" },
    designSummary: { type: "array", items: { type: "string" } },
    layout: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string" },
        sectionOrder: { type: "array", items: { type: "string" } },
        leftRailSections: { type: "array", items: { type: "string" } },
        mainSections: { type: "array", items: { type: "string" } },
      },
      required: ["type", "sectionOrder", "leftRailSections", "mainSections"],
    },
    visualStyle: {
      type: "object",
      additionalProperties: false,
      properties: {
        tone: { type: "string" },
        typography: { type: "string" },
        colorPalette: { type: "array", items: { type: "string" } },
        spacing: { type: "string" },
      },
      required: ["tone", "typography", "colorPalette", "spacing"],
    },
    htmlPreview: { type: "string" },
    css: { type: "string" },
    implementationNotes: { type: "array", items: { type: "string" } },
  },
  required: [
    "templateName",
    "designSummary",
    "layout",
    "visualStyle",
    "htmlPreview",
    "css",
    "implementationNotes",
  ],
} as const;

const PERSONALIZATION_TOOL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    roleSummary: { type: "string" },
    fitSummary: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
    partDecisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          section: { type: "string" },
          decision: {
            type: "string",
            enum: ["changed", "unchanged", "ignored"],
          },
          reason: { type: "string" },
        },
        required: ["section", "decision", "reason"],
      },
    },
    personalizedCvParts: CV_PARTS_SCHEMA,
    style: TEMPLATE_STYLE_SCHEMA,
  },
  required: [
    "roleSummary",
    "fitSummary",
    "warnings",
    "partDecisions",
    "personalizedCvParts",
    "style",
  ],
} as const;
