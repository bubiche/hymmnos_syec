// Persistent Emotion Sounds preprocessor — line-level pass that runs ahead
// of binasphere/tokenize. Ported from upstream `common/transformations.py`
// at commit 75f5f4a8 (`_PERSISTANT_*_REGEXP`, `applyPersistentEmotionSounds`,
// `_applyPersistentEmotionSounds`).
//
// PES blocks declare a triple of emotion sounds (one each of ES(I)/ES(II)/
// ES(III)) that prefix every body sentence inside the block. Syntax:
//
//     <es_i> <es_ii> <es_iii> 0x vvi.   ← header
//     ...body lines...
//     1x AAs ixi.                        ← footer
//
// Inside the block, each body line is parsed *as if* prefixed by the triple,
// while still rendered in its original form (the synthetic triple is the
// parser's view, not the user's). Body lines split on ES(I) tokens — an
// ES(I) terminates the current phrase and starts a new one; only the first
// phrase gets the triple prepended.
//
// Output: a Map keyed by the original `\n`-split line index. Phase 3
// pipeline aligns to this convention.
//
// Divergences from upstream, intentional for a live editor:
//   - Upstream `applyPersistentEmotionSounds` raises on a missing footer
//     and tolerates bad header words (falls back to .title() + unknown
//     bucket). We invert: bad header word → block malformed → passthrough,
//     because the user is mid-typing and unrecognized header words are far
//     more common than truly invalid Pastalia. Missing footer is also
//     malformed → passthrough (no exception; renderer falls through to v1).

import { pickPrimary } from "./annotate.ts";
import type { Corpus, Entry } from "./types.ts";

// `_PERSISTANT_START_REGEXP` from upstream transformations.py line 31.
const HEADER_REGEXP = /^([A-Za-z]+) ([A-Za-z]+) ([A-Za-z]+) 0x vvi\.$/;
// `_PERSISTANT_END_REGEXP` from upstream line 32.
const FOOTER_REGEXP = /^1x AAs ixi\.$/;

export type PesContext = {
  // Canonical word forms taken from the corpus when the header word resolves
  // to a known entry; otherwise the raw input casing. Display uses the
  // original line text — these fields exist for the visual indicator and
  // for the parse-input prefix.
  esI: string;
  esII: string;
  esIII: string;
};

// One parse-input chunk per phrase. `syntheticPrefix` is the count of
// leading tokens (always 0 or 3) that were prepended by PES expansion,
// not present in the original body line. Phase 4 strips that many leaves
// off the front of the resulting parse tree before walking it.
//
// We track this explicitly because a body line that legitimately begins
// with the canonical triple (e.g. user types `Was yea ra rudje` inside a
// `Was yea ra 0x vvi.` block) is string-identical to a phrase that had
// the triple prepended. The two need opposite rendering — one displays
// the prefix tokens, the other hides them — so the count has to be
// recorded at expansion time, not inferred later.
export type PesPhrase = {
  parseInput: string;
  syntheticPrefix: 0 | 3;
};

export type PesBlockMembership =
  | { role: "header"; context: PesContext }
  | { role: "footer"; context: PesContext }
  | { role: "body"; context: PesContext; phrases: PesPhrase[] };

export type PesExpansion = {
  byLine: Map<number, PesBlockMembership>;
};

// Index of the corpus's primary entry per lowercased word. Uses
// annotate.ts's pickPrimary so PES and the downstream annotate pass agree
// on which dialect variant is "the entry" for a given spelling — drift
// here would have header validation, ES(I) splitting, and the renderer
// looking at different entries.
function buildWordIndex(corpus: Corpus): Map<string, Entry> {
  const cache = wordIndexCache.get(corpus);
  if (cache) return cache;

  const buckets = new Map<string, Entry[]>();
  for (const e of corpus.entries) {
    const key = e.word.toLowerCase();
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(e);
  }

  const index = new Map<string, Entry>();
  for (const [key, bucket] of buckets) {
    index.set(key, pickPrimary(bucket));
  }

  wordIndexCache.set(corpus, index);
  return index;
}

const wordIndexCache = new WeakMap<Corpus, Map<string, Entry>>();

