// Renders a single-voice token stream as an interlinear gloss. Each non-
// whitespace token becomes a fixed 3-row column — glyph (in a dialect-aware
// font), the Latin reading, and a short gloss — so the Latin baseline lines
// up across the whole line. Words with Pastalia decorations get an extra
// muted 4th row showing the matched bank-slot fills or vowel prefix/suffix.
//
// Emotion-sound tokens wrap that same column in a category-coloured pill.
// `EmotionSound` doesn't carry a dialect, so they default to the Hymmnos
// font — fine for now since the only cult-ciel emotion sound (`apea`) is
// rare and still readable in the Hymmnos glyph set.
//
// Markers, punctuation, unknowns: same column shape with empty glyph and
// gloss rows (` `) so they share vertical metrics with surrounding
// words. Whitespace tokens within a line are dropped at render — they
// only exist in `ParsedLine.tokens` so that the `tree` leaf indices stay
// aligned. Line breaks come from the `lines` array structure: one row
// per `ParsedLine`.
//
// When a line has a parse tree (`line.tree !== null`), the renderer walks
// the tree depth-first and wraps phrases in tinted ring boxes with a
// small phrase-name badge. Tokens that aren't part of the tree (trailing
// punctuation, whitespace) render outside the outermost box. When the
// tree is null (parse failed, header/footer line, or empty line), the
// renderer falls back to the flat token row — no boxes, just a column
// per non-whitespace token.
//
// Lines inside a PES block carry a `pes` field; the renderer adds a thin
// yellow left-border + native title tooltip showing the declared triple.
//
// Hover popovers (full dictionary entry, dialect variants) are step 12;
// this view shows only `primary.meaning` inline.

import { EmotionSoundPopover } from "./EmotionSoundPopover.tsx";
import { WordPopover } from "./WordPopover.tsx";
import type {
  AnnotatedSegment, ParsedLine,
} from "../lib/pipeline.ts";
import type { PhraseId, PhraseTree } from "../lib/syntax.ts";
import type {
  AnnotatedToken, Decorations, Dialect, EmotionCategory,
} from "../lib/types.ts";

