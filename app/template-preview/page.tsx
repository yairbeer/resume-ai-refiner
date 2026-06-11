import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

export const dynamic = "force-dynamic";

type TemplateDesign = {
  templateName?: string;
  layout?: {
    leftRailSections?: string[];
    mainSections?: string[];
    sectionOrder?: string[];
  };
  htmlPreview?: string;
  css?: string;
};

const TEMPLATE_CACHE_DIR = ".cache/templates";
const VERSION_DIR = "versions";
const LATEST_FILE = "latest.json";

export default async function TemplatePreviewPage() {
  const template = await readLatestTemplate();

  if (!template) {
    return (
      <main style={emptyPageStyle}>
        <h1>No rendered CV yet</h1>
        <p>Generate or load a template design first, then open this page again.</p>
      </main>
    );
  }

  return (
    <main style={previewPageStyle}>
      <iframe
        sandbox=""
        srcDoc={buildTemplatePreviewSrcDoc(template)}
        style={previewFrameStyle}
        title="Rendered resume template preview"
      />
    </main>
  );
}

function buildTemplatePreviewSrcDoc(template: TemplateDesign) {
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
    getPreviewHtml(template),
    "</body>",
    "</html>",
  ].join("\n");
}

function getPreviewHtml(template: TemplateDesign) {
  if (template.htmlPreview?.trim()) {
    return template.htmlPreview;
  }

  if (template.layout?.leftRailSections || template.layout?.mainSections) {
    return buildClassBasedPreviewHtml(template);
  }

  return buildBasicPreviewHtml(template);
}

function buildClassBasedPreviewHtml(template: TemplateDesign) {
  const leftRailSections = template.layout?.leftRailSections ?? [
    "contact",
    "technicalSkills",
    "education",
  ];
  const mainSections = template.layout?.mainSections ?? [
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

function buildBasicPreviewHtml(template: TemplateDesign) {
  const title = template.templateName ?? "Resume Template";

  return [
    '<article class="resume-template">',
    "<header>",
    `<h1>${escapeHtml(title)}</h1>`,
    "<p>Sample rendered CV preview.</p>",
    "</header>",
    "</article>",
  ].join("");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function readLatestTemplate() {
  const cacheDir = resolve(process.cwd(), TEMPLATE_CACHE_DIR);
  const latestPath = join(cacheDir, LATEST_FILE);

  try {
    const latestJson = await readFile(latestPath, "utf8");
    const latest = JSON.parse(latestJson) as { path?: unknown };

    if (typeof latest.path !== "string") {
      return null;
    }

    const fileName = basename(latest.path);

    if (!/^template-design-v\d{4}\.json$/.test(fileName)) {
      return null;
    }

    const templateJson = await readFile(
      join(cacheDir, VERSION_DIR, fileName),
      "utf8",
    );
    const parsed = JSON.parse(templateJson) as {
      templateDesign?: TemplateDesign;
    };

    return parsed.templateDesign ?? null;
  } catch {
    return null;
  }
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
