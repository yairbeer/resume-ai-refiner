# Resume AI Refiner Plan

## Goal

Build a personal CV optimization pipeline.

The final workflow should accept a job link plus optional user instructions, read the job posting, use the user's CV history, and produce a targeted CV for that job. It should also optionally generate a cover letter and support PDF export.

The product should stay practical and pipeline-oriented before becoming a polished resume builder.

## Current State

The pipeline shell now has three selectable steps in a left side panel:

1. Refine CV.
2. CV to components.
3. Template designer.

The first MVP refinement step is working:

1. User uploads or pastes a stale CV.
2. User writes update instructions.
3. Claude refines the CV.
4. Output keeps the same format as input: Markdown in, Markdown out; plain text in, plain text out.
5. Refined output is saved into an ignored local cache.

The CV-to-components step is implemented:

1. User selects `CV to components` from the side panel.
2. The main panel shows the component-splitting step.
3. The step reads `.cache/refinements/latest.json`.
4. The step reads the referenced refined CV version.
5. Claude is called with a forced `return_cv_parts` tool schema.
6. The structured JSON is saved into a separate cache object under `.cache/cv-parts/`.

Implemented files:

- Main UI: `app/page.tsx`.
- API route: `app/api/refine/route.ts`.
- API route: `app/api/cv-parts/route.ts`.
- API route: `app/api/template-design/route.ts`.
- CV parts sample fixture: `examples/cv-parts-sample.json`.
- Provider: Anthropic Messages API.
- Default model: `claude-sonnet-4-6`.
- Cache pointer: `.cache/refinements/latest.json`.
- Versioned outputs: `.cache/refinements/versions/`.
- CV parts cache pointer: `.cache/cv-parts/latest.json`.
- CV parts versioned outputs: `.cache/cv-parts/versions/`.
- Template design cache pointer: `.cache/templates/latest.json`.
- Template design versioned outputs: `.cache/templates/versions/`.

Verified:

- Real Claude refinement works.
- `.cache/refinements/latest.json` is created correctly.
- `npm.cmd run lint` passes.
- `npm.cmd run build` passes.
- In-app browser shows the pipeline side panel.
- Selecting `CV to components` swaps the main panel to that step.
- A completed real Claude run for `/api/cv-parts` works.
- `.cache/cv-parts/latest.json` is created from the live UI.
- `Template designer` appears as step 3 in the side panel.
- The `Generate template` action calls a template-design endpoint and saves a design spec under `.cache/templates/`.
- The `Load existing` action loads the latest saved template design from `.cache/templates/latest.json`.
- The template preview panel renders generated HTML/CSS above the template metadata.
- The standalone `/template-preview` route renders the latest saved template in a normal browser tab.
- Existing saved templates without `htmlPreview` render through a class-based fallback preview.

## Cache Contract

The app saves each refined CV as a versioned file:

```txt
.cache/refinements/versions/refined-cv-v0001.md
.cache/refinements/versions/refined-cv-v0002.md
```

Plain text outputs use `.txt`.

The rest of the pipeline should always begin by reading:

```txt
.cache/refinements/latest.json
```

Expected shape:

```json
{
  "version": 1,
  "format": "markdown",
  "path": ".cache/refinements/versions/refined-cv-v0001.md",
  "absolutePath": "C:\\Users\\yaia1\\Documents\\resume-ai-refiner\\.cache\\refinements\\versions\\refined-cv-v0001.md",
  "createdAt": "2026-06-03T00:00:00.000Z"
}
```

Downstream steps should read `latest.json`, then read the file at `path` or `absolutePath`.

The CV-to-components step saves each structured CV object as a versioned JSON file:

```txt
.cache/cv-parts/versions/cv-parts-v0001.json
.cache/cv-parts/versions/cv-parts-v0002.json
```

The latest CV parts pointer is:

```txt
.cache/cv-parts/latest.json
```

Expected latest pointer shape:

