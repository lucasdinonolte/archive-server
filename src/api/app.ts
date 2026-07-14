import { Hono } from "hono";
import { getFileDetail, listFilesPage } from './queries';

export const app = new Hono();

app.use("*", async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    return c.json({ error: "method not allowed - this API is read-only" }, 405);
  }
  await next();
});

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/files", (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);
  return c.json(listFilesPage(limit, offset));
});

app.get("/files/:hash", (c) => {
  const detail = getFileDetail(c.req.param("hash"));
  return detail ? c.json(detail) : c.json({ error: "not found" }, 404);
});

app.notFound((c) => c.json({ error: "not found" }, 404));
