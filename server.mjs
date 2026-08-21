import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const defaultPublicDir = resolve(here, "public");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
};

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

export function createAppServer({ publicDir = defaultPublicDir } = {}) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname === "/api/health" && req.method === "GET") {
        return sendJson(res, 200, { ok: true, service: "invoice-idea-lab", storage: "browser-local-only" });
      }
      if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "method_not_allowed" });

      const requested = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
      const root = resolve(publicDir);
      const filePath = resolve(root, requested);
      if (!filePath.startsWith(`${root}\\`) && filePath !== resolve(root, "index.html")) return sendJson(res, 403, { error: "forbidden" });

      const data = await readFile(filePath);
      res.writeHead(200, {
        "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
        "Cache-Control": extname(filePath) === ".html" ? "no-store" : "public, max-age=60",
      });
      if (req.method === "HEAD") return res.end();
      res.end(data);
    } catch (error) {
      if (error?.code === "ENOENT") return sendJson(res, 404, { error: "not_found" });
      sendJson(res, 500, { error: "internal_error" });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4173);
  const server = createAppServer();
  server.listen(port, "0.0.0.0", () => console.log(`Invoice Idea Lab: http://localhost:${port}`));
}
