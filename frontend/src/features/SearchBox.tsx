import { useQuery } from '@tanstack/react-query';
import { KeyboardEvent, useEffect, useId, useState } from 'react';

export interface SearchOption {
  id: string;
  label: string;
  /** Précision affichée à droite, ex. les classes d'un enseignant. */
  hint?: string;
}

interface Props {
  label: string;
  placeholder?: string;
  /** Identifiant de cache de la recherche, ex. ['edt', 'search-teachers', structureId]. */
  queryKey: unknown[];
  search: (text: string) => Promise<SearchOption[]>;
  onSelect: (option: SearchOption) => void;
}

/** Nombre minimal de caractères avant d'interroger le serveur. */
const MIN_CHARS = 2;

/**
 * Recherche avec suggestions (motif « combobox » accessible : flèches, Entrée, Échap).
 * Ex. « hafs » → « HAFSA001 Marie-Line » ; Entrée → ajouté au filtre, champ vidé.
 */
export function SearchBox({ label, placeholder, queryKey, search, onSelect }: Props) {
  const listId = useId();
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);

  const results = useQuery({
    queryKey: [...queryKey, debounced],
    queryFn: () => search(debounced),
    enabled: debounced.length >= MIN_CHARS,
    staleTime: 60_000,
  });
  const options = debounced.length >= MIN_CHARS ? results.data ?? [] : [];
  const expanded = open && options.length > 0;

  const choose = (option: SearchOption) => {
    onSelect(option);
    setText('');
    setDebounced('');
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && expanded) {
      e.preventDefault();
      choose(options[Math.min(active, options.length - 1)]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div style={{ position: 'relative', minWidth: 220 }}>
      <input
        type="search"
        className="form-control"
        role="combobox"
        aria-label={label}
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? `${listId}-${active}` : undefined}
        placeholder={placeholder ?? label}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {expanded && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="card shadow list-unstyled m-0 p-4"
          style={{ position: 'absolute', zIndex: 40, top: '100%', left: 0, right: 0, maxHeight: 280, overflowY: 'auto', background: '#fff' }}
        >
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
              onMouseEnter={() => setActive(i)}
              style={{ padding: '4px 8px', cursor: 'pointer', borderRadius: 4, background: i === active ? '#eef3fb' : undefined }}
            >
              <span>{o.label}</span>
              {o.hint && <small className="text-muted ms-8">{o.hint}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SearchBox;
