import { useEffect, useState } from 'react';

import type { FileDetail as FileDetailType } from '@archive/shared';

import { getFileDetail, imageUrl } from '../../api.ts';
import { MetadataForm } from '../MetadataForm/MetadataForm.tsx';
import css from './FileDetail.module.css';

type Props = {
  hash: string;
  onBack: () => void;
};

export function FileDetail({ hash, onBack }: Props) {
  const [detail, setDetail] = useState<FileDetailType | null>(null);

  const load = () => {
    getFileDetail(hash).then(setDetail);
  };
  useEffect(load, [hash]);

  if (!detail) return <p>Loading...</p>;

  const core = detail.plugins.core_metadata as
    | { content_type?: string; size_bytes?: number }
    | undefined;
  const clip = detail.plugins.image_clip as
    | { tags?: string }
    | undefined;
  const isImage = core?.content_type?.startsWith('image/') ?? false;
  const clipTags = clip?.tags ? JSON.parse(clip.tags) as { tag: string; score: number }[] : [];

  return (
    <div className={css.root}>
      <button className={css.back} onClick={onBack} type="button">
        ← all files
      </button>
      <h1 className={css.filename}>{detail.originalFilename}</h1>

      {isImage && (
        <img
          className={css.preview}
          src={imageUrl(hash, 600)}
          alt={detail.originalFilename}
          width="600"
        />
      )}

      <dl className={css.meta}>
        <dt>Type</dt>
        <dd>{core?.content_type ?? 'unknown'}</dd>
        <dt>Size</dt>
        <dd>{core?.size_bytes ?? '?'} bytes</dd>
        <dt>Ingested</dt>
        <dd>{detail.ingestedAt}</dd>
        <dt>Hash</dt>
        <dd className={css.hash}>{hash}</dd>
      </dl>

      {clipTags.length > 0 && (
        <div className={css.clipTags}>
          <h2>CLIP tags</h2>
          <ul>
            {clipTags.map((t) => (
              <li key={t.tag}>
                {t.tag} ({t.score.toFixed(3)})
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2>Metadata</h2>
      <MetadataForm hash={hash} authored={detail.authored} onSaved={load} />
    </div>
  );
}
