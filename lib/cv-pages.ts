export type CvBlock = {
  title?: string;
  organization?: string;
  role?: string;
  dates?: string;
  items?: string[];
  rawText?: string;
  pageBreakBefore?: boolean;
};

export type CvParts = {
  contact?: { name?: string; phone?: string; email?: string; links?: Array<{ label?: string; url?: string }>; rawText?: string; pageBreakBefore?: boolean };
  profile?: { rawText?: string; pageBreakBefore?: boolean };
  technicalSkills?: { groups?: Array<{ label?: string; items?: string[]; rawText?: string; pageBreakBefore?: boolean }>; rawText?: string };
  professionalExperience?: CvBlock[];
  additionalExperience?: CvBlock[];
  honorsAwards?: CvBlock[];
  patents?: CvBlock[];
  publications?: CvBlock[];
  education?: CvBlock[];
  customSections?: Array<{ heading?: string; rawText?: string; pageBreakBefore?: boolean }>;
};

export type TemplateLayout = {
  sectionOrder?: string[];
  leftRailSections?: string[];
  mainSections?: string[];
};

export type TemplateLike = { layout?: TemplateLayout };

type Fragment = { area: "rail" | "main"; html: string; pageBreakBefore: boolean };

export const PAGE_RENDERER_CSS = `
@media screen {
  body { background: #e7e3dc !important; padding: 24px; }
  .resume-page { width: 210mm !important; min-height: 297mm !important; margin: 0 auto 24px !important; box-shadow: 0 10px 30px rgba(0,0,0,.18); overflow: hidden; }
  .resume-page-no-rail .rail { display: none !important; }
  .resume-page-no-rail .main { width: 100% !important; flex: 1 1 100% !important; }
}
@media print {
  body { padding: 0 !important; background: #fff !important; }
  .resume-page { width: auto !important; min-height: 0 !important; margin: 0 !important; box-shadow: none !important; break-after: page; page-break-after: always; }
  .resume-page:last-child { break-after: auto; page-break-after: auto; }
  .resume-page-no-rail .rail { display: none !important; }
  .resume-page-no-rail .main { width: 100% !important; flex: 1 1 100% !important; }
}
`;

export function hasPageBreaks(cvParts: CvParts) {
  return Boolean(
    cvParts.contact?.pageBreakBefore || cvParts.profile?.pageBreakBefore ||
      cvParts.technicalSkills?.groups?.some((group) => group.pageBreakBefore) ||
      [...(cvParts.professionalExperience ?? []), ...(cvParts.additionalExperience ?? []), ...(cvParts.honorsAwards ?? []), ...(cvParts.patents ?? []), ...(cvParts.publications ?? []), ...(cvParts.education ?? [])].some((block) => block.pageBreakBefore) ||
      cvParts.customSections?.some((section) => section.pageBreakBefore),
  );
}

export function buildPagedCvHtml(template: TemplateLike, cvParts: CvParts) {
  const railSections = new Set(template.layout?.leftRailSections ?? ["contact", "technicalSkills", "education"]);
  const order = unique(template.layout?.sectionOrder ?? ["contact", "profile", "technicalSkills", "professionalExperience", "additionalExperience", "honorsAwards", "patents", "publications", "education", "customSections"]);
  const fragments = order.flatMap((section) => buildFragments(section, railSections.has(section) ? "rail" : "main", cvParts));
  const railPages = splitIntoPages(fragments.filter((fragment) => fragment.area === "rail"));
  const mainPages = splitIntoPages(fragments.filter((fragment) => fragment.area === "main"));
  const pageCount = Math.max(railPages.length, mainPages.length);

  return Array.from({ length: pageCount }, (_, index) => {
    const rail = railPages[index] ?? [];
    const main = mainPages[index] ?? [];

    return `<article class="resume-template resume-page${rail.length ? "" : " resume-page-no-rail"}"><aside class="rail">${rail.join("")}</aside><main class="main">${main.join("")}</main></article>`;
  })
    .join("");
}

function splitIntoPages(fragments: Fragment[]) {
  const pages: string[][] = [[]];

  for (const fragment of fragments) {
    const current = pages.at(-1)!;

    if (fragment.pageBreakBefore && current.length) {
      pages.push([]);
    }

    pages.at(-1)!.push(fragment.html);
  }

  return pages.filter((page) => page.length);
}

