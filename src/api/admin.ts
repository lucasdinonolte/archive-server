import { readFileSync } from "node:fs";

import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { html, raw } from "hono/html";
import sharp from "sharp";

import { config } from "@/config";
import { setAuthoredMetadata } from "@/authored";
import { findFileByHash, getPluginRow, listFiles, countFiles, getAuthoredRow } from "@/storage/db";

export const admin = new Hono();

const PAGE_SIZE = 50;

// Fail closed: with no password configured, the admin surface stays disabled
// rather than accepting the empty-string default and letting anyone in.
admin.use("/admin/*", async (c, next) => {
  if (!config.adminPassword) return c.text("admin disabled: set ADMIN_PASSWORD", 503);
  return basicAuth({ username: config.adminUser, password: config.adminPassword })(c, next);
});

function layout(title: string, body: ReturnType<typeof html>) {
  return html`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <link rel="stylesheet" href="/admin/styles.css" />
      </head>
      <body>
        <main>${body}</main>
      </body>
    </html>`;
}

// ponytail: read relative to cwd (pm2 starts from the project dir). One small
// file; a per-request read is cheaper than wiring up serveStatic + a build copy.
admin.get("/admin/styles.css", (c) =>
  c.body(readFileSync("public/admin.css", "utf8"), 200, { "content-type": "text/css" })
);

// Paginated index: every file, newest first, each linking to its detail view.
admin.get("/admin", (c) => {
  const page = Math.max(Number(c.req.query("page") ?? 1), 1);
  const total = countFiles();
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const files = listFiles(PAGE_SIZE, (page - 1) * PAGE_SIZE);

  const items = files.map(
    (f) => html`
      <li class="fileItem">
        <a href="/admin/files/${f.hash}">${f.originalFilename}</a>
      </li>
    `
  );

  return c.html(
    layout(
      "archive admin",
      html`
        <h1>archive admin</h1>
        <p class="textSecondary mb-lg">${total} files · page ${page} of ${pages}</p>
        <ul class="fileList">${raw(items.join(""))}</ul>
        <nav class="pager">
          ${page > 1 ? html`<a href="/admin?page=${page - 1}">← previous</a>` : raw("")}
          ${page < pages ? html`<a href="/admin?page=${page + 1}">next →</a>` : raw("")}
        </nav>
      `
    )
  );
});

// Resized preview for image files: 400px wide, never upscaled. sharp reports the
// output format so the content type is right even when it rasterizes (e.g. SVG).
admin.get("/admin/files/:hash/preview", async (c) => {
  const file = findFileByHash(c.req.param("hash"));
  if (!file) return c.notFound();
  const core = getPluginRow("core_metadata", file.hash) as { content_type?: string } | undefined;
  if (!core?.content_type?.startsWith("image/")) return c.text("not an image", 415);

  const { data, info } = await sharp(file.storagePath)
    .resize({ width: 400, withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });
  // Buffer → plain Uint8Array: Hono's body type rejects Node's Buffer (its
  // backing store may be a SharedArrayBuffer).
  return c.body(new Uint8Array(data), 200, { "content-type": `image/${info.format}` });
});

// Detail view: metadata, an image preview when applicable, and the edit form.
admin.get("/admin/files/:hash", (c) => {
  const hash = c.req.param("hash");
  const file = findFileByHash(hash);
  if (!file) return c.notFound();

  const core = getPluginRow("core_metadata", hash) as
    | { content_type?: string; size_bytes?: number }
    | undefined;
  const authored = getAuthoredRow(hash);
  const isImage = core?.content_type?.startsWith("image/") ?? false;

  return c.html(
    layout(
      file.originalFilename,
      html`
        <p><a href="/admin">← all files</a></p>
        <h1 class="filename">${file.originalFilename}</h1>

        ${isImage
          ? html`<img class="preview" src="/admin/files/${hash}/preview" alt="preview of ${file.originalFilename}" width="400" />`
          : raw("")}

        <dl class="meta">
          <dt>Type</dt><dd>${core?.content_type ?? "unknown"}</dd>
          <dt>Size</dt><dd>${core?.size_bytes ?? "?"} bytes</dd>
          <dt>Ingested</dt><dd>${file.ingestedAt}</dd>
          <dt>Hash</dt><dd class="hash">${hash}</dd>
        </dl>

        <form method="post" action="/admin/files/${hash}" class="editForm">
          <label>Project
            <input name="project" value="${authored?.project ?? ""}" />
          </label>
          <label>Tags
            <input name="tags" placeholder="comma separated" value="${(authored?.tags ?? []).join(", ")}" />
          </label>
          <p class="textSecondary">Suggested: ${config.tags.join(", ")}</p>
          <button type="submit">Save</button>
        </form>
      `
    )
  );
});

admin.post("/admin/files/:hash", async (c) => {
  const hash = c.req.param("hash");
  const body = await c.req.parseBody();
  const project = String(body.project ?? "").trim();
  const tags = String(body.tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  await setAuthoredMetadata(hash, { project: project || null, tags });
  return c.redirect(`/admin/files/${hash}`);
});
