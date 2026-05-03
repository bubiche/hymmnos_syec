import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { annotateInput } from "./pipeline.ts";
import { tokenize } from "./tokenize.ts";
import type { Corpus } from "./types.ts";
import type { PhraseTree } from "./syntax.ts";

const require = createRequire(import.meta.url);
const corpus = require("../../data/corpus.json") as Corpus;

const HEADER = "Was yea ra 0x vvi.";
const FOOTER = "1x AAs ixi.";

// Same projection as syntax.test.ts so tree assertions stay readable.
type LabelTree = string | LabelTree[];

function shape(tree: PhraseTree, tokens: ReadonlyArray<{ text?: string }>): LabelTree {
  if (tree.kind === "leaf") return tokens[tree.tokenIndex]!.text ?? "?";
  return [tree.phrase, ...tree.children.map((c) => shape(c, tokens))];
}

// ----- PREFIX_PARSE_TOKEN_COUNT pin ---------------------------------------

test("synthetic triple prefix tokenizes to exactly 6 tokens", () => {
  // pipeline.ts hardcodes PREFIX_PARSE_TOKEN_COUNT = 6 (3 word + 3 ws).
  // If `pes.ts` ever changes how it joins phrase words, or one of the
  // canonical ES tokens starts matching a longer phrase regex, that
  // hardcode silently mis-slices trees. Pin the assumption here.
  const tokens = tokenize("Was yea ra ", corpus);
  assert.equal(tokens.length, 6);
  assert.equal(tokens.filter((t) => t.kind === "whitespace").length, 3);
});

test("prefix slice produces exactly the body tokens", () => {
  // Direct check: tokenize parseInput, slice 6, equals tokenize(body).
  const parseTokens = tokenize("Was yea ra chs hymmnos", corpus);
  const bodyTokens = tokenize("chs hymmnos", corpus);
  assert.deepEqual(parseTokens.slice(6), bodyTokens);
});

// ----- Plain passthrough --------------------------------------------------

test("plain text → one ParsedLine per source line, parsed where possible", () => {
  const groups = annotateInput("Was yea ra chs hymmnos mea\nzxqwert", corpus);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.kind, "passthrough");
  if (groups[0]?.kind !== "passthrough") return;
  const lines = groups[0].segment.lines;
  assert.equal(lines.length, 2);
  // First line parses; second contains an unknown word so parse fails.
  assert.ok(lines[0]?.tree);
  assert.equal(lines[1]?.tree, null);
  assert.equal(lines[0]?.pes, undefined);
});

// ----- Canonical PES block ------------------------------------------------

test("canonical PES block: header + body + footer ParsedLines", () => {
  const input = [HEADER, "chs hymmnos", FOOTER].join("\n");
  const groups = annotateInput(input, corpus);
  assert.equal(groups.length, 1);
  if (groups[0]?.kind !== "passthrough") throw new Error("expected passthrough");
  const lines = groups[0].segment.lines;
  assert.equal(lines.length, 3);

  // Header: synthetic ESP tree wrapping the three ES tokens, plus
  // pes:header with canonical context. parseLine isn't run on the header
  // (the trailing `0x vvi.` markers are not a valid sentence), so the
  // pipeline injects an ESP tree directly so the renderer can highlight
  // and tooltip the declared triple.
  const header = lines[0];
  assert.ok(header && header.tree && header.tree.kind === "phrase");
  assert.equal(header.tree.phrase, "ESP");
  assert.equal(header.tree.children.length, 3);
  assert.deepEqual(header.pes, {
    role: "header",
    context: { esI: "Was", esII: "yea", esIII: "ra" },
  });

  // Footer: tree:null, pes:footer with same context.
  assert.equal(lines[2]?.tree, null);
  assert.deepEqual(lines[2]?.pes, {
    role: "footer",
    context: { esI: "Was", esII: "yea", esIII: "ra" },
  });

  // Body: pes:body, tree present.
  const body = lines[1]!;
  assert.equal(body.pes?.role, "body");
});

