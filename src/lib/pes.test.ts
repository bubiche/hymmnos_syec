import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { expandPesBlocks } from "./pes.ts";
import type { Corpus } from "./types.ts";

const require = createRequire(import.meta.url);
const corpus = require("../../data/corpus.json") as Corpus;

// Canonical ESP triple from the corpus: Was (class 14 = ES(I)),
// yea (class 7 = ES(II)), ra (class 13 = ES(III)).
const HEADER = "Was yea ra 0x vvi.";
const FOOTER = "1x AAs ixi.";

// ----- Block detection ----------------------------------------------------

test("valid block: header + body + footer all populated", () => {
  const input = [HEADER, "chs hymmnos mea", FOOTER].join("\n");
  const { byLine } = expandPesBlocks(input, corpus);
  assert.equal(byLine.size, 3);
  assert.deepEqual(byLine.get(0), {
    role: "header",
    context: { esI: "Was", esII: "yea", esIII: "ra" },
  });
  assert.deepEqual(byLine.get(2), {
    role: "footer",
    context: { esI: "Was", esII: "yea", esIII: "ra" },
  });
  const body = byLine.get(1);
  assert.ok(body && body.role === "body");
  assert.deepEqual(body.phrases, [
    { parseInput: "Was yea ra chs hymmnos mea", syntheticPrefix: 3 },
  ]);
});

test("block surrounded by passthrough text leaves outer lines unmarked", () => {
  const input = [
    "intro line",
    HEADER,
    "chs hymmnos mea",
    FOOTER,
    "outro line",
  ].join("\n");
  const { byLine } = expandPesBlocks(input, corpus);
  assert.equal(byLine.has(0), false);
  assert.equal(byLine.has(4), false);
  assert.equal(byLine.has(1), true);
  assert.equal(byLine.has(2), true);
  assert.equal(byLine.has(3), true);
});

test("multiple blocks in one input", () => {
  const input = [
    HEADER, "chs hymmnos mea", FOOTER,
    "interlude",
    HEADER, "chs ieeya", FOOTER,
  ].join("\n");
  const { byLine } = expandPesBlocks(input, corpus);
  assert.equal(byLine.size, 6);
  assert.equal(byLine.get(0)?.role, "header");
  assert.equal(byLine.get(1)?.role, "body");
  assert.equal(byLine.get(2)?.role, "footer");
  assert.equal(byLine.has(3), false);
  assert.equal(byLine.get(4)?.role, "header");
  assert.equal(byLine.get(5)?.role, "body");
});

// ----- _applyPersistentEmotionSounds chunking -----------------------------

test("body line that already starts with ES(I) is not prepended", () => {
  // Was is class 14; the seed-buffer guard sees `not syntax_class in es_i_values`
  // is false on the first word, so the triple is skipped.
  const input = [HEADER, "Was chs hymmnos", FOOTER].join("\n");
  const body = expandPesBlocks(input, corpus).byLine.get(1);
  assert.ok(body && body.role === "body");
  assert.deepEqual(body.phrases, [
    { parseInput: "Was chs hymmnos", syntheticPrefix: 0 },
  ]);
});

test("body that legitimately begins with the canonical triple has syntheticPrefix=0", () => {
  // The string is identical to what a prepended-triple expansion produces,
  // but here `Was` is the user's own first ES(I) so the seed never fires.
  // Phase 4 must NOT hide leaves 0/1/2 — they're real input. The string
  // alone can't disambiguate; that's why we record the prefix count.
  const input = [HEADER, "Was yea ra rudje", FOOTER].join("\n");
  const body = expandPesBlocks(input, corpus).byLine.get(1);
  assert.ok(body && body.role === "body");
  assert.deepEqual(body.phrases, [
    { parseInput: "Was yea ra rudje", syntheticPrefix: 0 },
  ]);
});

test("body with embedded ES(I) splits into two phrases — only the first prepended", () => {
  // Trace: chs (seed [Was, yea, ra, chs]) → hymmnos → Was (flush, start new)
  // → rudje. Second phrase begins with the user's ES(I), no prefix.
  const input = [HEADER, "chs hymmnos Was rudje", FOOTER].join("\n");
  const body = expandPesBlocks(input, corpus).byLine.get(1);
  assert.ok(body && body.role === "body");
  assert.deepEqual(body.phrases, [
    { parseInput: "Was yea ra chs hymmnos", syntheticPrefix: 3 },
    { parseInput: "Was rudje", syntheticPrefix: 0 },
  ]);
});

test("body line that is just an ES(I) → single un-prepended phrase", () => {
  const input = [HEADER, "Was", FOOTER].join("\n");
  const body = expandPesBlocks(input, corpus).byLine.get(1);
  assert.ok(body && body.role === "body");
  assert.deepEqual(body.phrases, [
    { parseInput: "Was", syntheticPrefix: 0 },
  ]);
});

test("body line with trailing ES(I) → flushes buffer, then ES(I) alone", () => {
  // chs hymmnos buffer fills with triple, then Was flushes and stands alone.
  // Upstream emits an empty trailing buffer in this case; we filter it.
  const input = [HEADER, "chs hymmnos Was", FOOTER].join("\n");
  const body = expandPesBlocks(input, corpus).byLine.get(1);
  assert.ok(body && body.role === "body");
  assert.deepEqual(body.phrases, [
    { parseInput: "Was yea ra chs hymmnos", syntheticPrefix: 3 },
    { parseInput: "Was", syntheticPrefix: 0 },
  ]);
});

