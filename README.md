# Resume AI Refiner

Local-first CV pipeline for refining a source CV, splitting it into structured parts, designing a resume template, previewing the rendered CV, and creating job-specific personalized CV bundles.

The app is built as a Next.js local tool. Real CV data and generated outputs stay in the local ignored `.cache/` folder unless you explicitly download an artifact.

## Run Locally

```powershell
npm.cmd install
npm.cmd run dev
```

Open:

```txt
http://localhost:3000
```

Set `ANTHROPIC_API_KEY` in `.env.local` or in the environment used by the dev server. `ANTHROPIC_MODEL` is optional and defaults to `claude-sonnet-4-6`. `ANTHROPIC_MAX_TOKENS` is optional and defaults to `20000`.

API route logs appear in the terminal running the dev server. If a model route returns a parse-related `502`, the terminal logs include model metadata and a short raw response preview.

## Full Flow

The app uses a left-side pipeline with one active workspace at a time.

### 01 Refine CV

- Upload a `.md`, `.markdown`, or `.txt` CV, or paste the CV manually.
- Add update instructions.
- Claude refines the complete CV without inventing facts.
- Output keeps the same format as the input.
- The refined CV can be copied or downloaded.
- Each refined result is saved under `.cache/refinements/versions/`.
- `.cache/refinements/latest.json` points to the newest refined CV for downstream steps.

### 02 CV to Components

- Reads `.cache/refinements/latest.json`.
- Loads the referenced refined CV.
- Uses a forced `return_cv_parts` tool call.
- Saves structured CV parts under `.cache/cv-parts/versions/`.
- `.cache/cv-parts/latest.json` points to the newest structured CV parts.
- The parts object preserves original section text and keeps optional sections like patents, publications, honors, and additional experience when present.
- A standalone `<new_page>` line in the refined CV creates `pageBreakBefore: true` on the next structured component. It can be placed between jobs, skill groups, education entries, patents, publications, or custom sections.

### 03 Template Designer

- Uses template instructions and a committed fake sample CV shape.
- Does not send the full real CV parts to the template-design prompt.
- Generates a saved template design with layout, visual style, HTML preview, CSS, and implementation notes.
- Saves template versions under `.cache/templates/versions/`.
- `.cache/templates/latest.json` points to the newest template.
- Supports loading the latest saved template and opening the standalone template preview at `/template-preview`.

### 04 CV Preview

- Reads `.cache/cv-parts/latest.json`.
- Reads `.cache/templates/latest.json`.
- Renders the latest real CV parts through the latest saved template.
- The preview is available in the app and at `/cv-preview`.
- When the CV parts contain `pageBreakBefore` markers, the preview renders separate A4 pages in the browser and preserves the same page boundaries when printed or exported to PDF.

### 05 Personalization

- Paste the job description manually into the input panel.
- Optionally add a job URL reference for traceability.
- Optionally add fit instructions for the job-specific CV rewrite.
- Optionally add style instructions only when you want to change the saved CV style.
- The model personalizes CV parts for one specific job posting using the same `return_cv_parts` tool name.
- The prompt requires professional, concise language in the same style as the previous CV, with no invented facts, no AI-sounding phrasing, no em dashes, and no icons.
- The output bundle includes:
  - pasted job description
  - optional URL
  - fit and style instructions
  - source cache paths
  - personalized CV parts
  - saved style data
  - part-level decisions: `changed`, `unchanged`, or `ignored`
  - fit summary and warnings
- `Save as` writes a named JSON bundle under `.cache/personalizations/versions/` and downloads the same JSON.
- This step intentionally does not create `.cache/personalizations/latest.json`.
- Saved personalization bundles can be refreshed, selected, and loaded.
- `Create HTML` downloads a standalone HTML file rendered from the personalized CV parts and saved style data.
- Page-break metadata is preserved during personalization unless the user explicitly asks to change it.

## Manual Page Breaks

Add `<new_page>` on its own line in the Markdown or plain-text CV before running `CV to Components`.

```md
**Example Company: Engineering Manager**
...role content...

<new_page>

**Example Organization: Senior Data Scientist**
...role content...
```

The marker is not shown in the rendered CV. It becomes a page break before the next component, so the page begins with `Example Organization` in this example.

## Cache Contract

The cache is ignored by git and acts as the local handoff between steps.

```txt
.cache/refinements/latest.json
.cache/refinements/versions/refined-cv-v0001.md
.cache/refinements/versions/refined-cv-v0002.txt

.cache/cv-parts/latest.json
.cache/cv-parts/versions/cv-parts-v0001.json

.cache/templates/latest.json
.cache/templates/versions/template-design-v0001.json

.cache/personalizations/versions/example-role.json
.cache/personalizations/versions/example-role-v0002.json
```

Personalizations are named saves only. They are not treated as a global latest pointer because they are role-specific artifacts.

## Verification

```powershell
npm.cmd run lint
npm.cmd run build
```

`next build` may update `next-env.d.ts` between dev and production route type imports. Keep the tracked file aligned with the repo state before committing.
