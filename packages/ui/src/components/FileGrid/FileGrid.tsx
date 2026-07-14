import { useEffect, useState } from 'react';

import type { FileListItem } from '@archive/shared';

import { listFiles } from '../../api.ts';
import { Thumbnail } from '../Thumbnail/Thumbnail.tsx';
import css from './FileGrid.module.css';

type Props = {
  onSelect: (hash: string) => void;
};

const PAGE_SIZE = 50;

export function FileGrid({ onSelect }: Props) {
  const [files, setFiles] = useState<FileListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    listFiles(PAGE_SIZE, offset).then((res) => {
      setFiles(res.files);
      setTotal(res.total);
    });
  }, [offset]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className={css.root}>
      <header className={css.header}>
        <h1>archive</h1>
        <p className={css.info}>
          {total} files — page {page} of {pages}
        </p>
      </header>

      <div className={css.grid}>
        {files.map((file) => (
          <Thumbnail
            key={file.hash}
            file={file}
            onClick={() => onSelect(file.hash)}
          />
        ))}
      </div>

      <nav className={css.pager}>
        {page > 1 && (
          <button onClick={() => setOffset(offset - PAGE_SIZE)} type="button">
            ← previous
          </button>
        )}
        {page < pages && (
          <button onClick={() => setOffset(offset + PAGE_SIZE)} type="button">
            next →
          </button>
        )}
      </nav>
    </div>
  );
}
