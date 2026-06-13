"use client";

import { ChangeEvent, useMemo, useState } from "react";

type CvFormat = "markdown" | "text";
type PipelineStep =
  | "refine"
  | "components"
  | "template"
  | "cvPreview"
  | "personalization";

type RefineResult = {
  refinedCv: string;
  changeSummary: string[];
  cacheRelativePath?: string;
  cacheVersion?: number;
  cacheLatestPath?: string;
};

type CvPartsResult = {
  cvParts: unknown;
  sectionSummary: string[];
  cacheRelativePath: string;
  cacheVersion: number;
  cacheLatestPath: string;
  sourceRefinement: {
    version: number;
    path: string;
    createdAt: string;
  };
};

type TemplateDesignResult = {
  templateDesign: {
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
  cacheRelativePath: string;
  cacheVersion: number;
  cacheLatestPath: string;
};

type PersonalizationBundle = {
  version: number;
  saveName: string;
  createdAt: string;
  job: {
    url: string | null;
    markdown: string;
    fetchedAt: string | null;
  };
  instructions: {
    fit: string;
    style: string;
  };
  source: {
    cvPartsPath: string;
    templatePath: string;
  };
  roleSummary: string;
  personalizedCvParts: unknown;
  style: unknown;
  partDecisions: Array<{
    section: string;
    decision: "changed" | "unchanged" | "ignored";
    reason: string;
  }>;
  fitSummary: string[];
  warnings: string[];
};

type PersonalizeResult = {
  bundle: PersonalizationBundle;
};

type SavedPersonalizationItem = {
  fileName: string;
  cacheRelativePath: string;
  updatedAt: string;
};

type CvBlock = {
  title?: string;
  organization?: string;
  role?: string;
  dates?: string;
  items?: string[];
  rawText?: string;
};

type CvPartsForRender = {
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
  honorsAwards?: CvBlock[];
  patents?: CvBlock[];
  publications?: CvBlock[];
  education?: CvBlock[];
  customSections?: Array<{ heading?: string; rawText?: string }>;
};

type TemplateStyleForRender = {
  layout?: {
    leftRailSections?: string[];
    mainSections?: string[];
  };
  css?: string;
};

const markdownExtensions = new Set(["md", "markdown"]);

export default function Home() {
  const [activePipeline, setActivePipeline] = useState<PipelineStep>("refine");
  const [cvText, setCvText] = useState("");
  const [instructions, setInstructions] = useState("");
  const [fileName, setFileName] = useState("");
  const [format, setFormat] = useState<CvFormat>("text");
  const [templateInstructions, setTemplateInstructions] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [jobMarkdown, setJobMarkdown] = useState("");
  const [fitInstructions, setFitInstructions] = useState("");
  const [styleInstructions, setStyleInstructions] = useState("");
  const [personalizationJson, setPersonalizationJson] = useState("");
  const [saveName, setSaveName] = useState("");
  const [savedPersonalizations, setSavedPersonalizations] = useState<
    SavedPersonalizationItem[]
  >([]);
  const [selectedPersonalizationFile, setSelectedPersonalizationFile] =
    useState("");
  const [result, setResult] = useState<RefineResult | null>(null);
  const [cvPartsResult, setCvPartsResult] = useState<CvPartsResult | null>(null);
  const [templateDesignResult, setTemplateDesignResult] =
    useState<TemplateDesignResult | null>(null);
  const [personalizeResult, setPersonalizeResult] =
    useState<PersonalizeResult | null>(null);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSplittingCv, setIsSplittingCv] = useState(false);
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
  const [isPersonalizing, setIsPersonalizing] = useState(false);
  const [isSavingPersonalization, setIsSavingPersonalization] = useState(false);
  const [isLoadingPersonalizationList, setIsLoadingPersonalizationList] =
    useState(false);
  const [isLoadingPersonalization, setIsLoadingPersonalization] = useState(false);

  const canRefine = cvText.trim().length > 0 && instructions.trim().length > 0;
  const canGenerateTemplate = templateInstructions.trim().length > 0;
  const canPersonalize = hasEnoughJobText(jobMarkdown);
  const canSavePersonalization =
    personalizationJson.trim().length > 0 && saveName.trim().length > 0;
  const canLoadPersonalization = selectedPersonalizationFile.trim().length > 0;
  const canCreateHtml = personalizationJson.trim().length > 0;
  const outputExtension = format === "markdown" ? "md" : "txt";
  const downloadName = useMemo(
    () => buildDownloadName(fileName, outputExtension),
    [fileName, outputExtension],
  );

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const extension = getExtension(file.name);

    if (!["txt", "md", "markdown"].includes(extension)) {
      setStatus("Use a .md, .markdown, or .txt file for this first MVP.");
      setStatusKind("error");
      return;
    }

    const text = await file.text();
    setCvText(text);
    setFileName(file.name);
    setFormat(markdownExtensions.has(extension) ? "markdown" : "text");
    setResult(null);
    setCvPartsResult(null);
    setStatus(`Loaded ${file.name}.`);
    setStatusKind("success");
  }

  async function refineCv() {
    if (!canRefine) {
      setStatus("Add both a CV and update instructions.");
      setStatusKind("error");
      return;
    }

    setIsLoading(true);
    setStatus("Refining CV...");
    setStatusKind("idle");

    try {
      const response = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvText, instructions, format, fileName }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Refinement failed.");
      }

      setResult(data as RefineResult);
      setCvPartsResult(null);
      setStatus("Refined CV is ready and saved as a new cache version.");
      setStatusKind("success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Refinement failed.");
      setStatusKind("error");
    } finally {
      setIsLoading(false);
    }
  }

  async function splitLatestCvIntoParts() {
    setIsSplittingCv(true);
    setStatus("Splitting latest refined CV into components...");
    setStatusKind("idle");

    try {
      const response = await fetch("/api/cv-parts", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "CV component split failed.");
      }

      setCvPartsResult(data as CvPartsResult);
      setStatus("CV components JSON is ready and saved as a new cache version.");
      setStatusKind("success");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "CV component split failed.",
      );
      setStatusKind("error");
    } finally {
      setIsSplittingCv(false);
    }
  }

  async function generateTemplate() {
    if (!canGenerateTemplate) {
      setStatus("Add template instructions before generating.");
      setStatusKind("error");
      return;
    }

    setIsGeneratingTemplate(true);
    setStatus("Generating template design...");
    setStatusKind("idle");

    try {
      const response = await fetch("/api/template-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions: templateInstructions }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Template generation failed.");
      }

      setTemplateDesignResult(data as TemplateDesignResult);
      setStatus("Template design is ready and saved as a new cache version.");
      setStatusKind("success");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Template generation failed.",
      );
      setStatusKind("error");
    } finally {
      setIsGeneratingTemplate(false);
    }
  }

  async function loadExistingTemplate() {
    setIsLoadingTemplate(true);
    setStatus("Loading latest template design...");
    setStatusKind("idle");

    try {
      const response = await fetch("/api/template-design");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "No saved template design was found.");
      }

      setTemplateDesignResult(data as TemplateDesignResult);
      setStatus("Loaded the latest saved template design.");
      setStatusKind("success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Template load failed.");
      setStatusKind("error");
    } finally {
      setIsLoadingTemplate(false);
    }
  }

  async function personalizeCv() {
    if (!canPersonalize) {
      setStatus("Add or fetch job Markdown before personalizing.");
      setStatusKind("error");
      return;
    }

    setIsPersonalizing(true);
    setStatus("Personalizing CV parts for this role...");
    setStatusKind("idle");

    try {
      const response = await fetch("/api/personalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fitInstructions,
          jobFetchedAt: null,
          jobMarkdown,
          jobUrl,
          styleInstructions,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Personalization failed.");
      }

      const parsed = data as PersonalizeResult;
      const formattedJson = JSON.stringify(parsed.bundle, null, 2);

      setPersonalizeResult(parsed);
      setPersonalizationJson(formattedJson);
      setStatus("Personalized bundle is ready to edit and save.");
      setStatusKind("success");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Personalization failed.",
      );
      setStatusKind("error");
    } finally {
      setIsPersonalizing(false);
    }
  }

  async function savePersonalizationAs() {
    if (!canSavePersonalization) {
      setStatus("Add a save name and personalization JSON before saving.");
      setStatusKind("error");
      return;
    }

    let bundle: PersonalizationBundle;

    try {
      bundle = mergeCurrentPersonalizationInputs(
        JSON.parse(personalizationJson) as PersonalizationBundle,
      );
    } catch {
      setStatus("Personalization output must be valid JSON before saving.");
      setStatusKind("error");
      return;
    }

    setIsSavingPersonalization(true);
    setStatus("Saving personalization bundle...");
    setStatusKind("idle");

    try {
      const response = await fetch("/api/personalizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saveName, bundle }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Save failed.");
      }

      const savedBundle = data.bundle as PersonalizationBundle;
      const fileName = String(data.fileName ?? buildJsonDownloadName(saveName));
      const savedJson = JSON.stringify(savedBundle, null, 2);

      setPersonalizationJson(savedJson);
      setPersonalizeResult({ bundle: savedBundle });
      setSelectedPersonalizationFile(fileName);
      downloadJson(savedJson, fileName);
      setStatus(`Saved to ${data.cacheRelativePath} and downloaded ${fileName}.`);
      setStatusKind("success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed.");
      setStatusKind("error");
    } finally {
      setIsSavingPersonalization(false);
    }
  }

  async function loadSavedPersonalizationList() {
    setIsLoadingPersonalizationList(true);
    setStatus("Loading saved personalizations...");
    setStatusKind("idle");

    try {
      const response = await fetch("/api/personalizations");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not load saved personalizations.");
      }

      const items = (data.items ?? []) as SavedPersonalizationItem[];

      setSavedPersonalizations(items);
      if (!selectedPersonalizationFile && items[0]) {
        setSelectedPersonalizationFile(items[0].fileName);
      }
      setStatus(
        items.length
          ? "Saved personalizations are ready to load."
          : "No saved personalizations found.",
      );
      setStatusKind(items.length ? "success" : "idle");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not load saved personalizations.",
      );
      setStatusKind("error");
    } finally {
      setIsLoadingPersonalizationList(false);
    }
  }

  async function loadSavedPersonalization() {
    if (!canLoadPersonalization) {
      setStatus("Choose a saved personalization first.");
      setStatusKind("error");
      return;
    }

    setIsLoadingPersonalization(true);
    setStatus("Loading saved personalization...");
    setStatusKind("idle");

    try {
      const response = await fetch(
        `/api/personalizations?fileName=${encodeURIComponent(
          selectedPersonalizationFile,
        )}`,
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not load saved personalization.");
      }

      const bundle = data.bundle as PersonalizationBundle;

      setPersonalizeResult({ bundle });
      setPersonalizationJson(JSON.stringify(bundle, null, 2));
      setSaveName(bundle.saveName || selectedPersonalizationFile.replace(/\.json$/, ""));
      setJobUrl(bundle.job?.url ?? "");
      setJobMarkdown(bundle.job?.markdown ?? "");
      setFitInstructions(bundle.instructions?.fit ?? "");
      setStyleInstructions(bundle.instructions?.style ?? "");
      setStatus(`Loaded ${data.cacheRelativePath}.`);
      setStatusKind("success");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not load saved personalization.",
      );
      setStatusKind("error");
    } finally {
      setIsLoadingPersonalization(false);
    }
  }

  function createPersonalizationHtml() {
    if (!canCreateHtml) {
      setStatus("Create or load personalization JSON before creating HTML.");
      setStatusKind("error");
      return;
    }

    try {
      const bundle = mergeCurrentPersonalizationInputs(
        JSON.parse(personalizationJson) as PersonalizationBundle,
      );
      const fileName = buildHtmlDownloadName(saveName || bundle.saveName);
      const html = buildPersonalizationHtml(bundle);

      downloadText(html, fileName, "text/html");
      setStatus(`Created ${fileName}.`);
      setStatusKind("success");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Personalization output must be valid JSON before creating HTML.",
      );
      setStatusKind("error");
    }
  }

  function mergeCurrentPersonalizationInputs(
    bundle: PersonalizationBundle,
  ): PersonalizationBundle {
    return {
      ...bundle,
      saveName: saveName.trim() || bundle.saveName || "",
      job: {
        ...(bundle.job ?? {}),
        url: jobUrl.trim() || bundle.job?.url || null,
        markdown: jobMarkdown,
        fetchedAt: bundle.job?.fetchedAt ?? null,
      },
      instructions: {
        ...(bundle.instructions ?? {}),
        fit: fitInstructions,
        style: styleInstructions,
      },
    };
  }

  async function copyResult() {
    if (!result) {
      return;
    }

    await navigator.clipboard.writeText(result.refinedCv);
    setStatus("Copied refined CV.");
    setStatusKind("success");
  }

  function downloadResult() {
    if (!result) {
      return;
    }

    const blob = new Blob([result.refinedCv], {
      type: format === "markdown" ? "text/markdown" : "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = downloadName;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadJson(json: string, fileName: string) {
    downloadText(json, fileName, "application/json");
  }

  function downloadText(text: string, fileName: string, type: string) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>Resume AI Refiner</h1>
          <p>Build each CV pipeline step from the local cache forward.</p>
        </div>
        <p className="privacy-note">
          V1 sends your CV for the refine request and saves only the refined
          output under the local ignored cache for the next pipeline step.
        </p>
      </header>

      <section className="pipeline-layout">
        <aside className="side-panel" aria-label="Pipeline steps">
          <div className="side-panel-header">
            <h2>Pipeline</h2>
          </div>
          <button
            aria-current={activePipeline === "refine" ? "step" : undefined}
            className={`pipeline-tab ${
              activePipeline === "refine" ? "pipeline-tab-active" : ""
            }`}
            onClick={() => setActivePipeline("refine")}
            type="button"
          >
            <span>01</span>
            Refine CV
          </button>
          <button
            aria-current={activePipeline === "components" ? "step" : undefined}
            className={`pipeline-tab ${
              activePipeline === "components" ? "pipeline-tab-active" : ""
            }`}
            onClick={() => setActivePipeline("components")}
            type="button"
          >
            <span>02</span>
            CV to components
          </button>
          <button
            aria-current={activePipeline === "template" ? "step" : undefined}
            className={`pipeline-tab ${
              activePipeline === "template" ? "pipeline-tab-active" : ""
            }`}
            onClick={() => setActivePipeline("template")}
            type="button"
          >
            <span>03</span>
            Template designer
          </button>
          <button
            aria-current={activePipeline === "cvPreview" ? "step" : undefined}
            className={`pipeline-tab ${
              activePipeline === "cvPreview" ? "pipeline-tab-active" : ""
            }`}
            onClick={() => setActivePipeline("cvPreview")}
            type="button"
          >
            <span>04</span>
            CV preview
          </button>
          <button
            aria-current={
              activePipeline === "personalization" ? "step" : undefined
            }
            className={`pipeline-tab ${
              activePipeline === "personalization" ? "pipeline-tab-active" : ""
            }`}
            onClick={() => setActivePipeline("personalization")}
            type="button"
          >
            <span>05</span>
            Personalization
          </button>
        </aside>

        <section className="main-panel" aria-label="Selected pipeline step">
          {activePipeline === "refine" ? (
            <div className="workspace" key="refine">
              <div className="panel" aria-label="CV input panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Input</h2>
                    <p className="panel-subtitle">Start with Markdown or plain text.</p>
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="cv-file">
                    Upload CV
                  </label>
                  <div className="upload-box">
                    <input
                      accept=".md,.markdown,.txt,text/markdown,text/plain"
                      className="file-input"
                      id="cv-file"
                      onChange={handleFileChange}
                      type="file"
                    />
                    <p className="file-meta">
                      {fileName
                        ? `${fileName} -> output .${outputExtension}`
                        : ".md or .txt"}
                    </p>
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="cv-text">
                    Stale CV
                  </label>
                  <textarea
                    className="textarea cv-textarea mono"
                    id="cv-text"
                    onChange={(event) => {
                      setCvText(event.target.value);
                      setCvPartsResult(null);
                      if (!fileName) {
                        setFormat(
                          detectMarkdown(event.target.value) ? "markdown" : "text",
                        );
                      }
                    }}
                    placeholder="Paste the old CV here, or upload a .md/.txt file."
                    value={cvText}
                  />
                  <p className="field-hint">
                    Format detected as{" "}
                    {format === "markdown" ? "Markdown" : "plain text"}.
                  </p>
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="instructions">
                    Update instructions
                  </label>
                  <textarea
                    className="textarea"
                    id="instructions"
                    onChange={(event) => setInstructions(event.target.value)}
                    placeholder="Example: Add my latest role, make the summary more backend-focused, and keep the result truthful."
                    value={instructions}
                  />
                </div>

                <div className="actions">
                  <button
                    className="button button-primary"
                    disabled={!canRefine || isLoading}
                    onClick={refineCv}
                    type="button"
                  >
                    {isLoading ? "Refining..." : "Refine CV"}
                  </button>
                  <p
                    className={`status-line ${
                      statusKind === "error"
                        ? "status-error"
                        : statusKind === "success"
                          ? "status-success"
                          : ""
                    }`}
                    role="status"
                  >
                    {status}
                  </p>
                </div>
              </div>

              <div className="panel" aria-label="CV output panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Output</h2>
                    <p className="panel-subtitle">
                      The refined CV keeps the input format.
                    </p>
                  </div>
                </div>

                {result ? (
                  <>
                    {result.changeSummary.length > 0 && (
                      <ol className="summary-list" aria-label="Change summary">
                        {result.changeSummary.map((change) => (
                          <li key={change}>{change}</li>
                        ))}
                      </ol>
                    )}
                    {result.cacheRelativePath && (
                      <p className="field-hint">
                        Saved version {result.cacheVersion} to{" "}
                        <span className="mono">{result.cacheRelativePath}</span>.
                        Pipeline pointer:{" "}
                        <span className="mono">{result.cacheLatestPath}</span>
                      </p>
                    )}
                    <textarea
                      className="textarea output-textarea mono"
                      readOnly
                      value={result.refinedCv}
                    />
                    <div className="output-toolbar">
                      <button
                        className="button button-secondary"
                        onClick={copyResult}
                        type="button"
                      >
                        Copy
                      </button>
                      <button
                        className="button button-secondary"
                        onClick={downloadResult}
                        type="button"
                      >
                        Download .{outputExtension}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="empty-output">
                    Refined CV and change summary will appear here after you run
                    the request.
                  </div>
                )}
              </div>
            </div>
          ) : activePipeline === "components" ? (
            <div
              className="panel components-panel"
              aria-label="CV components panel"
              key="components"
            >
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">CV to components</h2>
                  <p className="panel-subtitle">
                    Source: .cache/refinements/latest.json
                  </p>
                </div>
                <button
                  className="button button-primary"
                  disabled={isSplittingCv}
                  onClick={splitLatestCvIntoParts}
                  type="button"
                >
                  {isSplittingCv ? "Splitting..." : "Run step"}
                </button>
              </div>

              <p
                className={`status-line ${
                  statusKind === "error"
                    ? "status-error"
                    : statusKind === "success"
                      ? "status-success"
                      : ""
                }`}
                role="status"
              >
                {status}
              </p>

              {cvPartsResult ? (
                <div className="pipeline-result">
                  <ol className="summary-list" aria-label="CV component summary">
                    {cvPartsResult.sectionSummary.map((section) => (
                      <li key={section}>{section}</li>
                    ))}
                  </ol>
                  <p className="field-hint">
                    Saved component version {cvPartsResult.cacheVersion} to{" "}
                    <span className="mono">{cvPartsResult.cacheRelativePath}</span>.
                    Pipeline pointer:{" "}
                    <span className="mono">{cvPartsResult.cacheLatestPath}</span>
                  </p>
                  <textarea
                    className="textarea components-textarea mono"
                    readOnly
                    value={JSON.stringify(cvPartsResult.cvParts, null, 2)}
                  />
                </div>
              ) : (
                <div className="empty-output components-empty">
                  Components JSON will appear here after this step runs.
                </div>
              )}
            </div>
          ) : activePipeline === "template" ? (
            <div className="template-workspace" key="template">
              <div className="panel" aria-label="Template instructions panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Template designer</h2>
                    <p className="panel-subtitle">
                      Design from schema and sample data, then render local CV parts.
                    </p>
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="template-instructions">
                    Instructions
                  </label>
                  <textarea
                    className="textarea template-chat-textarea"
                    id="template-instructions"
                    onChange={(event) => setTemplateInstructions(event.target.value)}
                    placeholder="Example: Make it executive, compact, readable, with a left rail for contact and skills."
                    value={templateInstructions}
                  />
                  <p className="field-hint">
                    This step will use the committed fake sample shape, not the
                    full real CV JSON, for template generation.
                  </p>
                </div>

                <div className="actions">
                  <button
                    className="button button-primary"
                    disabled={!canGenerateTemplate || isGeneratingTemplate}
                    onClick={generateTemplate}
                    type="button"
                  >
                    {isGeneratingTemplate ? "Generating..." : "Generate template"}
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={isLoadingTemplate}
                    onClick={loadExistingTemplate}
                    type="button"
                  >
                    {isLoadingTemplate ? "Loading..." : "Load existing"}
                  </button>
                  <p
                    className={`status-line ${
                      statusKind === "error"
                        ? "status-error"
                        : statusKind === "success"
                          ? "status-success"
                          : ""
                    }`}
                    role="status"
                  >
                    {status}
                  </p>
                </div>
              </div>

              <div className="panel template-preview-panel" aria-label="Template preview">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Preview</h2>
                    <p className="panel-subtitle">
                      Will render `.cache/cv-parts/latest.json` locally.
                    </p>
                  </div>
                </div>

                {templateDesignResult ? (
                  <div className="template-result">
                    <iframe
                      className="template-preview-frame"
                      sandbox=""
                      srcDoc={buildTemplatePreviewSrcDoc(templateDesignResult)}
                      title="Rendered resume template preview"
                    />
                    <div className="template-result-header">
                      <div>
                        <h3>{templateDesignResult.templateDesign.templateName}</h3>
                        <p className="field-hint">
                          Saved template version{" "}
                          {templateDesignResult.cacheVersion} to{" "}
                          <span className="mono">
                            {templateDesignResult.cacheRelativePath}
                          </span>
                          .
                        </p>
                      </div>
                      <a
                        className="button button-secondary"
                        href="/template-preview"
                        target="_blank"
                      >
                        Open template preview
                      </a>
                    </div>
                    <ol className="summary-list" aria-label="Template design summary">
                      {templateDesignResult.templateDesign.designSummary.map(
                        (summary) => (
                          <li key={summary}>{summary}</li>
                        ),
                      )}
                    </ol>
                    <div className="template-spec-grid">
                      <div>
                        <h4>Layout</h4>
                        <p>{templateDesignResult.templateDesign.layout.type}</p>
                        <p className="field-hint">
                          {templateDesignResult.templateDesign.layout.sectionOrder.join(
                            " -> ",
                          )}
                        </p>
                      </div>
                      <div>
                        <h4>Style</h4>
                        <p>{templateDesignResult.templateDesign.visualStyle.tone}</p>
                        <p className="field-hint">
                          {templateDesignResult.templateDesign.visualStyle.colorPalette.join(
                            ", ",
                          )}
                        </p>
                      </div>
                    </div>
                    <textarea
                      className="textarea template-css-textarea mono"
                      readOnly
                      value={[
                        "<!-- Preview HTML -->",
                        templateDesignResult.templateDesign.htmlPreview,
                        "",
                        "/* CSS */",
                        templateDesignResult.templateDesign.css,
                      ].join("\n")}
                    />
                  </div>
                ) : (
                  <div className="resume-preview-placeholder">
                    <div className="preview-rail">
                      <div className="preview-line preview-line-short" />
                      <div className="preview-line" />
                      <div className="preview-line" />
                      <div className="preview-skill" />
                      <div className="preview-skill" />
                      <div className="preview-skill" />
                    </div>
                    <div className="preview-main">
                      <div className="preview-title" />
                      <div className="preview-line" />
                      <div className="preview-line" />
                      <div className="preview-section" />
                      <div className="preview-line" />
                      <div className="preview-line" />
                      <div className="preview-section" />
                      <div className="preview-line" />
                      <div className="preview-line preview-line-short" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : activePipeline === "cvPreview" ? (
            <div
              className="panel cv-preview-panel"
              aria-label="Latest CV preview"
              key="cv-preview"
            >
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">CV preview</h2>
                  <p className="panel-subtitle">
                    Latest CV components rendered with the latest saved template.
                  </p>
                </div>
                <a
                  className="button button-secondary"
                  href="/cv-preview"
                  target="_blank"
                >
                  Open in browser
                </a>
              </div>
              <iframe
                className="cv-preview-frame"
                src="/cv-preview"
                title="Latest rendered CV preview"
              />
            </div>
          ) : (
            <div
              className="personalization-workspace"
              aria-label="Personalization panel"
              key="personalization"
            >
              <div className="panel" aria-label="Job posting and instructions">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Personalization</h2>
                    <p className="panel-subtitle">
                      Add optional context, then target CV parts to a pasted job.
                    </p>
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="job-url">
                    Job URL reference
                  </label>
                  <input
                    className="text-input mono"
                    id="job-url"
                    onChange={(event) => setJobUrl(event.target.value)}
                    placeholder="Optional URL for traceability"
                    type="url"
                    value={jobUrl}
                  />
                  <p className="field-hint">
                    This is saved as metadata only. Paste the job text in the
                    output panel.
                  </p>
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="job-markdown">
                    Job description
                  </label>
                  <textarea
                    className="textarea job-markdown-textarea"
                    id="job-markdown"
                    onChange={(event) => {
                      setJobMarkdown(event.target.value);
                      setPersonalizeResult(null);
                      setPersonalizationJson("");
                    }}
                    placeholder="Paste the job description here."
                    value={jobMarkdown}
                  />
                  <p className="field-hint">
                    Needs at least 12 words before personalization runs.
                  </p>
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="fit-instructions">
                    Fit instructions
                  </label>
                  <textarea
                    className="textarea compact-textarea"
                    id="fit-instructions"
                    onChange={(event) => setFitInstructions(event.target.value)}
                    placeholder="Optional: emphasize agentic AI, keep leadership compact, ignore relocation wording."
                    value={fitInstructions}
                  />
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="style-instructions">
                    Style instructions
                  </label>
                  <textarea
                    className="textarea compact-textarea"
                    id="style-instructions"
                    onChange={(event) => setStyleInstructions(event.target.value)}
                    placeholder="Optional: only use this if you want to change the saved CV style."
                    value={styleInstructions}
                  />
                </div>

                <div className="actions">
                  <button
                    className="button button-primary"
                    disabled={!canPersonalize || isPersonalizing}
                    onClick={personalizeCv}
                    type="button"
                  >
                    {isPersonalizing ? "Personalizing..." : "Personalize"}
                  </button>
                  <p
                    className={`status-line ${
                      statusKind === "error"
                        ? "status-error"
                        : statusKind === "success"
                          ? "status-success"
                      : ""
                    }`}
                    role="status"
                  >
                    {status}
                  </p>
                </div>
              </div>

              <div className="panel" aria-label="Personalization output">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Output</h2>
                    <p className="panel-subtitle">
                      Load saved bundles, edit generated JSON, or create HTML.
                    </p>
                  </div>
                </div>

                {personalizeResult ? (
                  <div className="personalization-summary">
                    <p className="role-summary">
                      {personalizeResult.bundle.roleSummary}
                    </p>
                    <div className="decision-grid">
                      {personalizeResult.bundle.partDecisions.map((decision) => (
                        <div
                          className={`decision-pill decision-${decision.decision}`}
                          key={`${decision.section}-${decision.decision}`}
                        >
                          <strong>{decision.section}</strong>
                          <span>{decision.decision}</span>
                        </div>
                      ))}
                    </div>
                    {personalizeResult.bundle.warnings.length > 0 && (
                      <ol className="summary-list" aria-label="Warnings">
                        {personalizeResult.bundle.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ol>
                    )}
                  </div>
                ) : null}

                <div className="load-saved-row">
                  <select
                    className="text-input"
                    onChange={(event) =>
                      setSelectedPersonalizationFile(event.target.value)
                    }
                    value={selectedPersonalizationFile}
                  >
                    <option value="">Choose saved bundle</option>
                    {savedPersonalizations.map((item) => (
                      <option key={item.fileName} value={item.fileName}>
                        {item.fileName}
                      </option>
                    ))}
                  </select>
                  <button
                    className="button button-secondary"
                    disabled={isLoadingPersonalizationList}
                    onClick={loadSavedPersonalizationList}
                    type="button"
                  >
                    {isLoadingPersonalizationList ? "Refreshing..." : "Refresh"}
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={!canLoadPersonalization || isLoadingPersonalization}
                    onClick={loadSavedPersonalization}
                    type="button"
                  >
                    {isLoadingPersonalization ? "Loading..." : "Load"}
                  </button>
                </div>

                <textarea
                  className="textarea personalization-output-textarea mono"
                  onChange={(event) => setPersonalizationJson(event.target.value)}
                  placeholder="Personalized bundle JSON will appear here."
                  value={personalizationJson}
                />

                <div className="save-as-row">
                  <input
                    className="text-input"
                    onChange={(event) => setSaveName(event.target.value)}
                    placeholder="Save as name"
                    type="text"
                    value={saveName}
                  />
                  <button
                    className="button button-secondary"
                    disabled={!canSavePersonalization || isSavingPersonalization}
                    onClick={savePersonalizationAs}
                    type="button"
                  >
                    {isSavingPersonalization ? "Saving..." : "Save as"}
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={!canCreateHtml}
                    onClick={createPersonalizationHtml}
                    type="button"
                  >
                    Create HTML
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function buildDownloadName(fileName: string, extension: string) {
  const baseName = fileName
    ? fileName.replace(/\.[^/.]+$/, "")
    : "resume";

  return `${baseName}-refined.${extension}`;
}

function buildJsonDownloadName(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${slug || "personalization"}.json`;
}

function buildHtmlDownloadName(value: string) {
  return buildJsonDownloadName(value).replace(/\.json$/, ".html");
}

function buildPersonalizationHtml(bundle: PersonalizationBundle) {
  const style = asTemplateStyle(bundle.style);
  const cvParts = asCvParts(bundle.personalizedCvParts);

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(bundle.saveName || "Personalized CV")}</title>`,
    "<style>",
    [
      "body { margin: 0; background: #f3f0e9; font-family: Arial, sans-serif; }",
      "@media screen { body { padding: 24px; } }",
    ].join("\n"),
    style.css ?? "",
    "</style>",
    "</head>",
    "<body>",
    buildCvHtml(style, cvParts),
    "</body>",
    "</html>",
  ].join("\n");
}

function asTemplateStyle(value: unknown): TemplateStyleForRender {
  return value && typeof value === "object"
    ? (value as TemplateStyleForRender)
    : {};
}

function asCvParts(value: unknown): CvPartsForRender {
  return value && typeof value === "object" ? (value as CvPartsForRender) : {};
}

function buildCvHtml(template: TemplateStyleForRender, cvParts: CvPartsForRender) {
  const leftRailSections = template.layout?.leftRailSections ?? [
    "contact",
    "technicalSkills",
    "education",
  ];
  const mainSections = template.layout?.mainSections ?? [
    "profile",
    "professionalExperience",
    "additionalExperience",
    "honorsAwards",
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

function renderCvSection(section: string, cvParts: CvPartsForRender) {
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
            `<p class="profile-text">${escapeHtml(stripMarkdown(cvParts.profile.rawText))}</p>`,
            "</section>",
          ].join("")
        : "";
    case "professionalExperience":
      return renderExperience(cvParts.professionalExperience);
    case "additionalExperience":
      return renderBlocks("Additional Experience", "exp", cvParts.additionalExperience);
    case "honorsAwards":
      return renderBlocks("Honors & Awards", "honor", cvParts.honorsAwards);
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

function renderContact(contact: CvPartsForRender["contact"]) {
  if (!contact) {
    return "";
  }

  return [
    '<section class="contact-block">',
    contact.name ? `<h1 class="contact-name">${escapeHtml(contact.name)}</h1>` : "",
    contact.email ? `<p class="contact-item">${escapeHtml(contact.email)}</p>` : "",
    contact.phone ? `<p class="contact-item">${escapeHtml(contact.phone)}</p>` : "",
    ...(contact.links ?? []).map((link) =>
      link.url
        ? `<p class="contact-item"><a href="${escapeAttribute(link.url)}">${escapeHtml(
            link.label ?? link.url,
          )}</a></p>`
        : "",
    ),
    !contact.name && contact.rawText
      ? `<p class="contact-item">${escapeHtml(stripMarkdown(contact.rawText))}</p>`
      : "",
    "</section>",
  ].join("");
}

function renderSkills(skills: CvPartsForRender["technicalSkills"]) {
  if (!skills?.groups?.length) {
    return skills?.rawText
      ? `<section class="skills-block"><div class="section-heading">Skills</div><p>${escapeHtml(
          stripMarkdown(skills.rawText),
        )}</p></section>`
      : "";
  }

  return [
    '<section class="skills-block">',
    '<div class="section-heading">Skills</div>',
    ...skills.groups.map((group) =>
      [
        '<div class="skill-group">',
        group.label ? `<div class="skill-label">${escapeHtml(group.label)}</div>` : "",
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
        block.role ? `<span class="exp-role">${escapeHtml(block.role)}</span>` : "",
        block.organization
          ? `<span class="exp-org">${escapeHtml(block.organization)}</span>`
          : "",
        "</div>",
        block.dates ? `<span class="exp-dates">${escapeHtml(block.dates)}</span>` : "",
        "</div>",
        renderItems(block.items),
        !block.items?.length && block.rawText
          ? `<p>${escapeHtml(stripMarkdown(block.rawText))}</p>`
          : "",
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

  return title
    ? `<span class="${classPrefix}-title">${escapeHtml(title)}</span>`
    : "";
}

function renderCustomSections(sections: CvPartsForRender["customSections"]) {
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

function detectMarkdown(value: string) {
  return /(^|\n)\s{0,3}(#{1,6}\s|\* |- |\d+\. |\[.+\]\(.+\)|```)/.test(value);
}

function hasEnoughJobText(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length >= 12;
}

function buildTemplatePreviewSrcDoc(result: TemplateDesignResult) {
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
      ".resume-template { min-height: auto !important; }",
      "@media screen { body { padding: 18px; } }",
    ].join("\n"),
    result.templateDesign.css,
    "</style>",
    "</head>",
    "<body>",
    result.templateDesign.htmlPreview,
    "</body>",
    "</html>",
  ].join("\n");
}
