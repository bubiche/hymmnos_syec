import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { tryEmotionVerb, tryGeneralWord } from "./morphology.ts";
import type { Corpus } from "./types.ts";

const require = createRequire(import.meta.url);
const corpus = require("../../data/corpus.json") as Corpus;

test("Pastalia noun with emotion-vowel prefix", () => {
  // "cia" is a Pastalia noun (sky). "Yacia" prefixes the emotion vowel YA.
  const r = tryGeneralWord("Yacia", corpus);
  assert.ok(r, "expected a match");
  assert.equal(r.entries.length, 1);
  assert.equal(r.entries[0]!.word, "cia");
  assert.equal(r.entries[0]!.dialect, "pastalia");
  assert.deepEqual(r.decorations, { kind: "general", prefix: "Ya" });
});

test("Pastalia noun with `_suffix`", () => {
  // Suffix is anything starting with `_` plus word chars; the body is "cia".
  const r = tryGeneralWord("cia_yorr", corpus);
  assert.ok(r, "expected a match");
  assert.equal(r.entries[0]!.word, "cia");
  assert.deepEqual(r.decorations, { kind: "general", suffix: "_yorr" });
});

test("bare Central word has no decorations", () => {
  // "adyya" starts with "a" which is an emotion vowel — the dict-first
  // lookup must short-circuit before the structure regex eats the prefix.
  const r = tryGeneralWord("adyya", corpus);
  assert.ok(r, "expected a match");
  assert.equal(r.entries.length, 1);
  assert.equal(r.entries[0]!.word, "adyya");
  assert.equal(r.entries[0]!.dialect, "central");
  assert.equal(r.decorations, undefined);
});

test("emotion verb with bank slot filled", () => {
  // "a.u.k." (be) with "O" infixed in slot 0 → "aOuk".
  const r = tryEmotionVerb("aOuk", corpus);
  assert.ok(r, "expected a match");
  assert.equal(r.entries.length, 1);
  assert.equal(r.entries[0]!.word, "a.u.k.");
  assert.deepEqual(r.decorations, {
    kind: "emotion-verb",
    slots: ["O", null, null],
  });
});

test("emotion verb with mood suffix", () => {
  // "a.u.k." with no infixes plus the "eh" mood → "aukeh".
  const r = tryEmotionVerb("aukeh", corpus);
  assert.ok(r, "expected a match");
  assert.equal(r.entries[0]!.word, "a.u.k.");
  assert.deepEqual(r.decorations, {
    kind: "emotion-verb",
    slots: [null, null, null],
    verbSuffix: "eh",
  });
});

test("multi-dialect spelling returns all entries", () => {
  // "tie" exists in both cult-ciel (verb) and pastalia (preposition).
  const r = tryGeneralWord("tie", corpus);
  assert.ok(r, "expected a match");
  assert.equal(r.entries.length, 2);
  const dialects = new Set(r.entries.map((e) => e.dialect));
  assert.deepEqual(dialects, new Set(["cult-ciel", "pastalia"]));
  assert.equal(r.decorations, undefined);
});
