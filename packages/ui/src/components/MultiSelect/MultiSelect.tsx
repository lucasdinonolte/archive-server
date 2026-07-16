import { useEffect, useRef, useState } from 'react';
import { Command } from 'cmdk';

import css from './MultiSelect.module.css';

type Props = {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
};

export function MultiSelect({ options, selected, onChange, placeholder = 'Select...' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

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

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((s) => s !== value));
    } else {
      onChange([...selected, value]);
    }
    setQuery('');
  };

  const remove = (value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selected.filter((s) => s !== value));
  };

  return (
    <div className={css.root} ref={rootRef}>
      <div className={css.control} onClick={() => setOpen(true)}>
        {selected.map((item) => (
          <span className={css.pill} key={item}>
            {item}
            <button
              className={css.pillRemove}
              type="button"
              onClick={(e) => remove(item, e)}
            >
              ×
            </button>
          </span>
        ))}
        {selected.length === 0 && (
          <span className={css.placeholder}>{placeholder}</span>
        )}
      </div>
      {open && (
        <div className={css.dropdown}>
          <Command shouldFilter>
            <Command.Input
              autoFocus
              className={css.search}
              value={query}
              onValueChange={setQuery}
              placeholder="Search..."
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false);
              }}
            />
            <Command.List className={css.list}>
              <Command.Empty className={css.empty}>No matches</Command.Empty>
              {options.map((option) => (
                <Command.Item
                  key={option}
                  className={css.item}
                  value={option}
                  onSelect={() => toggle(option)}
                >
                  <span className={css.check}>
                    {selected.includes(option) ? '✓' : ''}
                  </span>
                  {option}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </div>
      )}
    </div>
  );
}
