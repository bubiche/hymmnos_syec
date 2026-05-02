// Controlled textarea — the only user input. Annotation runs live on
// every keystroke via App's debounced pipeline (no submit button by design).

import type { JSX } from "preact";

type Props = {
  value: string;
  onInput: (next: string) => void;
};

export function LyricsInput({ value, onInput }: Props) {
  const handleInput = (e: JSX.TargetedEvent<HTMLTextAreaElement>) => {
    onInput(e.currentTarget.value);
  };
  return (
    <textarea
      value={value}
      onInput={handleInput}
      placeholder="Paste a Hymmn here…"
      spellcheck={false}
      autocomplete="off"
      autocorrect="off"
      aria-label="Hymmnos lyrics input"
      class="w-full min-h-32 p-3 rounded-md bg-stone-900 text-stone-100 font-mono text-sm leading-relaxed resize-y border border-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-500"
    />
  );
}
