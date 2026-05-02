// Renders a single-voice token stream as an interlinear gloss. Each non-
// whitespace token becomes a fixed 3-row column — glyph (in a dialect-aware
// font), the Latin reading, and a short gloss — so the Latin baseline lines
// up across the whole line. Words with Pastalia decorations get an extra
// muted 4th row showing the matched bank-slot fills or vowel prefix/suffix.
//
// Emotion-sound tokens wrap that same column in a category-coloured pill.
// `EmotionSound` doesn't carry a dialect, so they default to the Hymmnos
// font — fine for v1 since the only cult-ciel emotion sound (`apea`) is
// rare and still readable in the Hymmnos glyph set.
//
// Markers, punctuation, unknowns: same column shape with empty glyph and
// gloss rows (` `) so they share vertical metrics with surrounding
// words. Whitespace tokens are skipped except for `\n`, which forces a
// hard break — each input line becomes its own flex-wrap row.
//
// Hover popovers (full dictionary entry, dialect variants) are step 12;
// this view shows only `primary.meaning` inline.
//
// Caveat to verify in the browser: the user-supplied Hymmnos font may not
// have full lowercase coverage. If `Was yea ra` renders broken, we'll
// `text-transform: uppercase` the glyph row in step 13.

import { EmotionSoundPopover } from "./EmotionSoundPopover.tsx";
import { WordPopover } from "./WordPopover.tsx";
import type {
  AnnotatedSegment,
} from "../lib/pipeline.ts";
import type {
  AnnotatedToken, Decorations, Dialect, EmotionCategory,
} from "../lib/types.ts";

type Props = {
  segment: AnnotatedSegment;
};

export const CATEGORY_PILL: Record<EmotionCategory, string> = {
  joy:     "bg-amber-500/15 text-amber-100 ring-amber-400/40",
  sorrow:  "bg-sky-500/15 text-sky-100 ring-sky-400/40",
  anger:   "bg-rose-500/15 text-rose-100 ring-rose-400/40",
  focus:   "bg-violet-500/15 text-violet-100 ring-violet-400/40",
  love:    "bg-pink-500/15 text-pink-100 ring-pink-400/40",
  fear:    "bg-teal-500/15 text-teal-100 ring-teal-400/40",
  neutral: "bg-stone-500/15 text-stone-100 ring-stone-400/40",
};

const NBSP = " ";

function dialectFontFamily(dialect: Dialect | undefined): string | undefined {
  if (dialect === "cult-ciel") return "var(--font-ar-ciela)";
  if (dialect === undefined || dialect === "unknown") return undefined;
  return "var(--font-hymmnos)";
}

function decorationLine(d: Decorations): string {
  if (d.kind === "emotion-verb") {
    const slots = d.slots.map((s) => s ?? "·").join(" ");
    return d.verbSuffix
      ? `slots: ${slots}  ·  ${d.verbSuffix}`
      : `slots: ${slots}`;
  }
  const parts: string[] = [];
  if (d.prefix) parts.push(`pfx: ${d.prefix}`);
  if (d.suffix) parts.push(`sfx: ${d.suffix}`);
  return parts.join("  ·  ");
}

function splitLines(tokens: AnnotatedToken[]): AnnotatedToken[][] {
  const lines: AnnotatedToken[][] = [[]];
  for (const t of tokens) {
    if (t.kind === "whitespace") {
      const breaks = (t.text.match(/\n/g) ?? []).length;
      for (let i = 0; i < breaks; i++) lines.push([]);
      continue;
    }
    lines[lines.length - 1]!.push(t);
  }
  return lines;
}

function Column(props: {
  glyph: string;
  latin: string;
  gloss: string;
  decoration?: string;
  fontFamily?: string;
  pillClass?: string;
  latinClass?: string;
}) {
  const wrapper =
    "inline-flex flex-col items-center align-top px-1.5 py-1 mx-0.5 my-0.5 rounded-md " +
    (props.pillClass ?? "");
  return (
    <span class={wrapper}>
      <span
        class="text-2xl leading-none mb-1"
        style={props.fontFamily ? { fontFamily: props.fontFamily } : undefined}
      >
        {props.glyph}
      </span>
      <span class={`text-base leading-snug ${props.latinClass ?? ""}`}>
        {props.latin}
      </span>
      <span class="text-[11px] text-stone-400 leading-tight max-w-[16ch] text-center">
        {props.gloss}
      </span>
      {props.decoration && (
        <span class="text-[10px] text-stone-500 italic leading-tight mt-0.5">
          {props.decoration}
        </span>
      )}
    </span>
  );
}

function TokenView({ token }: { token: AnnotatedToken }) {
  if (token.kind === "emotion-sound") {
    return (
      <EmotionSoundPopover entry={token.entry}>
        <Column
          glyph={token.text}
          latin={token.text}
          gloss={token.entry.meaning}
          fontFamily="var(--font-hymmnos)"
          pillClass={`ring-1 ${CATEGORY_PILL[token.entry.category]}`}
        />
      </EmotionSoundPopover>
    );
  }
  if (token.kind === "word") {
    const fontFamily = dialectFontFamily(token.primary.dialect);
    return (
      <WordPopover entries={token.entries} primary={token.primary}>
        <Column
          glyph={fontFamily ? token.text : NBSP}
          latin={token.text}
          gloss={token.primary.meaning}
          decoration={
            token.decorations ? decorationLine(token.decorations) : undefined
          }
          fontFamily={fontFamily}
        />
      </WordPopover>
    );
  }
  if (token.kind === "marker") {
    // EXEC_* and the symbol markers (=>, /., ->) all have Hymmnos glyphs in
    // upstream presentations — including digits and `>>` in EXEC trailers,
    // which the salburg TTF covers. Render glyph above Latin to mirror.
    return (
      <Column
        glyph={token.text}
        latin={token.text}
        gloss={NBSP}
        fontFamily="var(--font-hymmnos)"
        latinClass="font-mono text-stone-300"
      />
    );
  }
  if (token.kind === "punctuation") {
    return (
      <Column
        glyph={NBSP}
        latin={token.text}
        gloss={NBSP}
        latinClass="text-stone-400"
      />
    );
  }
  // unknown
  return (
    <Column
      glyph={NBSP}
      latin={token.text}
      gloss={NBSP}
      latinClass="text-stone-600 line-through decoration-stone-700"
    />
  );
}

export function AnnotatedView({ segment }: Props) {
  const lines = splitLines(segment.tokens);
  return (
    <div class="space-y-2">
      {lines.map((line, li) => (
        <div key={li} class="flex flex-wrap items-start">
          {line.map((t, ti) => <TokenView key={ti} token={t} />)}
        </div>
      ))}
    </div>
  );
}
