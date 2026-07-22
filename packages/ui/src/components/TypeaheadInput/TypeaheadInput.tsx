import { useEffect, useRef, useState } from 'react';

import css from './TypeaheadInput.module.css';

type Props = {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
};

export function TypeaheadInput({ value, onChange, suggestions, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = value
    ? suggestions.filter((s) => s.toLowerCase().includes(value.toLowerCase()) && s !== value)
    : suggestions;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className={css.root} ref={rootRef}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={placeholder}
      />
      {open && filtered.length > 0 && (
        <ul className={css.dropdown}>
          {filtered.map((s) => (
            <li
              key={s}
              className={css.item}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s);
                setOpen(false);
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
