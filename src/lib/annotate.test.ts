import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { annotate } from "./annotate.ts";
import { decode } from "./binasphere.ts";
import { tokenize } from "./tokenize.ts";
import type { Corpus } from "./types.ts";

const require = createRequire(import.meta.url);
const corpus = require("../../data/corpus.json") as Corpus;

function pipeline(input: string) {
  return decode(input).map((seg) => ({
    voice: seg.voice,
    tokens: annotate(tokenize(seg.text, corpus)),
  }));
}

test("Pastalia line with an infixed emotion verb annotates end-to-end", () => {
  // "aOuk" = the emotion verb "a.u.k." (be) with "O" filled in slot 0; the
  // surrounding "Yacia" carries an emotion-vowel prefix "Ya" on the noun
  // "cia" (sky). This exercises both decoration paths in one line.
  const [seg] = pipeline("aOuk Yacia");
  assert.equal(seg!.voice, null);

  const verb = seg!.tokens[0]!;
  assert.equal(verb.kind, "word");
  if (verb.kind === "word") {
    assert.equal(verb.primary.word, "a.u.k.");
    assert.equal(verb.primary.dialect, "pastalia");
    assert.deepEqual(verb.decorations, {
      kind: "emotion-verb",
      slots: ["O", null, null],
    });
  }

  const noun = seg!.tokens[2]!;
  assert.equal(noun.kind, "word");
  if (noun.kind === "word") {
    assert.equal(noun.primary.word, "cia");
    assert.equal(noun.primary.meaning, "sky");
    assert.deepEqual(noun.decorations, { kind: "general", prefix: "Ya" });
  }
});

test("Binasphere block decodes then annotates each voice", () => {
  // Pattern "01" cycles 4 tokens twice:
  //   voice 0 ← WAS, RA      → both Tier-I/III emotion sounds
  //   voice 1 ← YEA, TIE     → emotion-sound + a multi-dialect word
  // `tie` exists in cult-ciel (verb) and pastalia (preposition); per
  // primary priority Pastalia wins (no Central entry available).
  const segments = pipeline("=> WAS YEA RA TIE EXEC hymme 2x1/0>>01");
  assert.equal(segments.length, 2);
  assert.deepEqual(segments.map((s) => s.voice), [0, 1]);

  const v0Kinds = segments[0]!.tokens.map((t) => t.kind);
  assert.deepEqual(v0Kinds, ["emotion-sound", "whitespace", "emotion-sound"]);

  const v1 = segments[1]!.tokens;
  assert.equal(v1[0]!.kind, "emotion-sound");
  const tie = v1[2]!;
  assert.equal(tie.kind, "word");
  if (tie.kind === "word") {
    assert.equal(tie.entries.length, 2);
    assert.equal(tie.primary.dialect, "pastalia");
    assert.equal(tie.primary.partOfSpeech, "preposition");
  }
});

test("multi-dialect spelling prefers Central as the primary entry", () => {
  // "flip" is the only spelling in the corpus with both a Central and a
  // non-Central entry — perfect for asserting the priority order itself.
  const tokens = annotate(tokenize("flip", corpus));
  const tok = tokens[0]!;
  assert.equal(tok.kind, "word");
  if (tok.kind === "word") {
    assert.equal(tok.entries.length, 2);
    assert.equal(tok.primary.dialect, "central");
  }
});
