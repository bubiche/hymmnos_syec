// Word-level analyzer ported from upstream `common/lookup.py` at
// commit 75f5f4a8. Two entry points:
//
//   tryEmotionVerb(word, corpus)   ← match a Pastalia emotion verb (class 1)
//                                    with infixed emotion vowels and an
//                                    optional mood suffix.
//   tryGeneralWord(word, corpus)   ← direct dictionary lookup, falling back
//                                    to a Pastalia-decorated structure
//                                    (emotion-vowel prefix / `_suffix`).
//
// Tokenize order is "emotion-verb → general → unknown". Both functions
// return `null` to signal no match so the tokenizer can fall through.
//
// One deliberate deviation from upstream: regex matches are case-insensitive
// (the `i` flag below). Upstream Python uses case-sensitive `re.compile`,
// which would force users to type emotion vowels in uppercase.

import type {
  Corpus, Entry, EmotionVerbDecorations, GeneralDecorations,
} from "./types.ts";

// Order mirrors upstream EMOTION_VOWELS. Alternatives don't share prefixes
// across length groups (singles A/I/U/E/O/N, doubles all start with Y,
// triples all start with L), so leftmost-first matching converges
// regardless of order — but keep upstream's order for fidelity.
const EMOTION_VOWELS =
  "A|I|U|E|O|N|YA|YI|YU|YE|YO|YN|LYA|LYI|LYU|LYE|LYO|LYN";

// Optional emotion-vowel prefix, lazy body, optional `_suffix`.
const WORD_STRUCTURE_REGEXP = new RegExp(
  `^(${EMOTION_VOWELS})?(.+?)(_\\w+)?$`,
  "i",
);

type EmotionVerbRegex = {
  regexp: RegExp;
  slotCount: number;
  entries: Entry[];
};

const verbRegexCache = new WeakMap<Corpus, EmotionVerbRegex[]>();
const wordIndexCache = new WeakMap<Corpus, Map<string, Entry[]>>();

function getVerbRegexes(corpus: Corpus): EmotionVerbRegex[] {
  const cached = verbRegexCache.get(corpus);
  if (cached) return cached;

  const byWord = new Map<string, Entry[]>();
  for (const e of corpus.entries) {
    if (e.partOfSpeech !== "Emotion Verb") continue;
    const arr = byWord.get(e.word) ?? [];
    arr.push(e);
    byWord.set(e.word, arr);
  }

  const built: EmotionVerbRegex[] = [];
  for (const [word, entries] of byWord) {
    // Replace each `.` bank-slot marker with an optional capture group
    // matching either an emotion vowel or a literal `.` (so the bare
    // dictionary form like "a.u.k." still matches with all slots empty).
    let pattern = "";
    let slotCount = 0;
    for (const ch of word) {
      if (ch === ".") {
        pattern += `(${EMOTION_VOWELS}|\\.)?`;
        slotCount++;
      } else {
        // Emotion-verb dict words are letters + dots only (verified at
        // build-corpus time), so no regex escape needed.
        pattern += ch;
      }
    }
    const regexp = new RegExp(`^${pattern}(eh|aye|za)?$`, "i");
    built.push({ regexp, slotCount, entries });
  }

  verbRegexCache.set(corpus, built);
  return built;
}

function getWordIndex(corpus: Corpus): Map<string, Entry[]> {
  const cached = wordIndexCache.get(corpus);
  if (cached) return cached;

  const idx = new Map<string, Entry[]>();
  for (const e of corpus.entries) {
    const key = e.word.toLowerCase();
    const arr = idx.get(key) ?? [];
    arr.push(e);
    idx.set(key, arr);
  }
  wordIndexCache.set(corpus, idx);
  return idx;
}

export type EmotionVerbMatch = {
  entries: Entry[];
  decorations: EmotionVerbDecorations;
};

export type GeneralMatch = {
  entries: Entry[];
  decorations?: GeneralDecorations;
};

export function tryEmotionVerb(
  word: string,
  corpus: Corpus,
): EmotionVerbMatch | null {
  for (const { regexp, slotCount, entries } of getVerbRegexes(corpus)) {
    const m = regexp.exec(word);
    if (!m) continue;

    const slots: (string | null)[] = [];
    for (let i = 1; i <= slotCount; i++) {
      const g = m[i];
      slots.push(g && g !== "." ? g : null);
    }
    const decorations: EmotionVerbDecorations = { kind: "emotion-verb", slots };
    const verbSuffix = m[slotCount + 1];
    if (verbSuffix) decorations.verbSuffix = verbSuffix;
    return { entries, decorations };
  }
  return null;
}

export function tryGeneralWord(
  word: string,
  corpus: Corpus,
): GeneralMatch | null {
  const idx = getWordIndex(corpus);

  // Direct dict-first lookup. Mirrors upstream's `readWord` short-circuit
  // and is what makes words like "adyya" (which start with the emotion
  // vowel "A") resolve correctly — without this, the structure regex
  // would greedily eat the leading "A" as a prefix and miss the entry.
  const direct = idx.get(word.toLowerCase());
  if (direct) {
    return { entries: direct };
  }

  const m = WORD_STRUCTURE_REGEXP.exec(word);
  if (!m) return null;

  const prefix = m[1] || undefined;
  const body = m[2]!;
  const suffix = m[3] || undefined;

  // Direct lookup already covered the no-decoration case; if the regex
  // produced no prefix and no suffix, the body equals the input and
  // re-querying it would just miss again.
  if (!prefix && !suffix) return null;

  const bodyEntries = idx.get(body.toLowerCase());
  if (!bodyEntries) return null;

  const decorations: GeneralDecorations = { kind: "general" };
  if (prefix) decorations.prefix = prefix;
  if (suffix) decorations.suffix = suffix;
  return { entries: bodyEntries, decorations };
}
