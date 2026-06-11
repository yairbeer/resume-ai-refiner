import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

export const dynamic = "force-dynamic";

type CvParts = {
  contact?: {
    name?: string;
    phone?: string;
    email?: string;
    links?: Array<{ label?: string; url?: string }>;
    rawText?: string;
  };
  profile?: { rawText?: string };
  technicalSkills?: {
    groups?: Array<{ label?: string; items?: string[]; rawText?: string }>;
    rawText?: string;
  };
  professionalExperience?: CvBlock[];
  additionalExperience?: CvBlock[];
  patents?: CvBlock[];
  publications?: CvBlock[];
  education?: CvBlock[];
  customSections?: Array<{ heading?: string; rawText?: string }>;
};

type CvBlock = {
  title?: string;
  subtitle?: string;
  organization?: string;
  role?: string;
  dates?: string;
  items?: string[];
  rawText?: string;
};

type TemplateDesign = {
  templateName?: string;
  layout?: {
    leftRailSections?: string[];
    mainSections?: string[];
    sectionOrder?: string[];
  };
  css?: string;
};

const CV_PARTS_CACHE_DIR = ".cache/cv-parts";
const TEMPLATE_CACHE_DIR = ".cache/templates";
const VERSION_DIR = "versions";
const LATEST_FILE = "latest.json";

export default async function CvPreviewPage() {
  const [template, cvParts] = await Promise.all([
    readLatestTemplate(),
    readLatestCvParts(),
  ]);

  if (!template || !cvParts) {
    return (
      <main style={emptyPageStyle}>
        <h1>No CV preview yet</h1>
        <p>
          Generate CV components and a template first, then open this page again.
        </p>
      </main>
    );
  }

  return (
    <main style={previewPageStyle}>
      <iframe
        sandbox=""
        srcDoc={buildCvPreviewSrcDoc(template, cvParts)}
        style={previewFrameStyle}
        title="Rendered latest CV preview"
      />
    </main>
  );
}

function buildCvPreviewSrcDoc(template: TemplateDesign, cvParts: CvParts) {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src data:; base-uri \'none\'; form-action \'none\'" />',
    "<style>",
    [
      "body { margin: 0; background: #f3f0e9; font-family: Arial, sans-serif; }",
      "@media screen { body { padding: 24px; } }",
    ].join("\n"),
    template.css ?? "",
    "</style>",
    "</head>",
    "<body>",
    buildCvHtml(template, cvParts),
    "</body>",
    "</html>",
  ].join("\n");
}

function buildCvHtml(template: TemplateDesign, cvParts: CvParts) {
  const leftRailSections = template.layout?.leftRailSections ?? [
    "contact",
    "technicalSkills",
    "education",
  ];
  const mainSections = template.layout?.mainSections ?? [
    "profile",
    "professionalExperience",
    "additionalExperience",
    "patents",
    "publications",
    "customSections",
  ];

  return [
    '<article class="resume-template">',
    `<aside class="rail">${leftRailSections
      .map((section) => renderCvSection(section, cvParts))
      .join("")}</aside>`,
    `<main class="main">${mainSections
      .map((section) => renderCvSection(section, cvParts))
      .join("")}</main>`,
    "</article>",
  ].join("");
}

function renderCvSection(section: string, cvParts: CvParts) {
  switch (section) {
    case "contact":
      return renderContact(cvParts.contact);
    case "technicalSkills":
      return renderSkills(cvParts.technicalSkills);
    case "education":
      return renderBlocks("Education", "edu", cvParts.education);
    case "profile":
      return cvParts.profile?.rawText
        ? [
            '<section class="profile-section">',
            '<div class="section-heading">Profile</div>',
            `<p class="profile-text">${escapeHtml(cvParts.profile.rawText)}</p>`,
            "</section>",
          ].join("")
        : "";
    case "professionalExperience":
      return renderExperience(cvParts.professionalExperience);
    case "additionalExperience":
      return renderBlocks("Additional Experience", "exp", cvParts.additionalExperience);
    case "patents":
      return renderBlocks("Patents", "patent", cvParts.patents);
    case "publications":
      return renderBlocks("Publications", "pub", cvParts.publications);
    case "customSections":
      return renderCustomSections(cvParts.customSections);
    default:
      return "";
  }
}

function renderContact(contact: CvParts["contact"]) {
  if (!contact) {
    return "";
  }

  return [
    '<section class="contact-block">',
    contact.name ? `<h1 class="contact-name">${escapeHtml(contact.name)}</h1>` : "",
    '<p class="contact-title">Head of AI</p>',
    contact.email
      ? `<p class="contact-item">${escapeHtml(contact.email)}</p>`
      : "",
    contact.phone
      ? `<p class="contact-item">${escapeHtml(contact.phone)}</p>`
      : "",
    ...(contact.links ?? []).map((link) =>
      link.url
        ? `<p class="contact-item"><a href="${escapeAttribute(link.url)}">${escapeHtml(
            link.label ?? link.url,
          )}</a></p>`
        : "",
    ),
    "</section>",
  ].join("");
}

