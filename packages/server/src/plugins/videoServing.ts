import { Readable } from "node:stream";

import type { Plugin, ServingContext, ServingAPI, ServingResult } from "./types";

export const videoServingPlugin: Plugin = {
  id: "video-serving",
  version: 1,
  phase: "sync",
  appliesTo: (ctx) => ctx.contentType.startsWith("video/"),
  analyze: async () => ({}),

  serving: {
    formats: ["mp4"],
    serve: async (ctx: ServingContext, api: ServingAPI): Promise<ServingResult | null> => {
      const size = await api.blobSize();
      const contentType = ctx.contentType;

      if (ctx.range) {
        const [startStr, endStr] = ctx.range.replace("bytes=", "").split("-");
        const start = Number(startStr);
        const end = endStr ? Number(endStr) : Math.min(start + 1_000_000, size - 1);

        const stream = await api.createReadStream({ start, end });

        return {
          status: 206,
          headers: {
            "Content-Range": `bytes ${start}-${end}/${size}`,
            "Accept-Ranges": "bytes",
            "Content-Length": String(end - start + 1),
            "Content-Type": contentType,
          },
          body: Readable.toWeb(stream) as ReadableStream,
        };
      }

      const stream = await api.createReadStream();

      return {
        status: 200,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": String(size),
          "Content-Type": contentType,
        },
        body: Readable.toWeb(stream) as ReadableStream,
      };
    },
  },
};
