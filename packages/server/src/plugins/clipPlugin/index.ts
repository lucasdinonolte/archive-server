import {
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  AutoTokenizer,
  AutoProcessor,
  RawImage,
  type Processor,
  type PreTrainedModel,
} from '@huggingface/transformers';

import { config } from '@/config';
import type { Plugin } from '../types';

import { TAG_VOCABULARY } from './constants';

type TagVocabEntry = {
  tag: string;
  embedding: Float32Array;
};

function dotProduct(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

function l2Normalize(vec: Float32Array): Float32Array {
  let normSq = 0;
  for (const v of vec) normSq += v * v;
  const norm = Math.sqrt(normSq);
  return norm === 0 ? vec : Float32Array.from(vec, (v) => v / norm);
}

function scoreTags(imageEmbedding: Float32Array, vocab: TagVocabEntry[], topK = 5) {
  const normalized = l2Normalize(imageEmbedding);
  return vocab
    .map((entry) => ({ tag: entry.tag, score: dotProduct(normalized, entry.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function packFloat32(vec: Float32Array): Buffer {
  return Buffer.from(new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength));
}

async function generateEmbeddedTags(tags: string[]): Promise<TagVocabEntry[]> {
  const tokenizer = await AutoTokenizer.from_pretrained(config.clipModelId);
  const textModel = await CLIPTextModelWithProjection.from_pretrained(
    config.clipModelId,
  );

  const inputs = tokenizer(tags, { padding: true, truncation: true });
  const { text_embeds } = await textModel(inputs);

  const dim = text_embeds.dims[1] as number;
  const vocab = tags.map((tag, index) => ({
    tag,
    embedding: (text_embeds.data.slice(index * dim, (index + 1) * dim)) as Float32Array,
  }));

  // Free the text model and tokenizer — they're only needed once to compute
  // the tag vocabulary and hold significant native (ONNX) memory.
  await textModel.dispose?.();
  tokenizer.dispose?.();

  return vocab;
}

/**
 * Loads the vision model + tag vocab on first use and memoises them. Deferring
 * this keeps the ~hundreds-of-MB weights out of the heap for commands that never
 * call analyze (rebuild) and until the first image actually arrives (watch).
 */
let modelsPromise: Promise<{ processor: Processor; visionModel: PreTrainedModel; vocab: TagVocabEntry[] }> | undefined;
function loadModels() {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      const vocab = await generateEmbeddedTags(TAG_VOCABULARY);
      const processor: Processor = await AutoProcessor.from_pretrained(config.clipModelId);
      const visionModel: PreTrainedModel = await CLIPVisionModelWithProjection.from_pretrained(
        config.clipModelId,
        { dtype: 'int8' }, // quantized: ~4x smaller weights, fits a 2GB VPS. fp32 if tag quality suffers.
      );
      return { processor, visionModel, vocab };
    })();
  }
  return modelsPromise;
}

export const createClipPlugin = async (): Promise<Plugin> => {
  return {
    id: 'image-clip',
    version: 2,
    appliesTo: (ctx) => ctx.contentType.startsWith('image/'),
    schema: {
      table: 'image_clip',
      columns: [
        { name: 'model_id', type: 'TEXT' },
        { name: 'embedding', type: 'BLOB' },
        { name: 'dim', type: 'INTEGER' },
        { name: 'tags', type: 'TEXT' }, // JSON array of {tag, score}
        { name: 'computed_at', type: 'TEXT' },
      ],
    },
    project: (data, ctx) => {
      const raw = data.tags as string | null;
      const clipLabels: string[] = raw
        ? (JSON.parse(raw) as Array<{ tag: string }>).map((t) => t.tag)
        : [];
      return { tags: [...new Set([...(ctx.tags ?? []), ...clipLabels])] };
    },
    analyze: async (ctx) => {
      const { processor, visionModel, vocab } = await loadModels();
      const image = await RawImage.read(ctx.storagePath);
      const imageInputs = await processor(image);
      const { image_embeds } = await visionModel(imageInputs);

      const imageVec = image_embeds.data as Float32Array;
      const tags = scoreTags(imageVec, vocab, 5);

      return {
        model_id: config.clipModelId,
        embedding: packFloat32(imageVec),
        dim: imageVec.length,
        tags: JSON.stringify(tags),
        computed_at: new Date().toISOString(),
      };
    },
  };
};
