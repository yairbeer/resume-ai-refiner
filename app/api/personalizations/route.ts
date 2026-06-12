import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { NextResponse } from "next/server";

type SavePersonalizationRequest = {
  saveName?: string;
  bundle?: unknown;
};

const PERSONALIZATIONS_CACHE_DIR = ".cache/personalizations";
const VERSION_DIR = "versions";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fileName = url.searchParams.get("fileName");
  const cacheDir = resolve(
    /* turbopackIgnore: true */ process.cwd(),
    PERSONALIZATIONS_CACHE_DIR,
  );
  const versionDir = join(cacheDir, VERSION_DIR);

  if (fileName) {
    const safeFileName = getSafeFileName(fileName);

    if (!safeFileName) {
      return NextResponse.json(
        { error: "Choose a valid saved personalization file." },
        { status: 400 },
      );
    }

    try {
      const json = await readFile(join(versionDir, safeFileName), "utf8");

      return NextResponse.json({
        bundle: JSON.parse(json),
        cacheRelativePath: `${PERSONALIZATIONS_CACHE_DIR}/${VERSION_DIR}/${safeFileName}`,
        fileName: safeFileName,
      });
    } catch {
      return NextResponse.json(
        { error: "Saved personalization was not found." },
        { status: 404 },
      );
    }
  }

  try {
    const files = (await readdir(versionDir))
      .filter((candidate) => !!getSafeFileName(candidate))
      .sort();
    const items = await Promise.all(
      files.map(async (candidate) => {
        const fileStat = await stat(join(versionDir, candidate));

        return {
          fileName: candidate,
          cacheRelativePath: `${PERSONALIZATIONS_CACHE_DIR}/${VERSION_DIR}/${candidate}`,
          updatedAt: fileStat.mtime.toISOString(),
        };
      }),
    );

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as SavePersonalizationRequest;
  const slug = slugify(body.saveName ?? "");

  if (!slug) {
    return NextResponse.json(
      { error: "Add a save name before saving." },
      { status: 400 },
    );
  }

  if (!body.bundle || typeof body.bundle !== "object") {
    return NextResponse.json(
      { error: "Add a personalization bundle before saving." },
      { status: 400 },
    );
  }

  const cacheDir = resolve(
    /* turbopackIgnore: true */ process.cwd(),
    PERSONALIZATIONS_CACHE_DIR,
  );
  const versionDir = join(cacheDir, VERSION_DIR);
  const fileName = await getAvailableFileName(versionDir, slug);
  const cacheRelativePath = `${PERSONALIZATIONS_CACHE_DIR}/${VERSION_DIR}/${fileName}`;
  const cacheFilePath = join(versionDir, fileName);
  const createdAt = new Date().toISOString();
  const saveObject = {
    ...(body.bundle as Record<string, unknown>),
    version: 1,
    saveName: body.saveName?.trim() ?? slug,
    createdAt,
  };

  await mkdir(versionDir, { recursive: true });
  await writeFile(cacheFilePath, JSON.stringify(saveObject, null, 2), "utf8");

  console.info("[personalizations] Saved named personalization bundle", {
    cacheRelativePath,
    cacheFilePath,
  });

  return NextResponse.json({
    bundle: saveObject,
    cacheRelativePath,
    fileName,
  });
}

async function getAvailableFileName(versionDir: string, slug: string) {
  await mkdir(versionDir, { recursive: true });

  const files = new Set(await readdir(versionDir));
  const baseName = `${slug}.json`;

  if (!files.has(baseName)) {
    return baseName;
  }

  let version = 2;

  while (files.has(`${slug}-v${String(version).padStart(4, "0")}.json`)) {
    version += 1;
  }

  return `${slug}-v${String(version).padStart(4, "0")}.json`;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function getSafeFileName(value: string) {
  const fileName = value.trim();

  if (!/^[a-z0-9][a-z0-9-]*\.json$/.test(fileName)) {
    return null;
  }

  return fileName;
}
