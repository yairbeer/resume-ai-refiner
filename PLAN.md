# Resume AI Refiner Plan

## Goal

Build a personal CV optimization pipeline.

The final workflow should accept a job link plus optional user instructions, read the job posting, use the user's CV history, and produce a targeted CV for that job. It should also optionally generate a cover letter and support PDF export.

The product should stay practical and pipeline-oriented before becoming a polished resume builder.

## Current State

The first MVP is working:

1. User uploads or pastes a stale CV.
2. User writes update instructions.
3. Claude refines the CV.
4. Output keeps the same format as input: Markdown in, Markdown out; plain text in, plain text out.
5. Refined output is saved into an ignored local cache.

Implemented files:

- Main UI: `app/page.tsx`.
- API route: `app/api/refine/route.ts`.
- Provider: Anthropic Messages API.
- Default model: `claude-sonnet-4-6`.
- Cache pointer: `.cache/refinements/latest.json`.
- Versioned outputs: `.cache/refinements/versions/`.

Verified:

- Real Claude refinement works.
- `.cache/refinements/latest.json` is created correctly.
- `npm.cmd run lint` passes.
- `npm.cmd run build` passes.

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

## Important Decisions

- Do not save the original/stale CV by default.
- Save refined outputs in `.cache`, which is ignored by git.
- Use versioned outputs instead of overwriting.
- Use `latest.json` as the stable pipeline handoff pointer.
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

Status: next.

Use an LLM to split the latest refined CV into structured CV parts.

Expected sections:

- contact
- profile / summary
- technical skills
- professional experience
- education
- projects, if present
- publications, if present
- certifications, if present
- other custom sections

Output should be saved to cache, likely as JSON:

```txt
.cache/cv-parts/latest.json
.cache/cv-parts/versions/cv-parts-v0001.json
```

The structured representation should preserve original text, not just summaries. This becomes the source material for targeted CV generation.

Open design question:

- Should each job/role/bullet become an object, or should the first split keep larger section-level blocks?

Preferred first approach:

- Start with section-level blocks.
- Add deeper structure only where it helps generation.

### 3. Create Unique HTML Template

Status: planned.

Create an HTML/CSS resume template that can render the structured CV.

Goals:

- Make the CV visually unique.
- Keep layout professional and readable.
- Support print/PDF export.
- Keep design separate from CV content.

Likely artifacts:

```txt
templates/resume-template.html
templates/resume.css
```

or React/Next rendering components if that fits better later.

Important:

- The template should not lock the content to one exact CV length.
- It should handle section omission gracefully.
- It should be printable with browser print-to-PDF as a manual first export path.

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

1. Build the CV splitter that reads `.cache/refinements/latest.json`.
2. Save structured CV parts under `.cache/cv-parts/`.
3. Decide the first JSON schema for CV parts.
4. Create the first HTML/CSS resume template.
5. Render structured CV parts into the template.
6. Add job-link input and optional instructions.
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