function renderSkills(skills: CvParts["technicalSkills"]) {
  if (!skills?.groups?.length) {
    return "";
  }

  return [
    '<section class="skills-block">',
    '<div class="section-heading">Skills</div>',
    ...skills.groups.map((group) =>
      [
        '<div class="skill-group">',
        group.label
          ? `<div class="skill-label">${escapeHtml(group.label)}</div>`
          : "",
        '<div class="skill-items">',
        ...(group.items ?? []).map(
          (item) => `<span class="skill-pill">${escapeHtml(item)}</span>`,
        ),
        "</div>",
        "</div>",
      ].join(""),
    ),
    "</section>",
  ].join("");
}

function renderExperience(blocks: CvBlock[] | undefined) {
  if (!blocks?.length) {
    return "";
  }

  return [
    '<section class="experience-section">',
    '<div class="section-heading">Experience</div>',
    ...blocks.map((block) =>
      [
        '<article class="exp-entry">',
        '<div class="exp-header">',
        "<div>",
        block.role
          ? `<span class="exp-role">${escapeHtml(block.role)}</span>`
          : "",
        block.organization
          ? `<span class="exp-org">${escapeHtml(block.organization)}</span>`
          : "",
        "</div>",
        block.dates
          ? `<span class="exp-dates">${escapeHtml(block.dates)}</span>`
          : "",
        "</div>",
        renderItems(block.items),
        "</article>",
      ].join(""),
    ),
    "</section>",
  ].join("");
}

function renderBlocks(label: string, classPrefix: string, blocks: CvBlock[] | undefined) {
  if (!blocks?.length) {
    return "";
  }

  return [
    `<section class="${classPrefix}-section">`,
    `<div class="section-heading">${escapeHtml(label)}</div>`,
    ...blocks.map((block) =>
      [
        `<div class="${classPrefix}-entry">`,
        renderBlockTitle(classPrefix, block),
        block.dates
          ? `<span class="${classPrefix}-dates">${escapeHtml(block.dates)}</span>`
          : "",
        renderItems(block.items),
        !block.items?.length && block.rawText
          ? `<p>${escapeHtml(stripMarkdown(block.rawText))}</p>`
          : "",
        "</div>",
      ].join(""),
    ),
    "</section>",
  ].join("");
}

function renderBlockTitle(classPrefix: string, block: CvBlock) {
  const title = block.title ?? block.role ?? block.organization;

  if (!title) {
    return "";
  }

  return `<span class="${classPrefix}-title">${escapeHtml(title)}</span>`;
}

function renderCustomSections(sections: CvParts["customSections"]) {
  if (!sections?.length) {
    return "";
  }

  return sections
    .map((section) =>
      [
        '<section class="custom-section">',
        section.heading
          ? `<div class="section-heading">${escapeHtml(section.heading)}</div>`
          : "",
        section.rawText ? `<p>${escapeHtml(stripMarkdown(section.rawText))}</p>` : "",
        "</section>",
      ].join(""),
    )
    .join("");
}

function renderItems(items: string[] | undefined) {
  if (!items?.length) {
    return "";
  }

  return [
    '<ul class="exp-items">',
    ...items.map((item) => `<li>${escapeHtml(item)}</li>`),
    "</ul>",
  ].join("");
}

async function readLatestCvParts() {
  const cacheDir = resolve(process.cwd(), CV_PARTS_CACHE_DIR);
  const latest = await readLatestPointer(cacheDir, /^cv-parts-v\d{4}\.json$/);

  if (!latest) {
    return null;
  }

  try {
    const cacheJson = await readFile(join(cacheDir, VERSION_DIR, latest), "utf8");
    const parsed = JSON.parse(cacheJson) as { cvParts?: CvParts };
    return parsed.cvParts ?? null;
  } catch {
    return null;
  }
}

async function readLatestTemplate() {
  const cacheDir = resolve(process.cwd(), TEMPLATE_CACHE_DIR);
  const latest = await readLatestPointer(
    cacheDir,
    /^template-design-v\d{4}\.json$/,
  );

  if (!latest) {
    return null;
  }

  try {
    const templateJson = await readFile(join(cacheDir, VERSION_DIR, latest), "utf8");
    const parsed = JSON.parse(templateJson) as {
      templateDesign?: TemplateDesign;
    };
    return parsed.templateDesign ?? null;
  } catch {
    return null;
  }
}

async function readLatestPointer(cacheDir: string, filePattern: RegExp) {
  try {
    const latestJson = await readFile(join(cacheDir, LATEST_FILE), "utf8");
    const latest = JSON.parse(latestJson) as { path?: unknown };

    if (typeof latest.path !== "string") {
      return null;
    }

    const fileName = basename(latest.path);
    return filePattern.test(fileName) ? fileName : null;
  } catch {
    return null;
  }
}

function stripMarkdown(value: string) {
  return value
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*]\s+/gm, "")
    .trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

const emptyPageStyle = {
  color: "#1f2428",
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  margin: "48px auto",
  maxWidth: "720px",
  padding: "0 24px",
};

const previewPageStyle = {
  background: "#f3f0e9",
  minHeight: "100vh",
  padding: 0,
};

const previewFrameStyle = {
  border: 0,
  display: "block",
  minHeight: "100vh",
  width: "100%",
};
