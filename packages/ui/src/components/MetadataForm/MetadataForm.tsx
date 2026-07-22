import { useEffect, useState } from 'react';

import { listCustomFieldKeys, updateMetadata } from '../../api.ts';
import { TypeaheadInput } from '../TypeaheadInput/TypeaheadInput.tsx';
import css from './MetadataForm.module.css';

type Props = {
  hash: string;
  project: string | null;
  tags: string[];
  customFields: Record<string, string>;
  onSaved: () => void;
};

type FieldEntry = { key: string; value: string };

function toEntries(fields: Record<string, string>): FieldEntry[] {
  const entries = Object.entries(fields).map(([key, value]) => ({ key, value }));
  return entries.length ? entries : [];
}

function toRecord(entries: FieldEntry[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const { key, value } of entries) {
    const k = key.trim();
    if (k) record[k] = value;
  }
  return record;
}

export function MetadataForm({ hash, project: initialProject, tags: initialTags, customFields: initialCustomFields, onSaved }: Props) {
  const [project, setProject] = useState(initialProject ?? '');
  const [tags, setTags] = useState(initialTags.join(', '));
  const [fields, setFields] = useState<FieldEntry[]>(toEntries(initialCustomFields));
  const [saving, setSaving] = useState(false);
  const [knownKeys, setKnownKeys] = useState<string[]>([]);

  useEffect(() => {
    listCustomFieldKeys().then(setKnownKeys);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await updateMetadata(hash, {
      project: project.trim() || null,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      customFields: toRecord(fields),
    });
    setSaving(false);
    onSaved();
  };

  const updateField = (index: number, patch: Partial<FieldEntry>) => {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const removeField = (index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  const addField = () => {
    setFields((prev) => [...prev, { key: '', value: '' }]);
  };

  // Exclude keys already in use from suggestions
  const usedKeys = new Set(fields.map((f) => f.key.trim()).filter(Boolean));
  const availableKeys = knownKeys.filter((k) => !usedKeys.has(k));

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

      <fieldset className={css.fieldset}>
        <legend>Custom Fields</legend>
        {fields.map((entry, i) => (
          <div className={css.row} key={i}>
            <div className={css.keyInput}>
              <TypeaheadInput
                value={entry.key}
                onChange={(v) => updateField(i, { key: v })}
                suggestions={availableKeys}
                placeholder="key"
              />
            </div>
            <input
              className={css.valueInput}
              value={entry.value}
              onChange={(e) => updateField(i, { value: e.target.value })}
              placeholder="value"
            />
            <button type="button" className={css.removeBtn} onClick={() => removeField(i)}>
              ×
            </button>
          </div>
        ))}
        <button type="button" className={css.addBtn} onClick={addField}>
          + Add field
        </button>
      </fieldset>

      <button type="submit" disabled={saving}>
        {saving ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}