test("canonical body 'chs hymmnos' → tree shape with synthetic prefix stripped", () => {
  // Oracle: parsing "Was yea ra chs hymmnos" produces
  //   CP[ESP[Was, yea, ra], VP[chs, TP[NP[hymmnos]]]]
  // After slicing the synthetic prefix and rewriting leaf indices into
  // the body-only token array [chs, ws, hymmnos], the ESP node's leaves
  // are all in the prefix and the whole ESP gets pruned, leaving:
  //   CP[VP[chs@0, TP[NP[hymmnos@2]]]]
  const input = [HEADER, "chs hymmnos", FOOTER].join("\n");
  const groups = annotateInput(input, corpus);
  if (groups[0]?.kind !== "passthrough") throw new Error("expected passthrough");
  const body = groups[0].segment.lines[1]!;
  assert.ok(body.tree, "expected a body parse");

  assert.deepEqual(shape(body.tree, body.tokens), [
    "CP",
    ["VP", "chs",
      ["TP", ["NP", "hymmnos"]],
    ],
  ]);

  // Tokens are body-only (synthetic prefix sliced off): [chs, ws, hymmnos].
  assert.equal(body.tokens.length, 3);
  assert.equal(body.tokens[0]?.text, "chs");
  assert.equal(body.tokens[2]?.text, "hymmnos");
});

test("legitimate triple prefix (syntheticPrefix=0) is NOT sliced", () => {
  // Body line 'Was yea ra rudje' is string-identical to a phrase that had
  // the triple prepended, but it's the user's own input — pes.ts records
  // syntheticPrefix=0. Tokens must include all four words; the renderer
  // shows the leading triple.
  const input = [HEADER, "Was yea ra rudje", FOOTER].join("\n");
  const groups = annotateInput(input, corpus);
  if (groups[0]?.kind !== "passthrough") throw new Error("expected passthrough");
  const body = groups[0].segment.lines[1]!;
  // Tokens: [Was, ws, yea, ws, ra, ws, rudje] — 7 tokens, 4 words.
  assert.equal(body.tokens.length, 7);
  assert.equal(body.tokens[0]?.text, "Was");
  assert.equal(body.tokens[6]?.text, "rudje");
});

test("multi-phrase body emits one ParsedLine per phrase", () => {
  // Body 'chs hymmnos Was rudje' splits on the embedded ES(I) into:
  //   phrase 1: parseInput="Was yea ra chs hymmnos", syntheticPrefix=3
  //   phrase 2: parseInput="Was rudje",              syntheticPrefix=0
  // Both ParsedLines carry pes:body with the same context.
  const input = [HEADER, "chs hymmnos Was rudje", FOOTER].join("\n");
  const groups = annotateInput(input, corpus);
  if (groups[0]?.kind !== "passthrough") throw new Error("expected passthrough");
  const lines = groups[0].segment.lines;
  // 1 header + 2 body phrases + 1 footer = 4 ParsedLines.
  assert.equal(lines.length, 4);
  assert.equal(lines[1]?.pes?.role, "body");
  assert.equal(lines[2]?.pes?.role, "body");
  // Phrase 1 sliced: [chs, ws, hymmnos].
  assert.equal(lines[1]?.tokens.length, 3);
  assert.equal(lines[1]?.tokens[0]?.text, "chs");
  // Phrase 2 NOT sliced: [Was, ws, rudje].
  assert.equal(lines[2]?.tokens.length, 3);
  assert.equal(lines[2]?.tokens[0]?.text, "Was");
});

test("body that is just an ES(I) → un-prepended single phrase", () => {
  const input = [HEADER, "Was", FOOTER].join("\n");
  const groups = annotateInput(input, corpus);
  if (groups[0]?.kind !== "passthrough") throw new Error("expected passthrough");
  const body = groups[0].segment.lines[1]!;
  assert.equal(body.tokens.length, 1);
  assert.equal(body.tokens[0]?.text, "Was");
  assert.equal(body.pes?.role, "body");
});

test("empty body line in PES block → blank ParsedLine carrying pes:body", () => {
  const input = [HEADER, "", FOOTER].join("\n");
  const groups = annotateInput(input, corpus);
  if (groups[0]?.kind !== "passthrough") throw new Error("expected passthrough");
  const lines = groups[0].segment.lines;
  assert.equal(lines.length, 3);
  assert.equal(lines[1]?.tokens.length, 0);
  assert.equal(lines[1]?.tree, null);
  assert.equal(lines[1]?.pes?.role, "body");
});

// ----- Binasphere ---------------------------------------------------------

