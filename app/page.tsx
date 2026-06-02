"use client";

import { ChangeEvent, useMemo, useState } from "react";

type CvFormat = "markdown" | "text";

type RefineResult = {
  refinedCv: string;
  changeSummary: string[];
};

const markdownExtensions = new Set(["md", "markdown"]);

export default function Home() {
  const [cvText, setCvText] = useState("");
  const [instructions, setInstructions] = useState("");
  const [fileName, setFileName] = useState("");
  const [format, setFormat] = useState<CvFormat>("text");
  const [result, setResult] = useState<RefineResult | null>(null);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [isLoading, setIsLoading] = useState(false);

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
        body: JSON.stringify({ cvText, instructions, format }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Refinement failed.");
      }

      setResult(data as RefineResult);
      setStatus("Refined CV is ready.");
      setStatusKind("success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Refinement failed.");
      setStatusKind("error");
    } finally {
      setIsLoading(false);
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
          <p>Upload or paste a stale CV, describe the update, get the same format back.</p>
        </div>
        <p className="privacy-note">
          V1 does not save CVs in this app. Your text is only sent for the refine
          request and then shown here for copy or download.
        </p>
      </header>

      <section className="workspace">
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
                {fileName ? `${fileName} -> output .${outputExtension}` : ".md or .txt"}
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
                if (!fileName) {
                  setFormat(detectMarkdown(event.target.value) ? "markdown" : "text");
                }
              }}
              placeholder="Paste the old CV here, or upload a .md/.txt file."
              value={cvText}
            />
            <p className="field-hint">
              Format detected as {format === "markdown" ? "Markdown" : "plain text"}.
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
              <p className="panel-subtitle">The refined CV keeps the input format.</p>
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
              Refined CV and change summary will appear here after you run the
              request.
            </div>
          )}
        </div>
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
