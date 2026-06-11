import { readFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { NextResponse } from "next/server";

type RefinementLatest = {
  version: number;
  format: "markdown" | "text";
  path: string;
  absolutePath?: string;
  createdAt: string;
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

type CvPartsPayload = {
  cvParts: CvParts;
  sectionSummary: string[];
};

type CvPartsResponse = CvPartsPayload & {
  cacheRelativePath: string;
  cacheVersion: number;
  cacheLatestPath: string;
  sourceRefinement: RefinementLatest;
};

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 20000;
const REFINEMENTS_CACHE_DIR = ".cache/refinements";
const CV_PARTS_CACHE_DIR = ".cache/cv-parts";
const VERSION_DIR = "versions";
const LATEST_FILE = "latest.json";

export async function POST() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured." },
      { status: 500 },
    );
  }

  const sourceRefinement = await readLatestRefinement();

  if (!sourceRefinement) {
    return NextResponse.json(
      {
        error:
          "No refined CV cache was found. Refine a CV first so the components pipeline has source material.",
      },
      { status: 404 },
    );
  }

  const sourcePath = getSafeRefinementPath(
    sourceRefinement.path || sourceRefinement.absolutePath,
  );

  if (!sourcePath) {
    return NextResponse.json(
      { error: "The latest refined CV points outside the workspace." },
      { status: 400 },
    );
  }

  const cvText = await readFile(sourcePath, "utf8");

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
            "Return structured CV components extracted from the latest refined CV.",
          input_schema: CV_PARTS_TOOL_SCHEMA,
        },
      ],
      tool_choice: {
        type: "tool",
        name: "return_cv_parts",
      },
      messages: [
        {
          role: "user",
          content: buildPrompt(cvText, sourceRefinement),
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
          "Claude returned CV parts that could not be parsed. Check the dev server console for the raw response preview.",
      },
      { status: 502 },
    );
  }

  const publicSourceRefinement = toPublicSourceRefinement(sourceRefinement);
  const cacheInfo = await saveCvParts(parsed, publicSourceRefinement);

  return NextResponse.json({
    ...parsed,
    ...cacheInfo,
    sourceRefinement: publicSourceRefinement,
  } satisfies CvPartsResponse);
}

function buildPrompt(cvText: string, sourceRefinement: RefinementLatest) {
  return [
    `Source refined CV version: ${sourceRefinement.version}.`,
    `Source format: ${sourceRefinement.format}.`,
    "Use the return_cv_parts tool.",
    "Rules:",
    "- Extract the CV into the schema fields exactly as they appear in the source.",
    "- Preserve original source wording in rawText fields.",
    "- Use section-level blocks for the first split; do not over-normalize every bullet unless it naturally fits items.",
    "- Include additionalExperience, honorsAwards, patents, publications, and customSections only when present.",
    "- Omit projects and certifications if they are not present.",
    "- Do not invent employers, dates, degrees, links, metrics, patents, publications, skills, or missing placeholders.",
    "- Keep unresolved placeholders only if they already exist in the source CV.",
    "",
    "Refined CV:",
    cvText,
  ].join("\n");
}

function buildSystemPrompt() {
  return [
    "You split CVs into structured components.",
    "Preserve source text exactly where requested.",
    "Do not invent missing sections or facts.",
    "Use this compact fake example as the target shape, not as source facts:",
    JSON.stringify(CV_PARTS_SAMPLE, null, 2),
  ].join("\n");
}

