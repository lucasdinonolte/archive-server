import type { Plugin } from './types';
import sharp from 'sharp';

export const imageMetadataPlugin: Plugin = {
  id: 'image-metadata',
  version: 1,
  appliesTo: (ctx) => ctx.contentType.startsWith('image/'),
  schema: {
    table: 'image_metadata',
    columns: [
      { name: 'width', type: 'INTEGER' },
      { name: 'height', type: 'INTEGER' },
      { name: 'format', type: 'TEXT' },
      { name: 'color_space', type: 'TEXT' },
      { name: 'dpi', type: 'REAL' },
      { name: 'domninant_color', type: 'TEXT', nullable: true },
    ],
  },
  analyze: async (ctx) => {
    const metadata = await sharp(ctx.storagePath).metadata();
    const { dominant } = await sharp(ctx.storagePath).stats();
    const { r, g, b } = dominant;
    const dominantColor = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      color_space: metadata.space,
      dpi: metadata.density ?? 72,
      domninant_color: dominantColor,
    };
  },
};
