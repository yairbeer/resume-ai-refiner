import { NextResponse } from "next/server";

type JobPostingRequest = {
  url?: string;
};

const MAX_RESPONSE_CHARS = 600_000;

export async function POST(request: Request) {
  const body = (await request.json()) as JobPostingRequest;
  const urlResult = parseJobUrl(body.url);

  if (!urlResult.ok) {
    return NextResponse.json({ error: urlResult.error }, { status: 400 });
  }

  let response: Response;

  try {
    response = await fetch(urlResult.url, {
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,text/markdown,text/plain;q=0.8,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      },
      redirect: "follow",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Could not fetch job URL: ${error.message}`
            : "Could not fetch job URL.",
      },
      { status: 502 },
    );
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: `Job URL returned HTTP ${response.status}.` },
      { status: 502 },
    );
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!isSupportedContentType(contentType)) {
    return NextResponse.json(
      { error: `Unsupported job content type: ${contentType || "unknown"}.` },
      { status: 415 },
    );
  }

  const rawText = (await response.text()).slice(0, MAX_RESPONSE_CHARS);
  const parsed =
    contentType.includes("html") || looksLikeHtml(rawText)
      ? htmlToMarkdown(rawText)
      : normalizePlainText(rawText);

  if (!parsed.markdown.trim()) {
    return NextResponse.json(
      { error: "Fetched job page did not contain readable text." },
      { status: 422 },
    );
  }

  return NextResponse.json({
    url: response.url || urlResult.url,
    fetchedAt: new Date().toISOString(),
    markdown: parsed.markdown,
    title: parsed.title,
    sourceContentType: contentType,
  });
}

function parseJobUrl(value: string | undefined) {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return { ok: false as const, error: "Add a job URL before fetching." };
  }

  try {
    const parsed = new URL(trimmed);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { ok: false as const, error: "Use an http or https job URL." };
    }

    return { ok: true as const, url: parsed.toString() };
  } catch {
    return { ok: false as const, error: "Enter a valid job URL." };
  }
}

function isSupportedContentType(contentType: string) {
  const lower = contentType.toLowerCase();

  return (
    !lower ||
    lower.includes("text/html") ||
    lower.includes("application/xhtml") ||
    lower.includes("text/plain") ||
    lower.includes("text/markdown") ||
    lower.includes("application/xml")
  );
}

function looksLikeHtml(value: string) {
  return /<(html|head|body|main|article|section|div|p|h1|h2)\b/i.test(value);
}

function htmlToMarkdown(html: string) {
  const title = decodeHtml(
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "",
  ).trim();
  const body =
    /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ??
    /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ??
    html;
  const withoutNoise = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const markdown = withoutNoise
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|main|header|footer|ul|ol)>/gi, "\n\n")
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n\n")
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n#### $1\n\n")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<[^>]+>/g, " ");

  return {
    title,
    markdown: normalizeMarkdown(decodeHtml(markdown)),
  };
}

function normalizePlainText(value: string) {
  return {
    title: undefined,
    markdown: normalizeMarkdown(value),
  };
}

function normalizeMarkdown(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function decodeHtml(value: string) {
  const entities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(/&(#\d+|#x[a-f0-9]+|[a-z]+);/gi, (match, entity) => {
    const key = String(entity).toLowerCase();

    if (key.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
    }

    if (key.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(key.slice(1), 10));
    }

    return entities[key] ?? match;
  });
}
