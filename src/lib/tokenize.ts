// Walks lyrics input left-to-right and emits a flat token stream. Whitespace
// is preserved as its own kind and `text` always carries the user's original
// casing — lookups are case-insensitive but display is not.
//
// Priority at each position (per PLAN.md step 5):
//   emotion-sound phrase (longest case-insensitive match, word-bounded)
//   → special-char dictionary entry (`Re=Nation`, `U-TA`, `<-x`, ...)
//   → morphology lookup (tryEmotionVerb, then tryGeneralWord)
//   → symbol marker (=>, /., ->) or word-shaped marker (EXEC_*)
//   → punctuation (.,;!?)
//   → whitespace
//   → unknown (single-char fallback)
//
// Whitespace is dispatched first in the loop for efficiency; since \s only
// matches itself it can't be ambiguous against the other matchers. The
// special-char step exists because the standard \w+ word run would split
// entries like `Re=Nation` at the `=`; matching them by literal regex
// alternation before \w+ keeps them intact.

import { tryEmotionVerb, tryGeneralWord } from "./morphology.ts";
import type { Corpus, EmotionSound, Token } from "./types.ts";

type PhraseMatcher = {
  regexp: RegExp;
  byLowercase: Map<string, EmotionSound>;
};

const phraseMatcherCache = new WeakMap<Corpus, PhraseMatcher>();
const specialEntryCache = new WeakMap<Corpus, RegExp | null>();

const SYMBOL_MARKER_REGEXP = /^(?:=>|\/\.|->)/;
const WORD_RUN_REGEXP = /^\w+/;
const PUNCTUATION_REGEXP = /^[.,;!?]/;
const WHITESPACE_REGEXP = /^\s+/;
const EXEC_MARKER_REGEXP = /^EXEC_\w+$/i;

function getPhraseMatcher(corpus: Corpus): PhraseMatcher {
  const cached = phraseMatcherCache.get(corpus);
  if (cached) return cached;

  // Sort longest-first: JS regex alternation tries alternatives left-to-right
  // and returns the first that matches, so descending length makes
  // "first match" equivalent to "longest match" for prefix-overlapping
  // phrases like "ga" / "gaya" / "gagis".
  const sorted = [...corpus.emotionSounds].sort(
    (a, b) => b.phrase.length - a.phrase.length,
  );

  const byLowercase = new Map<string, EmotionSound>();
  for (const s of sorted) byLowercase.set(s.phrase.toLowerCase(), s);

  const escaped = sorted.map((s) =>
    // Escape regex metacharacters; collapse internal whitespace to \s+ so
    // future multi-word phrases tolerate variable spacing in input.
    s.phrase
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+"),
  );

  // (?!\w) ends the match at a word boundary so "Was" doesn't match inside
  // "Wassup", but trailing punctuation, whitespace, or EOF is accepted.
  const regexp = new RegExp(`^(?:${escaped.join("|")})(?!\\w)`, "i");

  const matcher: PhraseMatcher = { regexp, byLowercase };
  phraseMatcherCache.set(corpus, matcher);
  return matcher;
}

function getSpecialEntryRegexp(corpus: Corpus): RegExp | null {
  if (specialEntryCache.has(corpus)) return specialEntryCache.get(corpus)!;

  // Dictionary entries whose canonical spelling contains chars outside \w
  // (e.g. `Re=Nation`, `U-TA`, `<-x`). Emotion verbs are excluded — their
  // `.` markers are bank-slot templates handled by tryEmotionVerb, never
  // matched as literal text.
  const words = new Set<string>();
  for (const e of corpus.entries) {
    if (e.partOfSpeech !== "Emotion Verb" && /[^\w]/.test(e.word)) {
      words.add(e.word);
    }
  }

  if (words.size === 0) {
    specialEntryCache.set(corpus, null);
    return null;
  }

  const sorted = [...words].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((w) =>
    w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const regexp = new RegExp(`^(?:${escaped.join("|")})(?!\\w)`, "i");
  specialEntryCache.set(corpus, regexp);
  return regexp;
}

export function tokenize(input: string, corpus: Corpus): Token[] {
  const tokens: Token[] = [];
  const { regexp: phraseRegexp, byLowercase } = getPhraseMatcher(corpus);
  const specialRegexp = getSpecialEntryRegexp(corpus);
  let i = 0;

  while (i < input.length) {
    const rest = input.slice(i);

    const ws = WHITESPACE_REGEXP.exec(rest);
    if (ws) {
      tokens.push({ kind: "whitespace", text: ws[0] });
      i += ws[0].length;
      continue;
    }

    const phrase = phraseRegexp.exec(rest);
    if (phrase) {
      const text = phrase[0];
      const entry = byLowercase.get(text.toLowerCase())!;
      tokens.push({ kind: "emotion-sound", text, entry });
      i += text.length;
      continue;
    }

    if (specialRegexp) {
      const special = specialRegexp.exec(rest);
      if (special) {
        const text = special[0];
        // Guaranteed non-null: regex alternatives are drawn from corpus
        // entries, and tryGeneralWord's direct lowercase lookup hits.
        const gen = tryGeneralWord(text, corpus)!;
        tokens.push({ kind: "word", text, entries: gen.entries });
        i += text.length;
        continue;
      }
    }

    const word = WORD_RUN_REGEXP.exec(rest);
    if (word) {
      const text = word[0];
      const ev = tryEmotionVerb(text, corpus);
      if (ev) {
        tokens.push({
          kind: "word",
          text,
          entries: ev.entries,
          decorations: ev.decorations,
        });
        i += text.length;
        continue;
      }
      const gen = tryGeneralWord(text, corpus);
      if (gen) {
        const tok: Token = { kind: "word", text, entries: gen.entries };
        if (gen.decorations) tok.decorations = gen.decorations;
        tokens.push(tok);
        i += text.length;
        continue;
      }
      if (EXEC_MARKER_REGEXP.test(text)) {
        tokens.push({ kind: "marker", text });
        i += text.length;
        continue;
      }
      tokens.push({ kind: "unknown", text });
      i += text.length;
      continue;
    }

    const marker = SYMBOL_MARKER_REGEXP.exec(rest);
    if (marker) {
      tokens.push({ kind: "marker", text: marker[0] });
      i += marker[0].length;
      continue;
    }

    const punct = PUNCTUATION_REGEXP.exec(rest);
    if (punct) {
      tokens.push({ kind: "punctuation", text: punct[0] });
      i += 1;
      continue;
    }

    tokens.push({ kind: "unknown", text: rest[0]! });
    i += 1;
  }

  return tokens;
}
