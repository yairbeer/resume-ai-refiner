import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { NextResponse } from "next/server";

type TemplateDesignRequest = {
  instructions?: string;
};

type TemplateDesign = {
  templateName: string;
  designSummary: string[];
  layout: {
    type: string;
    sectionOrder: string[];
    leftRailSections: string[];
    mainSections: string[];
  };
  visualStyle: {
    tone: string;
    typography: string;
    colorPalette: string[];
    spacing: string;
  };
  htmlPreview: string;
  css: string;
  implementationNotes: string[];
};

type TemplateDesignPayload = {
  templateDesign: TemplateDesign;
};

type TemplateDesignResponse = TemplateDesignPayload & {
  cacheFilePath: string;
  cacheRelativePath: string;
  cacheVersion: number;
  cacheLatestPath: string;
};

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 12000;
const TEMPLATE_CACHE_DIR = ".cache/templates";
const VERSION_DIR = "versions";
const LATEST_FILE = "latest.json";
const SAMPLE_PATH = "examples/cv-parts-sample.json";

export async function GET() {
  const latest = await readLatestTemplateDesign();

  if (!latest) {
    return NextResponse.json(
      { error: "No saved template design was found." },
      { status: 404 },
    );
  }

  return NextResponse.json(latest);
}

export async function POST(request: Request) {
  const body = (await request.json()) as TemplateDesignRequest;
  const instructions = body.instructions?.trim() ?? "";

  if (!instructions) {
    return NextResponse.json(
      { error: "Add template design instructions before generating." },
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

  const sample = await readSampleCvParts();

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
      system: buildSystemPrompt(sample),
      tools: [
        {
          name: "return_template_design",
          description:
            "Return a resume template design spec, HTML preview, and CSS for the React renderer.",
          input_schema: TEMPLATE_DESIGN_TOOL_SCHEMA,
        },
      ],
      tool_choice: {
        type: "tool",
        name: "return_template_design",
      },
      messages: [
        {
          role: "user",
          content: buildPrompt(instructions),
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
          "Claude returned a template design that could not be parsed. Check the dev server console for the raw response preview.",
      },
      { status: 502 },
    );
  }

  const cacheInfo = await saveTemplateDesign(parsed);

  return NextResponse.json({
    ...parsed,
    ...cacheInfo,
  } satisfies TemplateDesignResponse);
}

function buildSystemPrompt(sample: string) {
  return [
    "You design professional resume templates for a React/Next app.",
    "Use only the provided fake CV-parts sample and schema shape for layout decisions.",
    "Do not request or rely on the user's real CV content.",
    "Return a template design spec, an HTML preview, and CSS through the required tool.",
    "The HTML preview must be a renderable fragment rooted at <article class=\"resume-template\"> and filled with fake sample content only.",
    "The generated CSS must be printable, readable, and scoped with a .resume-template root selector.",
    "The renderer will later apply this design to real local .cache/cv-parts/latest.json data.",
    "",
    "Fake CV-parts sample:",
    sample,
  ].join("\n");
}

function buildPrompt(instructions: string) {
  return [
    "Current user instructions:",
    instructions,
    "",
    "Design constraints:",
    "- Use a React-based HTML resume structure.",
    "- Keep the template professional and readable.",
    "- Handle omitted optional sections gracefully.",
    "- Prefer section names from the sample: contact, profile, technicalSkills, professionalExperience, patents, publications, education, customSections.",
    "- Return renderable HTML and CSS, not Markdown explanation.",
  ].join("\n");
}

function parseResponse(data: unknown): TemplateDesignPayload | null {
  const toolInput = getToolInput(data);

  if (
    toolInput &&
    typeof toolInput === "object" &&
    hasTemplateDesignShape(toolInput)
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
    if (block.type === "tool_use" && block.name === "return_template_design") {
      return block.input;
    }
  }

  return null;
}

function hasTemplateDesignShape(
  value: object,
): value is TemplateDesignPayload {
  const templateDesign = (value as Partial<TemplateDesignPayload>).templateDesign;

  return (
    !!templateDesign &&
    typeof templateDesign.templateName === "string" &&
    Array.isArray(templateDesign.designSummary) &&
    !!templateDesign.layout &&
    Array.isArray(templateDesign.layout.sectionOrder) &&
    !!templateDesign.visualStyle &&
    Array.isArray(templateDesign.visualStyle.colorPalette) &&
    typeof templateDesign.htmlPreview === "string" &&
    typeof templateDesign.css === "string" &&
    Array.isArray(templateDesign.implementationNotes)
  );
}

async function readLatestTemplateDesign() {
  const cacheDir = resolve(
    /* turbopackIgnore: true */ process.cwd(),
    TEMPLATE_CACHE_DIR,
  );
  const latestPath = join(cacheDir, LATEST_FILE);

  try {
    const latestJson = await readFile(latestPath, "utf8");
    const latest = JSON.parse(latestJson) as {
      version?: unknown;
      path?: unknown;
      absolutePath?: unknown;
      createdAt?: unknown;
    };

    if (typeof latest.path !== "string") {
      return null;
    }

    const fileName = latest.path.split(/[\\/]/).pop();

    if (!fileName || !/^template-design-v\d{4}\.json$/.test(fileName)) {
      return null;
    }

    const cacheFilePath = join(cacheDir, VERSION_DIR, fileName);
    const cacheJson = await readFile(cacheFilePath, "utf8");
    const cacheObject = JSON.parse(cacheJson) as Partial<TemplateDesignPayload> & {
      version?: unknown;
    };

    if (!cacheObject.templateDesign) {
      return null;
    }

    return normalizeTemplateDesignResponse({
      templateDesign: cacheObject.templateDesign,
      cacheFilePath:
        typeof latest.absolutePath === "string" ? latest.absolutePath : cacheFilePath,
      cacheRelativePath: latest.path,
      cacheVersion:
        typeof latest.version === "number"
          ? latest.version
          : typeof cacheObject.version === "number"
            ? cacheObject.version
            : 0,
      cacheLatestPath: `${TEMPLATE_CACHE_DIR}/${LATEST_FILE}`,
    });
  } catch {
    return null;
  }
}

function normalizeTemplateDesignResponse(
  value: Partial<TemplateDesignResponse>,
): TemplateDesignResponse {
  const templateDesign = value.templateDesign as TemplateDesign;

  return {
    templateDesign: {
      ...templateDesign,
      htmlPreview:
        typeof templateDesign.htmlPreview === "string"
          ? templateDesign.htmlPreview
          : buildFallbackPreviewHtml(templateDesign),
    },
    cacheFilePath: value.cacheFilePath ?? "",
    cacheRelativePath: value.cacheRelativePath ?? "",
    cacheVersion: value.cacheVersion ?? 0,
    cacheLatestPath: value.cacheLatestPath ?? `${TEMPLATE_CACHE_DIR}/${LATEST_FILE}`,
  };
}

function buildFallbackPreviewHtml(templateDesign: TemplateDesign) {
  const leftRailSections = templateDesign.layout.leftRailSections ?? [
    "contact",
    "technicalSkills",
    "education",
  ];
  const mainSections = templateDesign.layout.mainSections ?? [
    "profile",
    "professionalExperience",
    "patents",
    "publications",
  ];

  return [
    '<article class="resume-template">',
    `<aside class="rail">${leftRailSections.map(renderSampleSection).join("")}</aside>`,
    `<main class="main">${mainSections.map(renderSampleSection).join("")}</main>`,
    "</article>",
  ].join("");
}

function renderSampleSection(section: string) {
  switch (section) {
    case "contact":
      return [
        '<section class="contact-block">',
        '<h1 class="contact-name">Alex Morgan</h1>',
        '<p class="contact-title">Head of AI</p>',
        '<p class="contact-item">alex@example.com</p>',
        '<p class="contact-item">+1 555 0100</p>',
        '<p class="contact-item"><a href="#">LinkedIn</a></p>',
        "</section>",
      ].join("");
    case "technicalSkills":
      return [
        '<section class="skills-block">',
        '<div class="section-heading">Skills</div>',
        '<div class="skill-group">',
        '<div class="skill-label">Programming</div>',
        '<div class="skill-items">',
        '<span class="skill-pill">Python</span>',
        '<span class="skill-pill">TypeScript</span>',
        '<span class="skill-pill">SQL</span>',
        "</div>",
        "</div>",
        '<div class="skill-group">',
        '<div class="skill-label">Machine Learning</div>',
        '<div class="skill-items">',
        '<span class="skill-pill">PyTorch</span>',
        '<span class="skill-pill">LLMs</span>',
        '<span class="skill-pill">scikit-learn</span>',
        "</div>",
        "</div>",
        "</section>",
      ].join("");
    case "education":
      return [
        '<section class="education-block">',
        '<div class="section-heading">Education</div>',
        '<div class="edu-entry">',
        '<div class="edu-org">Example University</div>',
        '<div class="edu-title">M.Sc, Computer Science</div>',
        '<div class="edu-dates">2015 - 2017</div>',
        "</div>",
        "</section>",
      ].join("");
    case "profile":
      return [
        '<section class="profile-section">',
        '<div class="section-heading">Profile</div>',
        '<p class="profile-text">AI engineering leader with experience building applied machine learning products, mentoring teams, and turning research prototypes into production systems.</p>',
        "</section>",
      ].join("");
    case "professionalExperience":
      return [
        '<section class="experience-section">',
        '<div class="section-heading">Experience</div>',
        '<article class="exp-entry">',
        '<div class="exp-header">',
        '<div><span class="exp-role">Head of AI</span><span class="exp-org">Example Data</span></div>',
        '<span class="exp-dates">2023 - Present</span>',
        "</div>",
        '<ul class="exp-items">',
        "<li>Led a small applied AI team building production ML services.</li>",
        "<li>Improved model deployment reliability through stronger evaluation and monitoring.</li>",
        "</ul>",
        "</article>",
        "</section>",
      ].join("");
    case "patents":
      return [
        '<section class="patents-section">',
        '<div class="section-heading">Patents</div>',
        '<div class="patent-entry"><span class="patent-title">Systems and Methods for Example Model Compression</span><span class="patent-dates">2024</span></div>',
        "</section>",
      ].join("");
    case "publications":
      return [
        '<section class="publications-section">',
        '<div class="section-heading">Publications</div>',
        '<div class="pub-entry"><span class="pub-title">Example Conference 2022</span> - Practical ML Systems in Production.</div>',
        "</section>",
      ].join("");
    case "customSections":
      return "";
    default:
      return [
        '<section class="custom-section">',
        `<div class="section-heading">${escapeHtml(section)}</div>`,
        `<p>Sample ${escapeHtml(section)} content.</p>`,
        "</section>",
      ].join("");
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function readSampleCvParts() {
  const samplePath = resolve(
    /* turbopackIgnore: true */ process.cwd(),
    SAMPLE_PATH,
  );

  return readFile(samplePath, "utf8");
}

function getMaxTokens() {
  const configured = Number(process.env.ANTHROPIC_MAX_TOKENS);

  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  return DEFAULT_MAX_TOKENS;
}

async function saveTemplateDesign(payload: TemplateDesignPayload) {
  const cacheDir = resolve(
    /* turbopackIgnore: true */ process.cwd(),
    TEMPLATE_CACHE_DIR,
  );
  const versionDir = join(cacheDir, VERSION_DIR);
  const version = await getNextCacheVersion(versionDir);
  const cacheFileName = `template-design-v${String(version).padStart(4, "0")}.json`;
  const cacheRelativePath = `${TEMPLATE_CACHE_DIR}/${VERSION_DIR}/${cacheFileName}`;
  const cacheFilePath = join(versionDir, cacheFileName);
  const latestPath = join(cacheDir, LATEST_FILE);
  const latestRelativePath = `${TEMPLATE_CACHE_DIR}/${LATEST_FILE}`;
  const createdAt = new Date().toISOString();
  const cacheObject = {
    version,
    createdAt,
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
        absolutePath: cacheFilePath,
        createdAt,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.info("[template-design] Saved template design", {
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
    const match = /^template-design-v(\d+)\.json$/.exec(fileName);

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

  console.error("[template-design] Claude response parse failed", {
    meta,
    responsePreview: JSON.stringify(data).slice(0, 2000),
  });
}

const TEMPLATE_DESIGN_TOOL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    templateDesign: {
      type: "object",
      additionalProperties: false,
      properties: {
        templateName: { type: "string" },
        designSummary: {
          type: "array",
          items: { type: "string" },
        },
        layout: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string" },
            sectionOrder: { type: "array", items: { type: "string" } },
            leftRailSections: { type: "array", items: { type: "string" } },
            mainSections: { type: "array", items: { type: "string" } },
          },
          required: [
            "type",
            "sectionOrder",
            "leftRailSections",
            "mainSections",
          ],
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
        implementationNotes: {
          type: "array",
          items: { type: "string" },
        },
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
    },
  },
  required: ["templateDesign"],
} as const;
