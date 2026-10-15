import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
const projectDirectory = fileURLToPath(new URL("../", import.meta.url));
const publicDirectory = join(projectDirectory, "public");
const dataDirectory = process.env.APP_DATA_DIR ?? join(projectDirectory, "data", "app-library");
const libraryFile = join(dataDirectory, "videos.json");
const maxJsonBytes = 2 * 1024 * 1024;
const publicFiles: Record<string, string> = {
  "/": "index.html",
  "/app.js": "app.js",
  "/styles.css": "styles.css",
};
const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

type VideoTag = {
  id: string;
  timestampSeconds: number;
  eventType: string;
  playerNames: string;
  note: string;
};

type VideoRecord = {
  id: string;
  title: string;
  vimeoUrl: string;
  status: "in_progress" | "published";
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  tags: VideoTag[];
};

class RequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

let writeQueue: Promise<void> = Promise.resolve();

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isVideoRecord(value: unknown): value is VideoRecord {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.vimeoUrl === "string" &&
    (value.status === "in_progress" || value.status === "published") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    (value.publishedAt === null || typeof value.publishedAt === "string") &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => isRecord(tag) &&
      typeof tag.id === "string" &&
      typeof tag.timestampSeconds === "number" &&
      Number.isFinite(tag.timestampSeconds) &&
      tag.timestampSeconds >= 0 &&
      typeof tag.eventType === "string" &&
      typeof tag.playerNames === "string" &&
      typeof tag.note === "string");
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxJsonBytes) throw new RequestError("Request JSON exceeds the 2 MiB limit.", 413);
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError("Request body must be valid JSON.");
  }
}