test("binasphere voice segments parse individually with no pes context", () => {
  // Minimal 2-voice block: pattern '01' decodes to voice 0 = "chs", voice 1 = "ra".
  const input = "=> chs ra EXEC hymme 2x1/0>>01";
  const groups = annotateInput(input, corpus);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.kind, "block");
  if (groups[0]?.kind !== "block") return;
  assert.equal(groups[0].voices.length, 2);
  for (const v of groups[0].voices) {
    assert.equal(v.lines.length, 1);
    assert.equal(v.lines[0]?.pes, undefined);
  }
});

test("binasphere voice text splits on `/` so each sentence parses on its own", () => {
  // Decoded voice 0 = "chs hymmnos / chs ieeya". Without splitting, the
  // strict coverage gate would fail (two sentences in one parse) and
  // both fall back to flat. Splitting yields two ParsedLines, each
  // with its own tree.
  //
  // Encoding: 4-syllable pattern '0101' across a 2-voice block. Tokens
  // alternate v0/v1: chs/hymmnos/chs/ieeya/.../slash/.../chs/.../ieeya/...
  // Easier to test by constructing a single-voice block (1x1/0>>0) and
  // packing the `/` token into the encoded stream.
  const input = "=> chs hymmnos / chs ieeya EXEC hymme 1x1/0>>0";
  const groups = annotateInput(input, corpus);
  if (groups[0]?.kind !== "block") throw new Error();
  assert.equal(groups[0].voices.length, 1);
  const lines = groups[0].voices[0]!.lines;
  assert.equal(lines.length, 2);
  // Both fragments should parse — they're complete sentences with the
  // synthetic ESP not required (parseLine doesn't auto-prepend; this
  // sentence pattern matches via the SgP/VP fragment).
  // Just assert tokens carry the expected first words.
  assert.equal(lines[0]?.tokens.find((t) => t.kind === "word")?.text, "chs");
  assert.equal(lines[1]?.tokens.find((t) => t.kind === "word")?.text, "chs");
});

test("PES straddling binasphere: header/footer surface as PES passthroughs around the block", () => {
  // The body line is the binasphere line. pes.ts marks line 1 as body
  // (syntactically valid: header at 0, footer at 2). The pipeline emits
  // header-passthrough + block + footer-passthrough; voices don't carry
  // pes context. Locks the "PES context does not propagate into binasphere
  // voices" decision so it stays deliberate.
  const input = [
    HEADER,
    "=> chs ra EXEC hymme 2x1/0>>01",
    FOOTER,
  ].join("\n");
  const groups = annotateInput(input, corpus);
  assert.equal(groups.length, 3);
  assert.equal(groups[0]?.kind, "passthrough");
  assert.equal(groups[1]?.kind, "block");
  assert.equal(groups[2]?.kind, "passthrough");
  if (groups[0]?.kind === "passthrough") {
    assert.equal(groups[0].segment.lines[0]?.pes?.role, "header");
  }
  if (groups[2]?.kind === "passthrough") {
    assert.equal(groups[2].segment.lines[0]?.pes?.role, "footer");
  }
  if (groups[1]?.kind === "block") {
    for (const v of groups[1].voices) {
      assert.equal(v.lines[0]?.pes, undefined);
    }
  }
});

// ----- Line-cursor alignment ---------------------------------------------

test("mixed: passthrough → binasphere → passthrough-with-PES, line indices align", () => {
  // Lines:  0 intro
  //         1 binasphere
  //         2 HEADER
  //         3 body 'chs hymmnos'
  //         4 FOOTER
  // The PES preprocessor finds the block at lines 2..4. The pipeline must
  // pass that body line through the parser with synthetic-prefix slicing
  // even though it follows a binasphere line — the lineCursor must skip
  // the binasphere line (one input line, two voices) without double-counting.
  const input = [
    "intro",
    "=> chs ra EXEC hymme 2x1/0>>01",
    HEADER,
    "chs hymmnos",
    FOOTER,
  ].join("\n");
  const groups = annotateInput(input, corpus);
  assert.equal(groups.length, 3);
  // Group 0: 1 plain ParsedLine for "intro".
  if (groups[0]?.kind !== "passthrough") throw new Error();
  assert.equal(groups[0].segment.lines.length, 1);
  assert.equal(groups[0].segment.lines[0]?.pes, undefined);
  // Group 1: binasphere block, 2 voices.
  if (groups[1]?.kind !== "block") throw new Error();
  assert.equal(groups[1].voices.length, 2);
  // Group 2: 3 ParsedLines (header, body, footer).
  if (groups[2]?.kind !== "passthrough") throw new Error();
  const lines = groups[2].segment.lines;
  assert.equal(lines.length, 3);
  assert.equal(lines[0]?.pes?.role, "header");
  assert.equal(lines[1]?.pes?.role, "body");
  assert.equal(lines[2]?.pes?.role, "footer");
  // The body must have been parsed with the synthetic-prefix slice — i.e.
  // tokens are body-only and tree mentions chs/hymmnos.
  assert.equal(lines[1]?.tokens.length, 3);
  assert.equal(lines[1]?.tokens[0]?.text, "chs");
  assert.ok(lines[1]?.tree);
});