type Props = {
  segment: AnnotatedSegment;
  // App-level toggle. When false, the renderer ignores `line.tree` and falls
  // back to the flat token row even on lines that parsed. Default true.
  showTree?: boolean;
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

// Phrase palette — one tint per reduced phrase id from `syntax.ts`. Box
// colours are kept distinct from the seven emotion-sound pill hues
// (amber/sky/rose/violet/pink/teal/stone) so saturated emotion-sound
// pills layer cleanly inside low-opacity phrase tints. The `name` field
// is the long-form expansion shown in the box's hover tooltip.
export type PhrasePaletteEntry = { box: string; badge: string; name: string };
export const PHRASE_PALETTE: Record<PhraseId, PhrasePaletteEntry> = {
  NP:  { box: "bg-indigo-500/5 ring-1 ring-indigo-400/30",   badge: "text-indigo-300",   name: "Noun Phrase" },
  VP:  { box: "bg-emerald-500/5 ring-1 ring-emerald-400/30", badge: "text-emerald-300", name: "Verb Phrase" },
  EVP: { box: "bg-fuchsia-500/5 ring-1 ring-fuchsia-400/30", badge: "text-fuchsia-300", name: "Emotion Verb Phrase" },
  AP:  { box: "bg-cyan-500/5 ring-1 ring-cyan-400/30",       badge: "text-cyan-300",     name: "Adjunct Phrase" },
  ESP: { box: "bg-yellow-500/5 ring-1 ring-yellow-400/30",   badge: "text-yellow-300",   name: "Emotion Sound Phrase" },
  SP:  { box: "bg-lime-500/5 ring-1 ring-lime-400/30",       badge: "text-lime-300",     name: "Subject Phrase" },
  PP:  { box: "bg-orange-500/5 ring-1 ring-orange-400/30",   badge: "text-orange-300",   name: "Preposition Phrase" },
  TP:  { box: "bg-slate-500/5 ring-1 ring-slate-400/30",     badge: "text-slate-300",    name: "Transitive Phrase" },
  EOP: { box: "bg-red-500/5 ring-1 ring-red-400/30",         badge: "text-red-300",      name: "Emotion Object Phrase" },
  SVP: { box: "bg-purple-500/5 ring-1 ring-purple-400/30",   badge: "text-purple-300",   name: "Subject-Verb Phrase" },
  // CP is the sentence root and MP is in the public phrase id type but
  // never produced by the current AST; both render with a muted neutral
  // box so the root's outer ring doesn't dominate the colour layout.
  CP:  { box: "bg-stone-500/5 ring-1 ring-stone-600/30",     badge: "text-stone-400",    name: "Coordinated Phrase (sentence)" },
  MP:  { box: "bg-stone-500/5 ring-1 ring-stone-600/30",     badge: "text-stone-400",    name: "Modifier Phrase" },
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

// First and last leaf indices for a subtree. Used to find the tokens that
// fall *between* two children of a phrase (typically whitespace and the
// occasional comma) so the renderer can place them inside the parent box.
function treeSpan(tree: PhraseTree): { first: number; last: number } {
  if (tree.kind === "leaf") {
    return { first: tree.tokenIndex, last: tree.tokenIndex };
  }
  let first = Infinity;
  let last = -Infinity;
  for (const child of tree.children) {
    const span = treeSpan(child);
    if (span.first < first) first = span.first;
    if (span.last > last) last = span.last;
  }
  return { first, last };
}

// Recursively render a tree node. Phrases produce a tinted ring box with
// a small phrase-name badge as the first inline child; the box's children
// are the rendered subtree children, with non-tree tokens (whitespace
// filtered, punctuation kept) interleaved between consecutive children
// according to their leaf spans.
function renderTreeNode(
  tree: PhraseTree,
  tokens: AnnotatedToken[],
  keyPath: string,
): preact.JSX.Element {
  if (tree.kind === "leaf") {
    return <TokenView key={keyPath} token={tokens[tree.tokenIndex]!} />;
  }
  const palette = PHRASE_PALETTE[tree.phrase];
  const childSpans = tree.children.map(treeSpan);
  const items: preact.JSX.Element[] = [];
  for (let i = 0; i < tree.children.length; i++) {
    items.push(renderTreeNode(tree.children[i]!, tokens, `${keyPath}.${i}`));
    if (i === tree.children.length - 1) continue;
    // Render any non-tree tokens between this child and the next: keep
    // punctuation visible (so commas inside a phrase don't disappear),
    // drop whitespace (rendered implicitly by Column margins).
    const start = childSpans[i]!.last + 1;
    const end = childSpans[i + 1]!.first;
    for (let k = start; k < end; k++) {
      const tok = tokens[k]!;
      if (tok.kind === "whitespace") continue;
      items.push(<TokenView key={`${keyPath}.b${i}.${k}`} token={tok} />);
    }
  }
  // CSS group-hover tooltip on the badge — native `title` is unreliable
  // (browsers/OSes/extensions can suppress it), and word/emotion-sound
  // popovers inside the box would intercept hover bubbling anyway.
  return (
    <span
      key={keyPath}
      class={`inline-flex flex-row flex-wrap items-start gap-x-0 px-1 py-0.5 my-0.5 mx-0.5 rounded-md ${palette.box}`}
    >
      <span class="relative inline-flex group/phrase self-start mt-1 mr-1">
        <span
          class={`text-[10px] font-semibold uppercase tracking-wider px-0.5 cursor-help ${palette.badge}`}
        >
          {tree.phrase}
        </span>
        <span
          class="pointer-events-none absolute left-0 top-full mt-1 z-30 whitespace-nowrap rounded border border-stone-700 bg-stone-900/95 px-2 py-1 text-[11px] text-stone-100 shadow-lg opacity-0 group-hover/phrase:opacity-100 transition-opacity"
        >
          {tree.phrase} — {palette.name}
        </span>
      </span>
      {items}
    </span>
  );
}

function renderLine(line: ParsedLine, showTree: boolean): preact.JSX.Element[] {
  if (!line.tree || !showTree) {
    return line.tokens
      .filter((t) => t.kind !== "whitespace")
      .map((t, ti) => <TokenView key={`flat.${ti}`} token={t} />);
  }
  const span = treeSpan(line.tree);
  const out: preact.JSX.Element[] = [];
  for (let k = 0; k < span.first; k++) {
    const tok = line.tokens[k]!;
    if (tok.kind === "whitespace") continue;
    out.push(<TokenView key={`pre.${k}`} token={tok} />);
  }
  out.push(renderTreeNode(line.tree, line.tokens, "t"));
  for (let k = span.last + 1; k < line.tokens.length; k++) {
    const tok = line.tokens[k]!;
    if (tok.kind === "whitespace") continue;
    out.push(<TokenView key={`post.${k}`} token={tok} />);
  }
  return out;
}

function pesIndicatorClass(pes: ParsedLine["pes"]): string {
  if (!pes) return "border-l-4 border-transparent pl-3";
  return "border-l-4 border-yellow-400/80 pl-3 bg-yellow-500/[0.04]";
}

function pesTooltip(pes: ParsedLine["pes"]): string | undefined {
  if (!pes) return undefined;
  const { esI, esII, esIII } = pes.context;
  return `PES ${pes.role}: ${esI} ${esII} ${esIII}`;
}

export function AnnotatedView({ segment, showTree = true }: Props) {
  return (
    <div class="space-y-2">
      {segment.lines.map((line, li) => (
        <div
          key={li}
          class={`flex flex-wrap items-start ${pesIndicatorClass(line.pes)}`}
          title={pesTooltip(line.pes)}
        >
          {renderLine(line, showTree)}
        </div>
      ))}
    </div>
  );
}