```json
{
  "version": 1,
  "path": ".cache/cv-parts/versions/cv-parts-v0001.json",
  "absolutePath": "C:\\Users\\yaia1\\Documents\\resume-ai-refiner\\.cache\\cv-parts\\versions\\cv-parts-v0001.json",
  "sourceRefinement": {
    "version": 1,
    "format": "markdown",
    "path": ".cache/refinements/versions/refined-cv-v0001.md",
    "absolutePath": "C:\\Users\\yaia1\\Documents\\resume-ai-refiner\\.cache\\refinements\\versions\\refined-cv-v0001.md",
    "createdAt": "2026-06-03T00:00:00.000Z"
  },
  "createdAt": "2026-06-05T00:00:00.000Z"
}
```

The template-design step saves each template design spec as a versioned JSON file:

```txt
.cache/templates/versions/template-design-v0001.json
.cache/templates/versions/template-design-v0002.json
```

The latest template pointer is:

```txt
.cache/templates/latest.json
```

Expected versioned CV parts object shape:

```json
{
  "version": 1,
  "createdAt": "2026-06-05T00:00:00.000Z",
  "sourceRefinement": {},
  "cvParts": {},
  "sectionSummary": []
}
```

## Important Decisions

- Do not save the original/stale CV by default.
- Save refined outputs in `.cache`, which is ignored by git.
- Use versioned outputs instead of overwriting.
- Use `latest.json` as the stable pipeline handoff pointer.
- Use a side panel to pick the active pipeline step.
- Show only the selected pipeline step in the main panel.
- Save each pipeline step into its own cache namespace.
- Keep `next-env.d.ts` tracked.
- Keep UI minimal until the pipeline is proven.

## Full Plan

### 1. CV Refinement MVP

Status: done.

Purpose:

- Establish CV input.
- Establish Claude refinement.
- Preserve user-provided facts.
- Save refined output for the pipeline.

### 2. Split CV Into Structured Parts

Status: done.

Use an LLM to split the latest refined CV into structured CV parts.

Expected sections:

- contact
- profile
- technicalSkills
- professionalExperience
- additionalExperience, if present
- patents, if present
- publications, if present
- education
- projects, if present
- certifications, if present
- customSections, for anything that does not fit the known CV sections

Output should be saved to cache, likely as JSON:

```txt
.cache/cv-parts/latest.json
.cache/cv-parts/versions/cv-parts-v0001.json
```

The structured representation should preserve original text, not just summaries. This becomes the source material for targeted CV generation.

The first schema should match the current refined CV:

```json
{
  "contact": {},
  "profile": {},
  "technicalSkills": {},
  "professionalExperience": [],
  "additionalExperience": [],
  "patents": [],
  "publications": [],
  "education": [],
  "customSections": []
}
```

Sections that are not present in the CV, such as projects or certifications, should be omitted rather than generated as empty content.

Open design question:

- Should each job/role/bullet become an object, or should the first split keep larger section-level blocks?

Preferred first approach:

- Start with section-level blocks.
- Add deeper structure only where it helps generation.

Implementation notes:

- UI entry lives in the pipeline side panel as `02 CV to components`.
- Main panel for this step has a `Run step` button.
- API route is `app/api/cv-parts/route.ts`.
- The route reads `.cache/refinements/latest.json`.
- The route only allows reading versioned refined CV filenames matching `refined-cv-v0001.md` / `.txt` style names.
- The route forces Claude to call `return_cv_parts`.
- The first schema includes `contact`, `profile`, `technicalSkills`, `professionalExperience`, `additionalExperience`, `patents`, `publications`, `education`, and `customSections`.
- The system prompt includes a compact fake CV-parts example so the model has an output target without using real CV facts as examples.

### 3. Create Unique React Resume Template

Status: partially implemented.

Create a React-based HTML resume template that can render the structured CV.

Goals:

- Make the CV visually unique.
- Keep layout professional and readable.
- Support print/PDF export.
- Keep design separate from CV content.
- Avoid sending the full real CV JSON to the template-design LLM when schema and sample data are enough.
- Use short fake sample data for layout decisions, then render the real CV parts locally.

Likely artifacts:

