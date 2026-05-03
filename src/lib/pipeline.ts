// Top-level annotation pipeline: input string → grouped, annotated output.
//
// The renderer needs more than a flat list of segments — Binasphere blocks
// span multiple voices that should render side-by-side under a shared
// reference strip, while non-encoded text renders as plain interlinear
// gloss. So this composer emits `AnnotatedGroup[]` discriminated by `kind`:
//
//   passthrough → one annotated segment, render with `<AnnotatedView>`
//   block       → N voice segments + the `BinasphereBlock` they share,
//                 render with `<BinasphereView>`
//
// Voice segments belonging to the same Binasphere block are coalesced by
// reference equality on the `block` field — the decoder already shares one
// block ref across all of a block's voice segments.
//
// Each segment carries `lines: ParsedLine[]` rather than a flat token list,
// so the renderer (Phase 4) can wrap each line's tree in tinted phrase
// boxes. Lines map 1:1 to `\n`-split source lines, except that PES body
// lines split on embedded ES(I) tokens — a body line `chs hymmnos Was rudje`
// emits TWO ParsedLines, one per phrase, since the ES(I) split is a
// semantic sentence break upstream.

import { annotate } from "./annotate.ts";
import { decode } from "./binasphere.ts";
import { expandPesBlocks, type PesBlockMembership, type PesContext } from "./pes.ts";
import { parseLine, type PhraseTree } from "./syntax.ts";
import { tokenize } from "./tokenize.ts";
import type {
  AnnotatedToken, BinasphereBlock, Corpus,
} from "./types.ts";

// One parsed unit per visual row. For non-PES lines: one ParsedLine per
// `\n`-split source line. For PES body lines with an embedded ES(I) split:
// one ParsedLine per phrase. `tokens` are display tokens — for PES body
// phrases with `syntheticPrefix=3`, the prepended triple has been sliced
// off and the tree's leaf indices have been rewritten to match.
//
// Whitespace within a line is preserved in `tokens` so tree leaf indices
// align; the renderer filters whitespace at render time.
export type ParsedLine = {
  tokens: AnnotatedToken[];
  tree: PhraseTree | null;
  pes?: { role: "header" | "footer" | "body"; context: PesContext };
};

export type AnnotatedSegment = {
  voice: number | null;
  lines: ParsedLine[];
};

export type AnnotatedGroup =
  | { kind: "passthrough"; segment: AnnotatedSegment }
  | { kind: "block"; block: BinasphereBlock; voices: AnnotatedSegment[] };

// Number of parse-input tokens consumed by the synthetic triple prefix
// `${esI} ${esII} ${esIII} ` when tokenized: 3 word tokens + 3 single-space
// whitespace tokens = 6. Pinned by a unit test against the live tokenizer
// so a tokenizer change (e.g. ES words promoted to emotion-sound entries
// that match a longer regex) trips the test instead of mis-slicing trees.
//
// Note: pes.ts joins phrase words with single spaces (`buffer.join(" ")`),
// so any multi-space whitespace in the user's body line is normalized in
// the parse input. The renderer therefore shows single-spaced tokens for
// `syntheticPrefix=3` body phrases; matches upstream.
const PREFIX_PARSE_TOKEN_COUNT = 6;

// First three word/emotion-sound tokens of a PES header line, wrapped in
// an ESP node. Returns null if fewer than three are present (the header
// regex guarantees three, but the tokenizer could in principle fold one
// into a multi-word emotion-sound phrase — defensive).
function synthesizeHeaderEspTree(tokens: AnnotatedToken[]): PhraseTree | null {
  const wordIndices: number[] = [];
  for (let i = 0; i < tokens.length && wordIndices.length < 3; i++) {
    const k = tokens[i]!.kind;
    if (k === "word" || k === "emotion-sound") wordIndices.push(i);
  }
  if (wordIndices.length < 3) return null;
  return {
    kind: "phrase",
    phrase: "ESP",
    children: wordIndices.map((idx) => ({ kind: "leaf", tokenIndex: idx })),
  };
}

// Drop leaves whose original index lies in the synthetic prefix; rewrite
// surviving leaves to point into the post-slice token array. Phrases that
// end up with no surviving children (e.g. ESP, which contains only the
// synthetic triple) are pruned so the renderer never sees an empty box.
function rewriteTreeForBody(
  tree: PhraseTree,
  offset: number,
): PhraseTree | null {
  if (tree.kind === "leaf") {
    if (tree.tokenIndex < offset) return null;
    return { kind: "leaf", tokenIndex: tree.tokenIndex - offset };
  }
  const children = tree.children
    .map((c) => rewriteTreeForBody(c, offset))
    .filter((c): c is PhraseTree => c !== null);
  if (children.length === 0) return null;
  return { kind: "phrase", phrase: tree.phrase, children };
}

