import { createHash } from "node:crypto";
import sharp from "sharp";

import type { Plugin, ServingContext, ServingAPI, ServingResult, FileContext } from "./types";
import type { BlobStorage } from "@/storage/blobStorage";

const MIN_DIM = 50;
const MAX_DIM = 2000;
const MAX_INPUT_PIXELS = 50_000_000;
const MAX_CONCURRENT_RESIZES = 2;

let activeResizes = 0;
const resizeWaiters: Array<() => void> = [];
async function acquireResizeSlot(): Promise<() => void> {
  if (activeResizes >= MAX_CONCURRENT_RESIZES) {
    await new Promise<void>((resolve) => resizeWaiters.push(resolve));
  }
  activeResizes++;
  return () => {
    activeResizes--;
    resizeWaiters.shift()?.();
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function derivedSignature(params: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(params)).digest("hex").slice(0, 16);
}

async function resizeImage(
  sourcePath: string,
  w: number,
  h: number | undefined,
): Promise<Buffer> {
  const release = await acquireResizeSlot();
  try {
    const { data } = await sharp(sourcePath, { limitInputPixels: MAX_INPUT_PIXELS })
      .resize({ width: w, height: h, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    return data;
  } finally {
    release();
  }
}

export const imageServingPlugin: Plugin = {
  id: "image-serving",
  version: 1,
  phase: "sync",
  appliesTo: (ctx) => ctx.contentType.startsWith("image/"),
  analyze: async () => ({}),

  serving: {
    formats: ["webp", "jpg", "png"],
    serve: async (ctx: ServingContext, api: ServingAPI): Promise<ServingResult | null> => {
      const w = clamp(Number(ctx.query.w ?? 400), MIN_DIM, MAX_DIM);
      const rawH = ctx.query.h;
      const h = rawH ? clamp(Number(rawH), MIN_DIM, MAX_DIM) : undefined;

      const signature = derivedSignature({ w, h: h ?? null });

      const cached = await api.readDerived(signature, ".webp");
      if (cached) {
        return {
          status: 200,
          headers: {
            "content-type": "image/webp",
            "cache-control": "public, max-age=31536000, immutable",
          },
          body: new Uint8Array(cached),
        };
      }

      const localFile = await api.localPath();
      const data = await resizeImage(localFile, w, h);

      // Fire-and-forget cache write
      api.writeDerived(signature, ".webp", data).catch(() => {});

      return {
        status: 200,
        headers: {
          "content-type": "image/webp",
          "cache-control": "public, max-age=31536000, immutable",
        },
        body: new Uint8Array(data),
      };
    },
  },

  thumbnail: {
    contentType: "image/webp",
    generate: async (ctx: FileContext, _storage: BlobStorage): Promise<Buffer | null> => {
      try {
        return await resizeImage(ctx.storagePath, 400, undefined);
      } catch {
        return null;
      }
    },
  },
};