```txt
examples/cv-parts-sample.json
components/resume-template/
components/resume-template/ResumeTemplate.tsx
components/resume-template/resume-template.css
```

The template designer should be one user-facing pipeline step:

- Left: chat/instructions panel.
- Right: live preview rendered from local data.
- LLM input: system prompt, current user instructions, schema, short fake sample data, and current template files if they exist.
- Current LLM output: template design spec, renderable HTML preview, and scoped CSS.
- Local renderer input: real `.cache/cv-parts/latest.json`.

Important:

- The template should not lock the content to one exact CV length.
- It should handle section omission gracefully.
- It should be printable with browser print-to-PDF as a manual first export path.
- The LLM should not need the full real CV data for pure template design unless a later feature explicitly requires content-aware fitting.

Implemented:

- UI entry lives in the pipeline side panel as `03 Template designer`.
- Main panel has instructions on the left and design preview/spec output on the right.
- Main panel supports loading the latest existing template design.
- The preview panel renders the HTML preview in a sandboxed iframe above the metadata.
- The latest rendered template preview can be opened directly at `/template-preview`.
- The in-app preview and standalone `/template-preview` route share the same class-based fallback structure for older saved template designs.
- API route is `app/api/template-design/route.ts`.
- The route sends `examples/cv-parts-sample.json`, not the full real CV JSON.
- The route forces Claude to call `return_template_design`.
- Generated design specs are saved under `.cache/templates/`.

Still needed:

- Convert the saved design spec into actual React renderer components.
- Render real local `.cache/cv-parts/latest.json` through the selected template instead of fake preview content.
- Decide whether future template iterations should edit generated source files or keep template specs as data.

### 4. Job-Link Optimized CV Generator

Status: planned.

This is the core product step.

Input:

- job link
- optional user instructions
- latest structured CV parts
- optional toggle: generate cover letter

Process:

1. Read the job posting from the link.
2. Extract job requirements, responsibilities, keywords, seniority, and tone.
3. Compare the job against the structured CV parts.
4. Generate an optimized CV for that job.
5. Keep all claims truthful and grounded in the CV source material.
6. Optionally generate a cover letter.

Output:

```txt
.cache/job-target/latest.json
.cache/optimized-cv/latest.json
.cache/optimized-cv/versions/optimized-cv-v0001.json
.cache/cover-letter/versions/cover-letter-v0001.md
```

The optimized CV should be renderable through the HTML template.

Important behavior:

- Do not invent experience.
- Prefer reordering, emphasis, wording, and selection over fabrication.
- Keep a change summary or rationale for what was optimized.
- Preserve enough traceability to know which CV parts were used.

### 5. Cover Letter Toggle

Status: planned.

Add a toggle to generate a cover letter together with the optimized CV.

Behavior:

- Off by default unless the user asks otherwise.
- Uses the job posting and the same CV source material.
- Should match the role and company.
- Should avoid fake enthusiasm, false personal connections, or claims not supported by the CV.

### 6. PDF Export

Status: planned.

First version can be manual.

Manual approach:

1. Render optimized CV as HTML.
2. User opens preview.
3. User prints to PDF from the browser.

Later automated approach:

- Use Playwright or another renderer to export PDF.
- Save generated PDF to cache.

Possible output:

```txt
.cache/exports/latest.pdf
.cache/exports/versions/cv-v0001.pdf
```

## Near-Term Next Steps

1. Inspect the generated component JSON against the current refined CV.
2. Adjust the component schema if the first real output is too shallow or too nested.
3. Inspect the rendered template preview and generated `.cache/templates/latest.json`.
4. Convert the generated template design spec/preview into a React renderer.
5. Render structured CV parts into the template.
6. Add job-link input and optional instructions as another side-panel pipeline step.
7. Add optional cover letter toggle.
8. Add manual PDF export path from the rendered HTML page.

## Development Notes

Run locally:

```powershell
npm.cmd run dev
```

Verify:

```powershell
npm.cmd run lint
npm.cmd run build
```

When changing API routes, restart the dev server if hot reload behaves strangely:

```powershell
Ctrl+C
npm.cmd run dev
```
