import { useState } from 'react';

import { updateMetadata } from '../../api.ts';
import css from './MetadataForm.module.css';

type Props = {
  hash: string;
  project: string | null;
  tags: string[];
  onSaved: () => void;
};

export function MetadataForm({ hash, project: initialProject, tags: initialTags, onSaved }: Props) {
  const [project, setProject] = useState(initialProject ?? '');
  const [tags, setTags] = useState(initialTags.join(', '));
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await updateMetadata(hash, {
      project: project.trim() || null,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
    setSaving(false);
    onSaved();
  };

  return (
    <form className={css.root} onSubmit={handleSubmit}>
      <label className={css.field}>
        Project
        <input value={project} onChange={(e) => setProject(e.target.value)} />
      </label>
      <label className={css.field}>
        Tags
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="comma separated"
        />
      </label>
      <button type="submit" disabled={saving}>
        {saving ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}