function parseResponse(data: unknown): CvPartsPayload | null {
  const toolInput = getToolInput(data);

  if (
    toolInput &&
    typeof toolInput === "object" &&
    hasCvPartsShape(toolInput)
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

function hasCvPartsShape(value: object): value is CvPartsPayload {
  const maybePayload = value as Partial<CvPartsPayload>;
  const cvParts = maybePayload.cvParts as Partial<CvParts> | undefined;

  return (
    !!cvParts &&
    typeof cvParts === "object" &&
    !!cvParts.contact &&
    typeof cvParts.contact.rawText === "string" &&
    !!cvParts.profile &&
    typeof cvParts.profile.rawText === "string" &&
    !!cvParts.technicalSkills &&
    Array.isArray(cvParts.technicalSkills.groups) &&
    Array.isArray(cvParts.professionalExperience) &&
    Array.isArray(cvParts.education) &&
    Array.isArray(maybePayload.sectionSummary) &&
    maybePayload.sectionSummary.every((item) => typeof item === "string")
  );
}

async function readLatestRefinement() {
  const latestPath = resolve(
    /* turbopackIgnore: true */ process.cwd(),
    REFINEMENTS_CACHE_DIR,
    LATEST_FILE,
  );

  try {
    const latestJson = await readFile(latestPath, "utf8");
    return JSON.parse(latestJson) as RefinementLatest;
  } catch {
    return null;
  }
}

function getSafeRefinementPath(candidatePath: string | undefined) {
  if (!candidatePath) {
    return null;
  }

  const fileName = basename(candidatePath);

  if (!/^refined-cv-v\d{4}\.(?:md|txt)$/.test(fileName)) {
    return null;
  }

  return resolve(
    /* turbopackIgnore: true */ process.cwd(),
    REFINEMENTS_CACHE_DIR,
    VERSION_DIR,
    fileName,
  );
}

function toPublicSourceRefinement(sourceRefinement: RefinementLatest) {
  return {
    version: sourceRefinement.version,
    format: sourceRefinement.format,
    path: sourceRefinement.path,
    createdAt: sourceRefinement.createdAt,
  };
}

function getMaxTokens() {
  const configured = Number(process.env.ANTHROPIC_MAX_TOKENS);

  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  return DEFAULT_MAX_TOKENS;
}

async function saveCvParts(
  payload: CvPartsPayload,
  sourceRefinement: RefinementLatest,
) {
  const cacheDir = resolve(
    /* turbopackIgnore: true */ process.cwd(),
    CV_PARTS_CACHE_DIR,
  );
  const versionDir = join(cacheDir, VERSION_DIR);
  const version = await getNextCacheVersion(versionDir);
  const cacheFileName = `cv-parts-v${String(version).padStart(4, "0")}.json`;
  const cacheRelativePath = `${CV_PARTS_CACHE_DIR}/${VERSION_DIR}/${cacheFileName}`;
  const cacheFilePath = join(versionDir, cacheFileName);
  const latestPath = join(cacheDir, LATEST_FILE);
  const latestRelativePath = `${CV_PARTS_CACHE_DIR}/${LATEST_FILE}`;
  const createdAt = new Date().toISOString();
  const cacheObject = {
    version,
    createdAt,
    sourceRefinement,
    ...payload,
  };

  await mkdir(versionDir, { recursive: true });
  await writeFile(cacheFilePath, JSON.stringify(cacheObject, null, 2), "utf8");
  await writeFile(
    latestPath,
    JSON.stringify(
      {
        version,
        path: cacheRelativePath,
        sourceRefinement,
        createdAt,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.info("[cv-parts] Saved structured CV parts", {
    cacheVersion: version,
    cacheRelativePath,
    cacheFilePath,
    cacheLatestPath: latestRelativePath,
    sourceRefinementVersion: sourceRefinement.version,
  });

  return {
    cacheVersion: version,
    cacheRelativePath,
    cacheLatestPath: latestRelativePath,
  };
}

async function getNextCacheVersion(versionDir: string) {
  await mkdir(versionDir, { recursive: true });

  const files = await readdir(versionDir);
  const latestVersion = files.reduce((latest, fileName) => {
    const match = /^cv-parts-v(\d+)\.json$/.exec(fileName);

    if (!match) {
      return latest;
    }

    return Math.max(latest, Number(match[1]));
  }, 0);

  return latestVersion + 1;
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

  console.error("[cv-parts] Claude response parse failed", {
    meta,
    responsePreview: JSON.stringify(data).slice(0, 2000),
  });
}

const CV_PARTS_TOOL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    cvParts: {
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
          items: { $ref: "#/$defs/cvPartBlock" },
        },
        additionalExperience: {
          type: "array",
          items: { $ref: "#/$defs/cvPartBlock" },
        },
        honorsAwards: {
          type: "array",
          items: { $ref: "#/$defs/cvPartBlock" },
        },
        patents: {
          type: "array",
          items: { $ref: "#/$defs/cvPartBlock" },
        },
        publications: {
          type: "array",
          items: { $ref: "#/$defs/cvPartBlock" },
        },
        education: {
          type: "array",
          items: { $ref: "#/$defs/cvPartBlock" },
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
    },
    sectionSummary: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["cvParts", "sectionSummary"],
  $defs: {
    cvPartBlock: {
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
    },
  },
} as const;

const CV_PARTS_SAMPLE = {
  cvParts: {
    contact: {
      name: "Alex Morgan",
      email: "alex@example.com",
      links: [{ label: "LinkedIn", url: "https://www.linkedin.com/in/alex-morgan" }],
      rawText:
        "**Name: Alex Morgan**\nE-mail: alex@example.com\nLinkedIn: https://www.linkedin.com/in/alex-morgan",
    },
    profile: {
      rawText:
        "AI engineering leader turning research prototypes into production systems.",
    },
    technicalSkills: {
      groups: [
        {
          label: "Programming",
          items: ["Python", "TypeScript", "SQL"],
          rawText: "* **Programming**: Python, TypeScript, SQL",
        },
      ],
      rawText: "* **Programming**: Python, TypeScript, SQL",
    },
    professionalExperience: [
      {
        organization: "Example Data",
        role: "Head of AI",
        dates: "2023 - Present",
        items: ["Led an applied AI team building production ML services."],
        rawText:
          "**Example Data: Head of AI 2023 - Present**\n* Led an applied AI team building production ML services.",
      },
    ],
    patents: [
      {
        title: "Systems and Methods for Example Model Compression",
        dates: "2024",
        rawText:
          "* **Systems and Methods for Example Model Compression** - US Patent US0000000, published 2024.",
      },
    ],
    honorsAwards: [
      {
        title: "3rd Place - Example Applied ML Competition",
        organization: "Example Conference",
        dates: "2022",
        rawText:
          "* **3rd Place - Example Applied ML Competition** - issued by Example Conference, 2022.",
      },
    ],
    publications: [
      {
        title: "Example Conference 2022",
        rawText:
          "* **Example Conference 2022** - Practical ML Systems in Production.",
      },
    ],
    education: [
      {
        organization: "Example University",
        title: "M.Sc, Computer Science",
        dates: "2015 - 2017",
        rawText: "**Example University, 2015-2017**\nM.Sc, Computer Science",
      },
    ],
    customSections: [],
  },
  sectionSummary: [
    "Extracted contact, profile, skills, experience, honors, patents, publications, and education.",
    "No projects or certifications were present, so they were omitted.",
  ],
};