// `SYNTAX_CLASS_REV` strict tuples from upstream lookup.py lines 41–55.
// PES uses these for both header validation and body ES(I) splitting:
// the aggregate classes (8/10/11/20) that include LEX_ESii are NOT counted
// as ES(II), even though they doubly classify as one. Same logic for any
// future ES(I)/(III) aggregates.
const ES_I_CLASSES = new Set([14]);
const ES_II_CLASSES = new Set([7]);
const ES_III_CLASSES = new Set([13]);

function lookupClassCode(word: string, index: Map<string, Entry>): number {
  return index.get(word.toLowerCase())?.classCode ?? 0;
}

function applyToBodyLine(line: string, ctx: PesContext, index: Map<string, Entry>): PesPhrase[] {
  // Mirrors upstream `_applyPersistentEmotionSounds`. `buffer` holds the
  // current phrase; `phrases` accumulates completed phrases. An ES(I)
  // mid-line flushes buffer then starts a new phrase with that ES(I).
  // `currentPrefix` tracks whether the active buffer began with the
  // synthetic triple — only the first phrase can have that, and only if
  // the line didn't itself begin with an ES(I).
  const words = line.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return [];

  const phrases: PesPhrase[] = [];
  let buffer: string[] = [];
  let currentPrefix: 0 | 3 = 0;

  for (const w of words) {
    const isEsI = ES_I_CLASSES.has(lookupClassCode(w, index));
    if (isEsI && buffer.length > 0) {
      phrases.push({ parseInput: buffer.join(" "), syntheticPrefix: currentPrefix });
      buffer = [];
      currentPrefix = 0;
    }
    if (buffer.length === 0 && phrases.length === 0 && !isEsI) {
      buffer.push(ctx.esI, ctx.esII, ctx.esIII);
      currentPrefix = 3;
    }
    buffer.push(w);
  }

  if (buffer.length > 0) {
    phrases.push({ parseInput: buffer.join(" "), syntheticPrefix: currentPrefix });
  }
  return phrases;
}

function validateHeader(
  match: RegExpExecArray,
  index: Map<string, Entry>,
): PesContext | null {
  const [, w1, w2, w3] = match;
  const e1 = index.get(w1!.toLowerCase());
  const e2 = index.get(w2!.toLowerCase());
  const e3 = index.get(w3!.toLowerCase());
  if (!e1 || !ES_I_CLASSES.has(e1.classCode)) return null;
  if (!e2 || !ES_II_CLASSES.has(e2.classCode)) return null;
  if (!e3 || !ES_III_CLASSES.has(e3.classCode)) return null;
  // After validation every header word resolves to a corpus entry, so we
  // surface the canonical word form (handles e.g. "WAS" → "Was").
  return { esI: e1.word, esII: e2.word, esIII: e3.word };
}

export function expandPesBlocks(input: string, corpus: Corpus): PesExpansion {
  const index = buildWordIndex(corpus);
  const lines = input.split("\n");
  const byLine = new Map<number, PesBlockMembership>();

  // State machine: walk lines forward, scan ahead for the matching footer
  // when we find a header. Nested PES is not supported upstream. A
  // header-shaped line inside an open block is treated as a body line of
  // the outer block (we resume scanning from the outer footer + 1, never
  // recursing into a fresh start).
  let i = 0;
  while (i < lines.length) {
    const headerMatch = HEADER_REGEXP.exec(lines[i]!);
    if (!headerMatch) {
      i++;
      continue;
    }

    const ctx = validateHeader(headerMatch, index);
    if (!ctx) {
      // Header shape but bad ES classes → block is malformed, fall through.
      i++;
      continue;
    }

    // Look ahead for the footer.
    let footer = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (FOOTER_REGEXP.test(lines[j]!)) {
        footer = j;
        break;
      }
    }
    if (footer === -1) {
      // Unterminated block → malformed, fall through. The user may still
      // be typing the body; v1 rendering will hold until they close it.
      i++;
      continue;
    }

    byLine.set(i, { role: "header", context: ctx });
    for (let j = i + 1; j < footer; j++) {
      byLine.set(j, {
        role: "body",
        context: ctx,
        phrases: applyToBodyLine(lines[j]!, ctx, index),
      });
    }
    byLine.set(footer, { role: "footer", context: ctx });

    i = footer + 1;
  }

  return { byLine };
}
