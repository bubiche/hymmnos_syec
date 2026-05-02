import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { tokenize } from "./tokenize.ts";
import type { Corpus } from "./types.ts";

const require = createRequire(import.meta.url);
const corpus = require("../../data/corpus.json") as Corpus;

test("emotion-sound phrases beat morphology and preserve casing", () => {
  // "Was", "yea", "ra" are each both an emotion-sound phrase AND an Entry
  // record (with partOfSpeech "Emotion Sound (...)"). The tokenizer must
  // classify them as `emotion-sound`, not `word`. The first phrase also
  // verifies the byLowercase join: "Was" looks up the entry whose
  // canonical phrase casing is "Was".
  const tokens = tokenize("Was yea ra", corpus);
  assert.deepEqual(
    tokens.map((t) => t.kind),
    ["emotion-sound", "whitespace", "emotion-sound", "whitespace", "emotion-sound"],
  );
  const first = tokens[0]!;
  assert.equal(first.kind, "emotion-sound");
  assert.equal(first.text, "Was");
  if (first.kind === "emotion-sound") {
    assert.equal(first.entry.phrase, "Was");
    assert.equal(first.entry.category, "neutral");
  }
});

test("word kind carries morphology decorations through", () => {
  // "Yacia" = emotion-vowel prefix "Ya" + Pastalia noun "cia" (sky).
  // Exercises the morphology call path inside the word branch.
  const tokens = tokenize("Yacia", corpus);
  assert.equal(tokens.length, 1);
  const t = tokens[0]!;
  assert.equal(t.kind, "word");
  if (t.kind === "word") {
    assert.equal(t.text, "Yacia");
    assert.equal(t.entries[0]!.word, "cia");
    assert.deepEqual(t.decorations, { kind: "general", prefix: "Ya" });
  }
});

test("symbol markers and EXEC_* both emit marker tokens", () => {
  const tokens = tokenize("=> /. -> EXEC_HYMME", corpus);
  const marks = tokens.filter((t) => t.kind === "marker").map((t) => t.text);
  assert.deepEqual(marks, ["=>", "/.", "->", "EXEC_HYMME"]);
});

test("punctuation and whitespace are preserved as separate tokens", () => {
  const tokens = tokenize("adyya, cia.", corpus);
  assert.deepEqual(
    tokens.map((t) => ({ kind: t.kind, text: t.text })),
    [
      { kind: "word", text: "adyya" },
      { kind: "punctuation", text: "," },
      { kind: "whitespace", text: " " },
      { kind: "word", text: "cia" },
      { kind: "punctuation", text: "." },
    ],
  );
});

test("dictionary entries with non-word chars stay intact", () => {
  // `Re=Nation`, `U-TA`, `<-x` would each fragment under a plain \w+ word
  // run; the special-char matcher keeps them whole. Mixing them with `->`
  // also confirms the symbol-marker regex still wins on its own characters.
  const tokens = tokenize("Re=Nation U-TA <-x ->", corpus);
  assert.deepEqual(
    tokens.map((t) => ({ kind: t.kind, text: t.text })),
    [
      { kind: "word", text: "Re=Nation" },
      { kind: "whitespace", text: " " },
      { kind: "word", text: "U-TA" },
      { kind: "whitespace", text: " " },
      { kind: "word", text: "<-x" },
      { kind: "whitespace", text: " " },
      { kind: "marker", text: "->" },
    ],
  );
  const reNation = tokens[0]!;
  if (reNation.kind === "word") {
    assert.equal(reNation.entries[0]!.word, "Re=Nation");
    assert.equal(reNation.decorations, undefined);
  }
});

test("unrecognized symbols and unknown words emit unknown tokens", () => {
  // "@" is not whitespace/marker/punctuation → single-char unknown.
  // "xyzzy" is a valid word run but not in the dictionary → unknown word.
  const tokens = tokenize("@ xyzzy", corpus);
  assert.deepEqual(
    tokens.map((t) => ({ kind: t.kind, text: t.text })),
    [
      { kind: "unknown", text: "@" },
      { kind: "whitespace", text: " " },
      { kind: "unknown", text: "xyzzy" },
    ],
  );
});
