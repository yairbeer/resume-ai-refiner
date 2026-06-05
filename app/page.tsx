"use client";

import { ChangeEvent, useMemo, useState } from "react";

type CvFormat = "markdown" | "text";
type PipelineStep = "refine" | "components";

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

const markdownExtensions = new Set(["md", "markdown"]);

export default function Home() {
  const [activePipeline, setActivePipeline] = useState<PipelineStep>("refine");
  const [cvText, setCvText] = useState("");
  const [instructions, setInstructions] = useState("");
  const [fileName, setFileName] = useState("");
  const [format, setFormat] = useState<CvFormat>("text");
  const [result, setResult] = useState<RefineResult | null>(null);
  const [cvPartsResult, setCvPartsResult] = useState<CvPartsResult | null>(null);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSplittingCv, setIsSplittingCv] = useState(false);

  const canRefine = cvText.trim().length > 0 && instructions.trim().length > 0;
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
          ) : (
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