test("multi-line passthrough with PES block aligns line indices", () => {
  // Plain text before the block; verify byLine indices line up with
  // sublines after the `\n`-split.
  const input = [
    "padding 1",
    "padding 2",
    HEADER,
    "chs hymmnos",
    FOOTER,
    "trailing",
  ].join("\n");
  const groups = annotateInput(input, corpus);
  // All passthrough — coalesced into one segment.
  assert.equal(groups.length, 1);
  if (groups[0]?.kind !== "passthrough") throw new Error();
  const lines = groups[0].segment.lines;
  // padding1, padding2, header, body, footer, trailing = 6 ParsedLines.
  assert.equal(lines.length, 6);
  assert.equal(lines[0]?.pes, undefined);
  assert.equal(lines[1]?.pes, undefined);
  assert.equal(lines[2]?.pes?.role, "header");
  assert.equal(lines[3]?.pes?.role, "body");
  assert.equal(lines[4]?.pes?.role, "footer");
  assert.equal(lines[5]?.pes, undefined);
});

// ----- Edge cases ---------------------------------------------------------

test("CRLF line endings normalize to LF before PES detection", () => {
  // pes.ts header/footer regexes anchor on `\.$`. A trailing `\r` from
  // pasted CRLF input silently breaks the match; the pipeline normalizes
  // upstream so PES blocks pasted from Windows/web sources still work.
  const input = `${HEADER}\r\nchs hymmnos\r\n${FOOTER}`;
  const groups = annotateInput(input, corpus);
  if (groups[0]?.kind !== "passthrough") throw new Error();
  const lines = groups[0].segment.lines;
  assert.equal(lines[0]?.pes?.role, "header");
  assert.equal(lines[1]?.pes?.role, "body");
  assert.equal(lines[2]?.pes?.role, "footer");
});

test("EXEC_CHRONICLE_KEY/.: multi-line excerpt → one passthrough, line trees parse", () => {
  // Six oracle-pinned lines from EXEC_CHRONICLE=KEY/. (see syntax.test.ts).
  // No PES, no binasphere — the song is plain Central. Confirms the
  // pipeline emits exactly one passthrough with one ParsedLine per source
  // line, every line carrying a non-null tree, none flagged as PES.
  const input = [
    "Was ki ra selena sos yor ware fandel nuih",
    "Was ki ra sonwe anw la omnis near.",
    "Was quel ra presia bexm dauan oure yasra",
    "rre sarla has echrra elle dor",
    "Was quel ra waath sarla nnoini",
  ].join("\n");
  const groups = annotateInput(input, corpus);
  assert.equal(groups.length, 1);
  if (groups[0]?.kind !== "passthrough") throw new Error("expected passthrough");
  const lines = groups[0].segment.lines;
  assert.equal(lines.length, 5);
  for (const line of lines) {
    assert.ok(line.tree, `line should parse: ${JSON.stringify(line.tokens.map((t) => t.text).join(""))}`);
    assert.equal(line.pes, undefined);
    // Every line is a complete sentence rooted at CP.
    if (line.tree && line.tree.kind === "phrase") {
      assert.equal(line.tree.phrase, "CP");
    }
  }
});

test("empty input → one passthrough with a single empty ParsedLine", () => {
  // decode("") yields one passthrough segment with text="" (the buffer is
  // flushed even when empty). The pipeline preserves that shape — a single
  // ParsedLine with no tokens, no tree — so the renderer produces an
  // empty row rather than crashing on a missing segment.
  const groups = annotateInput("", corpus);
  assert.equal(groups.length, 1);
  if (groups[0]?.kind !== "passthrough") throw new Error();
  assert.equal(groups[0].segment.lines.length, 1);
  assert.equal(groups[0].segment.lines[0]?.tokens.length, 0);
  assert.equal(groups[0].segment.lines[0]?.tree, null);
});