test("unknown body words flow through normally — triple still prepended", () => {
  // xyzzy lookups miss (classCode 0); not ES(I), so the seed fires and
  // xyzzy joins the buffer like any other word.
  const input = [HEADER, "xyzzy chs hymmnos", FOOTER].join("\n");
  const body = expandPesBlocks(input, corpus).byLine.get(1);
  assert.ok(body && body.role === "body");
  assert.deepEqual(body.phrases, [
    { parseInput: "Was yea ra xyzzy chs hymmnos", syntheticPrefix: 3 },
  ]);
});

test("body word with trailing punctuation is treated as unknown — faithful to upstream split", () => {
  // Upstream `line.split()` splits on whitespace only, so `kalla.` lookups
  // miss. We mirror that: don't strip punctuation in the lookup path.
  const input = [HEADER, "chs hymmnos.", FOOTER].join("\n");
  const body = expandPesBlocks(input, corpus).byLine.get(1);
  assert.ok(body && body.role === "body");
  assert.deepEqual(body.phrases, [
    { parseInput: "Was yea ra chs hymmnos.", syntheticPrefix: 3 },
  ]);
});

test("empty body line → empty phrases array", () => {
  const input = [HEADER, "", FOOTER].join("\n");
  const body = expandPesBlocks(input, corpus).byLine.get(1);
  assert.ok(body && body.role === "body");
  assert.deepEqual(body.phrases, []);
});

// ----- Malformed → passthrough --------------------------------------------

test("header with non-ES(I) first word → block ignored (passthrough)", () => {
  // chs is class 2 (V), not class 14. Strict ES_I_CLASSES check rejects it.
  const input = ["chs yea ra 0x vvi.", "chs hymmnos", FOOTER].join("\n");
  assert.equal(expandPesBlocks(input, corpus).byLine.size, 0);
});

test("header with non-ES(II) second word → block ignored", () => {
  // 'rudje' is class 10 — aggregate ADJ+N+ESii — but upstream's strict
  // SYNTAX_CLASS_REV['ES(II)'] = (7,) excludes it.
  const input = ["Was rudje ra 0x vvi.", "chs hymmnos", FOOTER].join("\n");
  assert.equal(expandPesBlocks(input, corpus).byLine.size, 0);
});

test("header with unknown words → block ignored", () => {
  const input = ["zxqw nope nada 0x vvi.", "chs hymmnos", FOOTER].join("\n");
  assert.equal(expandPesBlocks(input, corpus).byLine.size, 0);
});

test("open header without footer → block ignored", () => {
  const input = [HEADER, "chs hymmnos", "more body"].join("\n");
  assert.equal(expandPesBlocks(input, corpus).byLine.size, 0);
});

test("footer alone (no header) → not a block", () => {
  const input = ["random line", FOOTER, "another line"].join("\n");
  assert.equal(expandPesBlocks(input, corpus).byLine.size, 0);
});

test("empty input → empty expansion", () => {
  assert.equal(expandPesBlocks("", corpus).byLine.size, 0);
});

// ----- Indexing convention ------------------------------------------------

test("byLine keys index the raw \\n-split input", () => {
  // CRLF-style input would be split by `\n` only, leaving `\r` as part of
  // the line — that would break the regex match. Phase 3 should normalize
  // line endings before calling expandPesBlocks. This test pins the
  // convention so the assumption is explicit.
  const input = ["padding", HEADER, "chs hymmnos", FOOTER].join("\n");
  const { byLine } = expandPesBlocks(input, corpus);
  assert.equal([...byLine.keys()].sort((a, b) => a - b).join(","), "1,2,3");
});

// ----- Whitespace tolerance ----------------------------------------------

test("indented header / footer (leading whitespace) still detected", () => {
  // Diverges from upstream's strict regex. A user pasting an indented
  // block from a markdown source or a code editor must not have the
  // whole PES block silently rejected because of leading spaces.
  const input = ["  " + HEADER, "  chs hymmnos", "  " + FOOTER].join("\n");
  const { byLine } = expandPesBlocks(input, corpus);
  assert.equal(byLine.get(0)?.role, "header");
  assert.equal(byLine.get(1)?.role, "body");
  assert.equal(byLine.get(2)?.role, "footer");
});

test("trailing whitespace on header / footer still detected", () => {
  const input = [HEADER + "  ", "chs hymmnos", FOOTER + "\t"].join("\n");
  const { byLine } = expandPesBlocks(input, corpus);
  assert.equal(byLine.get(0)?.role, "header");
  assert.equal(byLine.get(2)?.role, "footer");
});

// ----- Casing -------------------------------------------------------------

test("header words use corpus canonical casing in PesContext", () => {
  // Input has "WAS YEA RA"; corpus stores Was/yea/ra. The context surfaces
  // the canonical form so the parse-input prefix matches the AST's
  // exact-match elements.
  const input = ["WAS YEA RA 0x vvi.", "chs hymmnos", FOOTER].join("\n");
  const { byLine } = expandPesBlocks(input, corpus);
  const header = byLine.get(0);
  assert.ok(header && header.role === "header");
  assert.equal(header.context.esI, "Was");
  assert.equal(header.context.esII, "yea");
  assert.equal(header.context.esIII, "ra");
});
