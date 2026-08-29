#!/usr/bin/env node
/* Small dependency-free local server for validating the browser bundle. */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "cache-render-bundle");
const port = Number(process.argv[2] || process.env.CACHE_RENDER_PORT || 8081);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port must be between 1 and 65535");
const contentTypes = { ".json": "application/json", ".bin": "application/octet-stream" };

const server = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
  if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405); response.end(); return; }
  try {
    const requestPath = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
    const file = resolve(root, `.${requestPath === "/" ? "/manifest.json" : requestPath}`);
    if (file !== root && !file.startsWith(`${root}/`)) { response.writeHead(403); response.end("Forbidden"); return; }
    const info = await stat(file);
    if (!info.isFile()) throw new Error("not a file");
    response.setHeader("Content-Type", contentTypes[extname(file)] || "application/octet-stream");
    response.setHeader("Cache-Control", file.endsWith(".bin") ? "public, max-age=31536000, immutable" : "no-cache");
    response.setHeader("Content-Length", info.size);
    response.writeHead(200);
    if (request.method === "GET") response.end(await readFile(file)); else response.end();
  } catch { response.writeHead(404); response.end("Not found"); }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Serving ${root}`);
  console.log(`Cache render manifest: http://127.0.0.1:${port}/manifest.json`);
});
