import { useEffect, useState } from 'react';

import type { PublicFileDetail } from '@archive/shared';

import { getFileDetail, imageUrl } from '../../api.ts';
import { MetadataForm } from '../MetadataForm/MetadataForm.tsx';
import css from './FileDetail.module.css';

type Props = {
  hash: string;
  onBack: () => void;
};

export function FileDetail({ hash, onBack }: Props) {
  const [detail, setDetail] = useState<PublicFileDetail | null>(null);

  const load = () => {
    getFileDetail(hash).then(setDetail);
  };
  useEffect(load, [hash]);

  if (!detail) return <p>Loading...</p>;

  const isImage = detail.contentType?.startsWith('image/') ?? false;

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
        <dd>{detail.contentType ?? 'unknown'}</dd>
        <dt>Size</dt>
        <dd>{detail.sizeBytes ?? '?'} bytes</dd>
        <dt>Ingested</dt>
        <dd>{detail.ingestedAt}</dd>
        <dt>Hash</dt>
        <dd className={css.hash}>{hash}</dd>
      </dl>

      <h2>Metadata</h2>
      <MetadataForm
        hash={hash}
        project={detail.project ?? null}
        tags={detail.tags ?? []}
        customFields={detail.customFields ?? {}}
        onSaved={load}
      />
    </div>
  );
}
