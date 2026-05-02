// Hover/tap popover for emotion-sound pills, mirroring `<WordPopover>`'s
// trigger behaviour (hover with debounced close + click-to-pin /
// click-outside / Escape) so the affordance is consistent across token
// kinds. Content differs: emotion sounds aren't dictionary entries, so
// there's no part-of-speech / dialect / description — instead we surface
// the canonical phrase casing, the category badge (which lifts the
// colour-only encoding into a named label), and the meaning gloss.
//
// Trigger machinery is intentionally duplicated from `<WordPopover>`
// rather than extracted into a shared primitive — keeps each component
// self-contained and easy to read; if a third popover kind shows up we
// can revisit.

import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import { CATEGORY_PILL } from "./AnnotatedView.tsx";
import type { EmotionSound } from "../lib/types.ts";

const HOVER_CLOSE_DELAY_MS = 100;

type Props = {
  entry: EmotionSound;
  children: ComponentChildren;
};

export function EmotionSoundPopover({ entry, children }: Props) {
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
          class="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 w-72 max-w-[calc(100vw-1rem)] rounded-lg border border-stone-700 bg-stone-900/95 p-3 space-y-2 text-left shadow-xl"
          role="dialog"
          aria-label={`Emotion sound entry for ${entry.phrase}`}
          onMouseEnter={openHover}
          onMouseLeave={scheduleHoverClose}
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span class="font-mono text-sm font-semibold text-stone-100">
              {entry.phrase}
            </span>
            <span
              class={`inline-flex px-2 py-0.5 rounded text-[10px] uppercase tracking-wide ring-1 ${CATEGORY_PILL[entry.category]}`}
            >
              {entry.category}
            </span>
          </div>
          <div class="text-xs italic text-stone-400">emotion sound</div>
          <div class="text-sm text-stone-100">{entry.meaning}</div>
        </div>
      )}
    </span>
  );
}
