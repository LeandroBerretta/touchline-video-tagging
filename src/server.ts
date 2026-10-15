import { createServer } from "node:http";
import { existsSync, readFile } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));
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

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const fileName = pathname === "/config.js"
    ? existsSync(join(publicDirectory, "config.js")) ? "config.js" : "config.example.js"
    : publicFiles[pathname];
  if (!fileName || (request.method !== "GET" && request.method !== "HEAD")) {
    response.writeHead(404).end("Not found");
    return;
  }

  readFile(join(publicDirectory, fileName), (error, body) => {
    if (error) {
      console.error(`Unable to load ${pathname}:`, error);
      response.writeHead(500).end("Could not load the application.");
      return;
    }
    response.writeHead(200, {
      "content-type": contentTypes[extname(fileName)],
      "cache-control": "no-cache",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  });
});

server.listen(port, host, () => {
  console.log(`Touchline listening on http://${host}:${port}`);
});
