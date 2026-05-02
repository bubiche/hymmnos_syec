import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { tokenize } from "./tokenize.ts";
import { annotate } from "./annotate.ts";
import { parseLine, type PhraseTree } from "./syntax.ts";
import type { Corpus } from "./types.ts";

const require = createRequire(import.meta.url);
const corpus = require("../../data/corpus.json") as Corpus;

// Lift a parse to a compact label tree so assertions stay readable.
// Phrase nodes become `[phrase, ...children]`; leaves become the original
// token text.
type LabelTree = string | LabelTree[];

function shape(tree: PhraseTree, tokens: ReadonlyArray<{ text?: string }>): LabelTree {
  if (tree.kind === "leaf") return tokens[tree.tokenIndex]!.text ?? "?";
  return [tree.phrase, ...tree.children.map(c => shape(c, tokens))];
}

function parse(input: string) {
  const tokens = annotate(tokenize(input, corpus));
  const tree = parseLine(tokens, corpus);
  return { tokens, tree };
}

// ----- Oracle trees captured from the live grammar.py at hymmnoserver.uguu.ca
// ----- on 2026-05-03. Drift in either parser will fail these assertions
// ----- with a tree-shape diff, not just `tree !== null`.

test("Central: 'Was yea ra chs hymmnos mea' → ESP + VP/TP/NP", () => {
  // Oracle: CP[ESP[Was, yea, ra], VP[chs, TP[NP[hymmnos, NP[mea]]]]]
  const { tokens, tree } = parse("Was yea ra chs hymmnos mea");
  assert.ok(tree, "expected a parse");
  assert.deepEqual(shape(tree, tokens), [
    "CP",
    ["ESP", "Was", "yea", "ra"],
    ["VP", "chs",
      ["TP",
        ["NP", "hymmnos",
          ["NP", "mea"],
        ],
      ],
    ],
  ]);
});

test("Central: 'Wee ki ra chs ieeya ar ciel' → ESP + VP with AP[ar]", () => {
  // Oracle: CP[ESP[Wee, ki, ra], VP[chs, TP[NP[ieeya, NP[AP[ar], ciel]]]]]
  // `ar` is class 20 (adv+adj+ESii); the parser must take it as ADJ in AnP.
  const { tokens, tree } = parse("Wee ki ra chs ieeya ar ciel");
  assert.ok(tree, "expected a parse");
  assert.deepEqual(shape(tree, tokens), [
    "CP",
    ["ESP", "Wee", "ki", "ra"],
    ["VP", "chs",
      ["TP",
        ["NP", "ieeya",
          ["NP",
            ["AP", "ar"],
            "ciel",
          ],
        ],
      ],
    ],
  ]);
});

test("Pastalia: 'x. rre yor aOuk yant hymme' → SP + EVP", () => {
  // Oracle: CP[SP[x., rre, NP[yor]], EVP[aOuk, TP[NP[AP[yant], hymme]]]]
  // Tests pastalia detection (via aOuk's emotion-verb decoration), the
  // SevnP fragment, and the multi-class word disambiguation guard
  // (yant is class 7 = ESii+adj, hymme is class 9 = n+v).
  //
  // Note: the leaf for the SP construct shows as "x" (without the period)
  // because tokenize splits `x.` into `x` (word, EV decoration with
  // empty slot) + `.` (punctuation). The parser keys off the entry's
  // canonical word form `x.` for exact-match against `x.$6`, so the
  // parse succeeds — only the leaf-text projection is shortened.
  const { tokens, tree } = parse("x. rre yor aOuk yant hymme");
  assert.ok(tree, "expected a parse");
  assert.deepEqual(shape(tree, tokens), [
    "CP",
    ["SP", "x", "rre",
      ["NP", "yor"],
    ],
    ["EVP", "aOuk",
      ["TP",
        ["NP",
          ["AP", "yant"],
          "hymme",
        ],
      ],
    ],
  ]);
});

test("AnP disambiguation guard: class-10 word + non-N follower → forced as N", () => {
  // `rudje` is class 10 (ADJ + N + ESii). Followed by `chs` (class 2 = V,
  // no N), the AnP head-disambiguation guard at upstream syntax.py
  // 808-812 fires: head has multi class with ADJ+N AND the next token
  // lacks the relevant class (N), so AnP is rejected. The fallback is
  // NsP body (LEX_N), which keeps `rudje` as a noun. Without the guard
  // the parser would greedily eat `rudje` as ADJ in AnP and the parse
  // would either misshape or fail coverage.
  //
  // Oracle from live grammar.py: CP[SgP[NsP[rudje]], VP[chs]] →
  // CP[SP[NP[rudje]], VP[chs]] after reduction.
  const { tokens, tree } = parse("rudje chs");
  assert.ok(tree, "expected a parse");
  assert.deepEqual(shape(tree, tokens), [
    "CP",
    ["SP", ["NP", "rudje"]],
    ["VP", "chs"],
  ]);
});

// ----- Coverage gate ------------------------------------------------------

test("partial parse → null (AaP prefix-only guard)", () => {
  // `re` (Central, class 3 adv) is one of three prefix-only words the
  // AaP/AalP guard rejects (upstream syntax.py 813-823). Bare `re` has
  // no other phrase that accepts it, so coverage stays at 0 and the
  // strict gate trips. Verified against live grammar.py: returns
  // "incomplete sentence" — same outcome we expect from null.
  const { tree } = parse("re");
  assert.equal(tree, null);
});

test("unknown word → null", () => {
  const { tree } = parse("Was yea ra chs hymmnos zxqwert");
  assert.equal(tree, null);
});

test("empty / whitespace-only input → null", () => {
  assert.equal(parse("").tree, null);
  assert.equal(parse("   ").tree, null);
});

// ----- Adapter behaviour --------------------------------------------------

test("trailing punctuation is ignored", () => {
  // Period and comma should be stripped before parsing.
  const { tree } = parse("Was yea ra chs hymmnos mea.");
  assert.ok(tree, "trailing period must not break the parse");
});

test("DIALECT_PRIORITY puts central first in entries[]", () => {
  // The AaP/AalP guard at upstream syntax.py 813-823 inspects only the
  // FIRST candidate of the head word. Our annotate.ts orders entries
  // central-first — must agree with upstream's ORDER BY dialect ASC for
  // the guard to behave identically. Multi-dialect 'rre' is the canonical
  // example: dialect 1 (Central) is the cnstr-class entry the parser keys
  // off; the Pastalia dialect-6 'rre' must not lead the list.
  const tokens = annotate(tokenize("rre", corpus));
  const tok = tokens[0];
  assert.ok(tok && tok.kind === "word");
  if (tok.kind !== "word") return;
  // Single dialect in the dump for 'rre' (Central). The check is mostly
  // future-proofing — if a Pastalia rre is ever added, central must
  // remain at index 0.
  assert.equal(tok.entries[0]?.dialect, "central");
});
