import { useEffect, useRef, useState } from "react";
import { searchStops, type StopHit } from "./api.js";

interface Props {
  label: string;
  value: StopHit | null;
  onChange: (stop: StopHit | null) => void;
}

/**
 * Origin/destination entry.
 *
 * Suggestions appear from two characters and are debounced: a rider typing
 * "Dundas" should not fire six requests, and on a phone the keyboard is already
 * covering half the screen.
 */
export function StopSearch({ label, value, onChange }: Props): JSX.Element {
  const [text, setText] = useState("");
  const [hits, setHits] = useState<StopHit[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    if (text.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(() => {
      searchStops(text.trim()).then((r) => setHits(r.stops)).catch(() => setHits([]));
    }, 220);
    return () => { if (timer.current !== null) clearTimeout(timer.current); };
  }, [text]);

  return (
    <div className="field">
      <label>
        <span className="field-label">{label}</span>
        <input
          type="text"
          value={value !== null && !open ? value.name : text}
          placeholder="Stop or station"
          onFocus={() => { setOpen(true); setText(""); }}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 160)}
        />
      </label>
      {open && hits.length > 0 && (
        <ul className="suggestions">
          {hits.map((s) => (
            <li key={s.id}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(s); setOpen(false); setText(""); }}
              >
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
