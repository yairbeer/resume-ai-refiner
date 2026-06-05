"use client";

import { ChangeEvent, useMemo, useState } from "react";

type CvFormat = "markdown" | "text";
type PipelineStep = "refine" | "components" | "template";

type RefineResult = {
  refinedCv: string;
  changeSummary: string[];
  cacheFilePath?: string;
  cacheRelativePath?: string;
  cacheVersion?: number;
  cacheLatestPath?: string;
};

type CvPartsResult = {
  cvParts: unknown;
  sectionSummary: string[];
  cacheFilePath: string;
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
  cacheFilePath: string;
  cacheRelativePath: string;
  cacheVersion: number;
  cacheLatestPath: string;
};

const markdownExtensions = new Set(["md", "markdown"]);

export default function Home() {
  const [activePipeline, setActivePipeline] = useState<PipelineStep>("refine");
  const [cvText, setCvText] = useState("");
  const [instructions, setInstructions] = useState("");
  const [fileName, setFileName] = useState("");
  const [format, setFormat] = useState<CvFormat>("text");
  const [templateInstructions, setTemplateInstructions] = useState("");
  const [result, setResult] = useState<RefineResult | null>(null);
  const [cvPartsResult, setCvPartsResult] = useState<CvPartsResult | null>(null);
  const [templateDesignResult, setTemplateDesignResult] =
    useState<TemplateDesignResult | null>(null);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSplittingCv, setIsSplittingCv] = useState(false);
  const [isGeneratingTemplate, setIsGeneratingTemplate] = useState(false);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);

  const canRefine = cvText.trim().length > 0 && instructions.trim().length > 0;
  const canGenerateTemplate = templateInstructions.trim().length > 0;
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
        </aside>

        <section className="main-panel" aria-label="Selected pipeline step">
          {activePipeline === "refine" ? (
            <div className="workspace">
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
                    {result.cacheFilePath && (
                      <p className="field-hint">
                        Saved version {result.cacheVersion} to{" "}
                        <span className="mono">{result.cacheFilePath}</span>.
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
            <div className="panel components-panel" aria-label="CV components panel">
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
                    <span className="mono">{cvPartsResult.cacheFilePath}</span>.
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
          ) : (
            <div className="template-workspace">
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
                            {templateDesignResult.cacheFilePath}
                          </span>
                          .
                        </p>
                      </div>
                      <a
                        className="button button-secondary"
                        href="/template-preview"
                        target="_blank"
                      >
                        Open rendered CV
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

function detectMarkdown(value: string) {
  return /(^|\n)\s{0,3}(#{1,6}\s|\* |- |\d+\. |\[.+\]\(.+\)|```)/.test(value);
}

function buildTemplatePreviewSrcDoc(result: TemplateDesignResult) {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
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
