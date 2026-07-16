import { useEffect, useState } from 'react';

import type { PublicFileListItem } from '@archive/shared';

import { listFiles, listTags, listProjects } from '../../api.ts';
import { MultiSelect } from '../MultiSelect/MultiSelect.tsx';
import { Thumbnail } from '../Thumbnail/Thumbnail.tsx';
import css from './FileGrid.module.css';

type Props = {
  onSelect: (hash: string) => void;
};

const PAGE_SIZE = 50;

export function FileGrid({ onSelect }: Props) {
  const [files, setFiles] = useState<PublicFileListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  const [allTags, setAllTags] = useState<string[]>([]);
  const [allProjects, setAllProjects] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

  useEffect(() => {
    listTags().then(setAllTags);
    listProjects().then(setAllProjects);
  }, []);

  useEffect(() => {
    const filters = {
      tags: selectedTags.length ? selectedTags : undefined,
      projects: selectedProjects.length ? selectedProjects : undefined,
    };
    listFiles(PAGE_SIZE, offset, filters).then((res) => {
      setFiles(res.files);
      setTotal(res.total);
    });
  }, [offset, selectedTags, selectedProjects]);

  const handleTagsChange = (tags: string[]) => {
    setSelectedTags(tags);
    setOffset(0);
  };

  const handleProjectsChange = (projects: string[]) => {
    setSelectedProjects(projects);
    setOffset(0);
  };

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

      <div className={css.filters}>
        <div className={css.filterField}>
          <span>Tags</span>
          <MultiSelect
            options={allTags}
            selected={selectedTags}
            onChange={handleTagsChange}
            placeholder="Filter by tags..."
          />
        </div>
        <div className={css.filterField}>
          <span>Project</span>
          <MultiSelect
            options={allProjects}
            selected={selectedProjects}
            onChange={handleProjectsChange}
            placeholder="Filter by project..."
          />
        </div>
      </div>

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
