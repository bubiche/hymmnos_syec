// Hover/tap popover surfacing the full dictionary entry for a word column.
// Triggered via mouseenter (with a 100ms close debounce so the cursor can
// cross the gap between trigger and popover without dismissing) and via
// click/Enter/Space which "pins" the popover open until click-outside or
// Escape. Both modes coexist: pinned overrides hover-close.
//
// The trigger wraps the existing `<Column>` markup as `children` so the
// visual gloss column stays the source of truth — this just adds a relative
// container, a small hover affordance, and the absolute-positioned popover
// surface beneath. The wrapper carries `role="button"` + `tabIndex={0}`
// rather than nesting an actual `<button>` to avoid forcing a flex item
// renest, which complicated the column-baseline alignment.
//
// Popover content lists every `Entry` for the spelling — primary first,
// then other dialect variants — so the user can see all matches when the
// inline gloss only shows one.

import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import type { Dialect, Entry } from "../lib/types.ts";

const DIALECT_LABEL: Record<Dialect, string> = {
  "central": "Central",
  "cult-ciel": "Cult Ciel",
  "cluster": "Cluster",
  "alpha": "Alpha",
  "metafalss": "Metafalss",
  "pastalia": "Pastalia",
  "alpha-eolia": "Alpha-EOLIA",
  "unknown": "Unknown",
};

const HOVER_CLOSE_DELAY_MS = 100;

function EntryBlock({ entry }: { entry: Entry }) {
  return (
    <div class="space-y-1">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span class="font-mono text-sm font-semibold text-stone-100">
          {entry.word}
        </span>
        <span class="text-[11px] uppercase tracking-wide text-stone-400">
          {DIALECT_LABEL[entry.dialect]}
          {entry.unofficial ? " · unofficial" : ""}
        </span>
      </div>
      <div class="text-xs italic text-stone-400">{entry.partOfSpeech}</div>
      <div class="text-sm text-stone-100">{entry.meaning}</div>
      {entry.description && (
        <div class="text-xs leading-relaxed whitespace-pre-line text-stone-300">
          {entry.description}
        </div>
      )}
    </div>
  );
}

type Props = {
  entries: Entry[];
  primary: Entry;
  children: ComponentChildren;
};

export function WordPopover({ entries, primary, children }: Props) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = hover || pinned;

  function openHover() {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setHover(true);
  }

  function scheduleHoverClose() {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setHover(false);
      closeTimer.current = null;
    }, HOVER_CLOSE_DELAY_MS);
  }

  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!pinned) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setPinned(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinned(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  const ordered = [primary, ...entries.filter((e) => e !== primary)];

  return (
    <span
      ref={ref}
      class="relative inline-flex cursor-help rounded-md transition-colors hover:bg-stone-800/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500"
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-haspopup="dialog"
      onMouseEnter={openHover}
      onMouseLeave={scheduleHoverClose}
      onClick={() => setPinned((p) => !p)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setPinned((p) => !p);
        } else if (e.key === "Escape") {
          setPinned(false);
        }
      }}
    >
      {children}
      {open && (
        <div
          class="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 w-72 max-w-[calc(100vw-1rem)] rounded-lg border border-stone-700 bg-stone-900/95 p-3 space-y-3 text-left shadow-xl"
          role="dialog"
          aria-label={`Dictionary entry for ${primary.word}`}
          onMouseEnter={openHover}
          onMouseLeave={scheduleHoverClose}
          onClick={(e) => e.stopPropagation()}
        >
          {ordered.map((entry, i) => (
            <div key={i} class={i > 0 ? "border-t border-stone-800 pt-3" : ""}>
              <EntryBlock entry={entry} />
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
