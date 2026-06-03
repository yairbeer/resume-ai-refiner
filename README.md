# Resume AI Refiner

First MVP for refining a stale CV from Markdown or plain text.

The app does not store old or refined CVs. It reads an uploaded `.md`, `.markdown`, or `.txt` file in the browser, sends the text and update instructions to an API route, and shows the refined CV in the same format for copy or download.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `ANTHROPIC_API_KEY` in `.env.local`. `ANTHROPIC_MODEL` is optional and defaults to `claude-sonnet-4-6`. `ANTHROPIC_MAX_TOKENS` is optional and defaults to `20000`.

API route logs appear in the terminal running `npm run dev`. If the app returns a parse-related `502`, that terminal will show Claude metadata, output length, and a short raw response preview.

## MVP behavior

- Upload `.md`, `.markdown`, or `.txt`, or paste the CV manually.
- Add update instructions.
- Refine the full CV without inventing facts.
- Preserve Markdown or plain text format.
- Show a short change summary.
- Save each refined output as a version under `.cache/refinements/versions/`.
- Update `.cache/refinements/latest.json` so downstream pipeline steps can always read the newest version.
- Copy or download the refined CV.
