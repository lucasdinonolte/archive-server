import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { html, raw } from "hono/html";

import { config } from "@/config";
import { setAuthoredMetadata } from "@/authored";
import { listFiles, getAuthoredRow } from "@/storage/db";

export const admin = new Hono();

// Fail closed: with no password configured, the admin surface stays disabled
// rather than accepting the empty-string default and letting anyone in.
admin.use("/admin/*", async (c, next) => {
  if (!config.adminPassword) return c.text("admin disabled: set ADMIN_PASSWORD", 503);
  return basicAuth({ username: config.adminUser, password: config.adminPassword })(c, next);
});

admin.get("/admin", (c) => {
  const files = listFiles(100, 0).map((f) => ({ ...f, authored: getAuthoredRow(f.hash) }));

  const rows = files.map(
    (f) => html`
      <form method="post" action="/admin/files/${f.hash}" class="row">
        <div class="name" title="${f.hash}">${f.originalFilename}</div>
        <input name="project" placeholder="project" value="${f.authored?.project ?? ""}" />
        <input name="tags" placeholder="tags, comma separated" value="${(f.authored?.tags ?? []).join(", ")}" />
        <button type="submit">Save</button>
      </form>
    `
  );

  return c.html(html`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>archive admin</title>
        <style>
          body { font: 14px system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
          .row { display: grid; grid-template-columns: 1fr 12rem 16rem auto; gap: .5rem; align-items: center; margin-bottom: .5rem; }
          .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          input { padding: .3rem; }
        </style>
      </head>
      <body>
        <h1>archive admin</h1>
        <p>Suggested tags: ${config.tags.join(", ")}</p>
        ${raw(rows.join(""))}
      </body>
    </html>`);
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
  return c.redirect("/admin");
});
