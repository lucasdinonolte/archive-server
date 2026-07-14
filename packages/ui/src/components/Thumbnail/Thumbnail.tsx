import type { FileListItem } from '@archive/shared';

import { imageUrl } from '../../api.ts';
import css from './Thumbnail.module.css';

type Props = {
  file: FileListItem;
  onClick: () => void;
};

export function Thumbnail({ file, onClick }: Props) {
  const isImage =
    typeof file.content_type === 'string' &&
    file.content_type.startsWith('image/');

  return (
    <button className={css.root} onClick={onClick} type="button">
      {isImage ? (
        <img
          className={css.image}
          src={imageUrl(file.hash, 200)}
          alt={file.originalFilename}
          loading="lazy"
        />
      ) : (
        <span className={css.icon}>📄</span>
      )}
      <span className={css.name}>{file.originalFilename}</span>
    </button>
  );
}