function buildLinesForSubline(
  text: string,
  membership: PesBlockMembership | undefined,
  corpus: Corpus,
): ParsedLine[] {
  if (!membership) {
    const tokens = annotate(tokenize(text, corpus));
    const tree = parseLine(tokens, corpus);
    return [{ tokens, tree }];
  }

  if (membership.role === "header") {
    // The header line literally is `<es_i> <es_ii> <es_iii> 0x vvi.` — the
    // first three word/emotion-sound tokens form an ESP. parseLine isn't
    // run on the header (the trailing `0x vvi.` syntax markers don't parse
    // as a sentence), but we still want the ESP highlighting + hover so
    // the user can see what's being declared. Synthesize the tree here.
    const tokens = annotate(tokenize(text, corpus));
    const tree = synthesizeHeaderEspTree(tokens);
    return [
      {
        tokens,
        tree,
        pes: { role: "header", context: membership.context },
      },
    ];
  }
  if (membership.role === "footer") {
    const tokens = annotate(tokenize(text, corpus));
    return [
      {
        tokens,
        tree: null,
        pes: { role: "footer", context: membership.context },
      },
    ];
  }

  // body — one ParsedLine per phrase. Empty body lines have phrases=[];
  // emit a single blank ParsedLine carrying the PES context so the
  // renderer can still mark it as inside the block.
  if (membership.phrases.length === 0) {
    const tokens = annotate(tokenize(text, corpus));
    return [
      {
        tokens,
        tree: null,
        pes: { role: "body", context: membership.context },
      },
    ];
  }

  const lines: ParsedLine[] = [];
  for (const phrase of membership.phrases) {
    const parseTokens = annotate(tokenize(phrase.parseInput, corpus));
    const parseTree = parseLine(parseTokens, corpus);

    if (phrase.syntheticPrefix === 0) {
      lines.push({
        tokens: parseTokens,
        tree: parseTree,
        pes: { role: "body", context: membership.context },
      });
      continue;
    }

    const tokens = parseTokens.slice(PREFIX_PARSE_TOKEN_COUNT);
    const tree = parseTree
      ? rewriteTreeForBody(parseTree, PREFIX_PARSE_TOKEN_COUNT)
      : null;
    lines.push({
      tokens,
      tree,
      pes: { role: "body", context: membership.context },
    });
  }
  return lines;
}

export function annotateInput(
  input: string,
  corpus: Corpus,
): AnnotatedGroup[] {
  // Normalize line endings before any line-aware step. The PES header /
  // footer regexes use `$` end-of-line anchors and run on a `\n`-split
  // input; a stray trailing `\r` from a pasted CRLF source breaks
  // `vvi\.$` and `ixi\.$` silently — the user sees no header bar and
  // no error. pes.test.ts pinned this as a Phase 3 responsibility.
  input = input.replace(/\r\n?/g, "\n");
  const { byLine } = expandPesBlocks(input, corpus);
  const groups: AnnotatedGroup[] = [];

  let openBlock: BinasphereBlock | null = null;
  let openVoices: AnnotatedSegment[] = [];

  const flushBlock = () => {
    if (openBlock !== null) {
      groups.push({ kind: "block", block: openBlock, voices: openVoices });
      openBlock = null;
      openVoices = [];
    }
  };

  // Track the raw `\n`-split input line index as decode() emits segments.
  // PES blocks index by raw input lines; binasphere consumes one input line
  // per block (regardless of voice count), passthrough segments span N
  // contiguous non-binasphere lines joined by `\n`.
  let lineCursor = 0;

  for (const seg of decode(input)) {
    if (seg.voice === null) {
      flushBlock();
      const sublines = seg.text.split("\n");
      const lines: ParsedLine[] = [];
      for (let i = 0; i < sublines.length; i++) {
        const lineIdx = lineCursor + i;
        const membership = byLine.get(lineIdx);
        for (const pl of buildLinesForSubline(sublines[i]!, membership, corpus)) {
          lines.push(pl);
        }
      }
      lineCursor += sublines.length;
      groups.push({ kind: "passthrough", segment: { voice: null, lines } });
      continue;
    }

    // Voice segment. Voices of the same block share one block ref; the
    // first voice of a new block consumes one input line. PES context
    // does not propagate into binasphere voices — header/footer markers
    // bracketing a binasphere line surface as PES-marked passthroughs
    // around the block, but the body voices themselves are rendered
    // without pes context.
    if (seg.block !== openBlock) {
      flushBlock();
      openBlock = seg.block;
      lineCursor += 1;
    }
    // Decoded voice text typically contains multiple sentences joined by
    // ` / ` (Hymmnos sentence separator). Split on `/` so each sentence
    // becomes its own ParsedLine and can parse on its own — the strict
    // coverage gate in syntax.ts rejects multi-sentence input as a
    // single line. Don't split on `.` because Pastalia uses `x.` as a
    // construct marker; period is end-of-sentence punctuation that
    // syntax.ts already strips. An empty voice falls back to one blank
    // ParsedLine so the BinasphereView still gets a column.
    const fragments = seg.text
      .split("/")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const lines: ParsedLine[] = fragments.length === 0
      ? [{ tokens: annotate(tokenize(seg.text, corpus)), tree: null }]
      : fragments.map((fragment) => {
          const tokens = annotate(tokenize(fragment, corpus));
          const tree = parseLine(tokens, corpus);
          return { tokens, tree };
        });
    openVoices.push({ voice: seg.voice, lines });
  }
  flushBlock();

  return groups;
}