function parseVideoRecord(value: unknown, id: string, existing?: VideoRecord, publish = false): VideoRecord {
  if (!isRecord(value)) throw new RequestError("Video data must be a JSON object.");
  if (typeof value.title !== "string" || !value.title.trim() || value.title.trim().length > 200) {
    throw new RequestError("Video name must contain 1–200 characters.");
  }
  if (typeof value.vimeoUrl !== "string" || value.vimeoUrl.length > 2048) {
    throw new RequestError("A valid Vimeo link is required.");
  }
  let url: URL;
  try {
    url = new URL(value.vimeoUrl);
  } catch {
    throw new RequestError("Enter a valid Vimeo link.");
  }
  if (url.protocol !== "https:" || !["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(url.hostname.toLowerCase()) ||
      !/(?:^|\/)(?:video\/)?\d+(?:\/[^/]+)?\/?$/.test(url.pathname)) {
    throw new RequestError("Use a valid Vimeo video link.");
  }
  if (!Array.isArray(value.tags)) throw new RequestError("Video tags must be an array.");
  if (value.tags.length > 10000) throw new RequestError("A video cannot have more than 10,000 tags.");

  const tags = value.tags.map((tag, index): VideoTag => {
    const label = `Tag ${index + 1}`;
    if (!isRecord(tag) || typeof tag.id !== "string" || !/^[0-9a-f-]{36}$/i.test(tag.id)) {
      throw new RequestError(`${label} needs a valid id.`);
    }
    if (typeof tag.timestampSeconds !== "number" || !Number.isFinite(tag.timestampSeconds) || tag.timestampSeconds < 0) {
      throw new RequestError(`${label} needs a non-negative timestamp.`);
    }
    const eventType = tag.eventType ?? "";
    const playerNames = tag.playerNames ?? "";
    const note = tag.note ?? "";
    if (typeof eventType !== "string" || eventType.length > 100 ||
        typeof playerNames !== "string" || playerNames.length > 200 ||
        typeof note !== "string" || note.length > 500) {
      throw new RequestError(`${label} has invalid event details.`);
    }
    return {
      id: tag.id,
      timestampSeconds: tag.timestampSeconds,
      eventType: eventType.trim(),
      playerNames: playerNames.trim(),
      note: note.trim(),
    };
  }).sort((first, second) => first.timestampSeconds - second.timestampSeconds);

  const now = new Date().toISOString();
  return {
    id,
    title: value.title.trim(),
    vimeoUrl: url.href,
    status: publish ? "published" : existing?.status ?? "in_progress",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    publishedAt: publish ? now : existing?.publishedAt ?? null,
    tags,
  };
}

async function readLibrary(): Promise<VideoRecord[]> {
  try {
    const data: unknown = JSON.parse(await readFile(libraryFile, "utf8"));
    if (!Array.isArray(data) || data.some((record) => !isVideoRecord(record))) {
      throw new Error("The video library file has an invalid format.");
    }
    return data as VideoRecord[];
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeLibrary(records: VideoRecord[]): Promise<void> {
  await mkdir(dataDirectory, { recursive: true });
  const temporaryFile = join(dataDirectory, `videos.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryFile, `${JSON.stringify(records, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryFile, libraryFile);
  } finally {
    await rm(temporaryFile, { force: true });
  }
}

function withLibraryWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation);
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function handleApi(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> {
  if (pathname === "/api/videos" && request.method === "GET") {
    const status = new URL(request.url ?? "/", "http://localhost").searchParams.get("status");
    if (status && status !== "in_progress" && status !== "published") {
      throw new RequestError("status must be in_progress or published.");
    }
    const records = await readLibrary();
    sendJson(response, 200, records
      .filter((record) => !status || record.status === status)
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)));
    return true;
  }

  const match = pathname.match(/^\/api\/videos\/([0-9a-f-]{36})(\/publish)?$/i);
  if (!match) return false;
  const id = match[1];
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new RequestError("Video id is invalid.");
  const isPublish = Boolean(match[2]);
  if (request.method === "DELETE" && !isPublish) {
    const removed = await withLibraryWrite(async () => {
      const records = await readLibrary();
      const record = records.find((item) => item.id === id);
      if (!record) return false;
      await writeLibrary(records.filter((item) => item.id !== id));
      return true;
    });
    if (!removed) {
      sendJson(response, 404, { error: "Video not found in the library." });
      return true;
    }
    sendJson(response, 200, { removed: true });
    return true;
  }
  if ((request.method !== "PUT" && !(isPublish && request.method === "POST"))) {
    sendJson(response, 405, { error: "Method not allowed." });
    return true;
  }

  const body = await readJson(request);
  const saved = await withLibraryWrite(async () => {
    const records = await readLibrary();
    const existing = records.find((record) => record.id === id);
    const record = parseVideoRecord(body, id, existing, isPublish);
    const nextRecords = existing
      ? records.map((item) => item.id === id ? record : item)
      : [...records, record];
    await writeLibrary(nextRecords);
    return record;
  });
  sendJson(response, 200, saved);
  return true;
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  try {
    if (pathname.startsWith("/api/")) {
      if (await handleApi(request, response, pathname)) return;
      sendJson(response, 404, { error: "API endpoint not found." });
      return;
    }
    const fileName = publicFiles[pathname];
    if (!fileName || (request.method !== "GET" && request.method !== "HEAD")) {
      response.writeHead(404).end("Not found");
      return;
    }
    const body = await readFile(join(publicDirectory, fileName));
    response.writeHead(200, {
      "content-type": contentTypes[extname(fileName)],
      "cache-control": "no-cache",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    console.error(`Unable to handle ${pathname}:`, error);
    if (error instanceof RequestError) {
      sendJson(response, error.status, { error: error.message });
      return;
    }
    if (pathname.startsWith("/api/")) {
      sendJson(response, 500, { error: "The request could not be completed. Check the application data folder and try again." });
      return;
    }
    response.writeHead(500).end("Could not load the application.");
  }
});

server.listen(port, host, () => {
  console.log(`Touchline listening on http://${host}:${port}; video library at ${libraryFile}`);
});