function buildFragments(section: string, area: Fragment["area"], parts: CvParts): Fragment[] {
  if (section === "contact" && parts.contact) return [{ area, pageBreakBefore: !!parts.contact.pageBreakBefore, html: `<section class="contact-block"><h1 class="contact-name">${escape(parts.contact.name ?? "")}</h1>${parts.contact.email ? `<p class="contact-item">${escape(parts.contact.email)}</p>` : ""}${parts.contact.phone ? `<p class="contact-item">${escape(parts.contact.phone)}</p>` : ""}${(parts.contact.links ?? []).map(link).join("")}</section>` }];
  if (section === "profile" && parts.profile?.rawText) return [{ area, pageBreakBefore: !!parts.profile.pageBreakBefore, html: `<section class="profile-section"><div class="section-heading">Profile</div><p class="profile-text">${inline(parts.profile.rawText)}</p></section>` }];
  if (section === "technicalSkills") return (parts.technicalSkills?.groups ?? []).map((group, index) => ({ area, pageBreakBefore: !!group.pageBreakBefore, html: `<section class="skills-block">${index === 0 || group.pageBreakBefore ? '<div class="section-heading">Skills</div>' : ""}<div class="skill-group"><div class="skill-label">${escape(group.label ?? "")}</div><div class="skill-items">${(group.items ?? []).map((item) => `<span class="skill-pill">${escape(item)}</span>`).join("")}</div></div></section>` }));
  if (section === "customSections") return (parts.customSections ?? []).map((item) => ({ area, pageBreakBefore: !!item.pageBreakBefore, html: `<section class="custom-section">${item.heading ? `<div class="section-heading">${escape(item.heading)}</div>` : ""}<p>${inline(item.rawText ?? "")}</p></section>` }));
  const blocks = parts[section as keyof CvParts] as CvBlock[] | undefined;
  if (!Array.isArray(blocks)) return [];
  const meta = blockMeta(section);
  return blocks.map((block, index) => ({ area, pageBreakBefore: !!block.pageBreakBefore, html: `<section class="${meta.sectionClass}">${index === 0 || block.pageBreakBefore ? `<div class="section-heading">${meta.label}</div>` : ""}<article class="${meta.entryClass}">${blockTitle(meta.prefix, block)}${block.dates ? `<span class="${meta.prefix}-dates">${escape(block.dates)}</span>` : ""}${items(block.items)}${!block.items?.length && block.rawText ? `<p>${inline(block.rawText)}</p>` : ""}</article></section>` }));
}

function blockMeta(section: string) {
  const map: Record<string, { label: string; prefix: string; sectionClass: string; entryClass: string }> = {
    professionalExperience: { label: "Experience", prefix: "exp", sectionClass: "experience-section", entryClass: "exp-entry" },
    additionalExperience: { label: "Additional Experience", prefix: "exp", sectionClass: "exp-section", entryClass: "exp-entry" },
    honorsAwards: { label: "Honors & Awards", prefix: "honor", sectionClass: "honor-section", entryClass: "honor-entry" },
    patents: { label: "Patents", prefix: "patent", sectionClass: "patent-section", entryClass: "patent-entry" },
    publications: { label: "Publications", prefix: "pub", sectionClass: "pub-section", entryClass: "pub-entry" },
    education: { label: "Education", prefix: "edu", sectionClass: "edu-section", entryClass: "edu-entry" },
  };
  return map[section] ?? { label: section, prefix: "custom", sectionClass: "custom-section", entryClass: "custom-entry" };
}

function blockTitle(prefix: string, block: CvBlock) { const title = block.title ?? block.role ?? block.organization; return title ? `<span class="${prefix}-title">${escape(title)}</span>` : ""; }
function items(value: string[] | undefined) { return value?.length ? `<ul class="exp-items">${value.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>` : ""; }
function link(value: { label?: string; url?: string }) { return value.url ? `<p class="contact-item"><a href="${attr(value.url)}" rel="noopener noreferrer" target="_blank">${escape(value.label ?? value.url)}</a></p>` : ""; }
function inline(value: string) { const clean = value.replace(/\*\*/g, ""); const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\b(https?:\/\/[^\s<]+)/g; let output = ""; let cursor = 0; for (const match of clean.matchAll(pattern)) { const index = match.index ?? 0; const label = match[1] ?? match[3]; const url = match[2] ?? match[3]; output += escape(clean.slice(cursor, index)); output += `<a href="${attr(url)}" rel="noopener noreferrer" target="_blank">${escape(label)}</a>`; cursor = index + match[0].length; } return output + escape(clean.slice(cursor)); }
function escape(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function attr(value: string) { return escape(value).replaceAll("`", "&#096;"); }
function unique(values: string[]) { return [...new Set(values)]; }
