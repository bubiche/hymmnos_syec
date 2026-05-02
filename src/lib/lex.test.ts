import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DIALECT_BY_INT, DIALECT_INT,
  LEX_ADJ, LEX_ADV, LEX_CNSTR, LEX_CONJ, LEX_ESi, LEX_ESii, LEX_ESiii,
  LEX_EV, LEX_INTJ, LEX_N, LEX_PREP, LEX_PRON, LEX_PRT, LEX_V,
  SYNTAX_MAPPING,
} from "./lex.ts";
import type { Dialect } from "./types.ts";

test("DIALECT_INT round-trips through DIALECT_BY_INT", () => {
  // Exact-match AST elements like 'rre$1' / 'x.$6' encode the upstream
  // dialect int. If our string→int mapping diverges from upstream's, every
  // marker-based phrase rule breaks silently.
  for (const [dialect, n] of Object.entries(DIALECT_INT)) {
    assert.equal(DIALECT_BY_INT[n], dialect as Dialect, `round-trip ${dialect}/${n}`);
  }
  // Spot-check upstream values.
  assert.equal(DIALECT_INT.central, 1);
  assert.equal(DIALECT_INT.pastalia, 6);
  assert.equal(DIALECT_INT["alpha-eolia"], 7);
});

test("SYNTAX_MAPPING covers all 25 class codes", () => {
  for (let c = 1; c <= 25; c++) {
    assert.ok(SYNTAX_MAPPING[c], `class ${c} present`);
    assert.ok(SYNTAX_MAPPING[c]!.length > 0, `class ${c} non-empty`);
  }
});

test("SYNTAX_MAPPING aggregate classes match upstream", () => {
  // Spot-checks of a few aggregates and their ordering — first element is
  // the primary class used by `_processWord_int`'s default lookup.
  assert.deepEqual(SYNTAX_MAPPING[1], [LEX_EV]);
  assert.deepEqual(SYNTAX_MAPPING[7], [LEX_ESii, LEX_ADJ]);
  assert.deepEqual(SYNTAX_MAPPING[10], [LEX_ADJ, LEX_N, LEX_ESii]);
  assert.deepEqual(SYNTAX_MAPPING[15], [LEX_PRON, LEX_N]);
  assert.deepEqual(SYNTAX_MAPPING[18], [LEX_CNSTR]);
});

test("LEX_* constants match upstream syntax.py ints", () => {
  // Must match `_LEX_*` values exactly; the AST tables embed these as-is.
  assert.equal(LEX_EV, 1);
  assert.equal(LEX_V, 2);
  assert.equal(LEX_ADV, 3);
  assert.equal(LEX_N, 4);
  assert.equal(LEX_CONJ, 5);
  assert.equal(LEX_PREP, 6);
  assert.equal(LEX_ESii, 7);
  assert.equal(LEX_ADJ, 8);
  assert.equal(LEX_PRT, 12);
  assert.equal(LEX_ESiii, 13);
  assert.equal(LEX_ESi, 14);
  assert.equal(LEX_PRON, 15);
  assert.equal(LEX_INTJ, 16);
  assert.equal(LEX_CNSTR, 18);
});
