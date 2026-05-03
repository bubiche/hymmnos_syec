// Lexical-class and dialect constants ported from upstream `common/syntax.py`
// at commit 75f5f4a8 (lines 44–66, 525–562).

import type { Dialect } from "./types.ts";

// `_LEX_*` from upstream syntax.py lines 44–57. Values are the upstream
// class ints; gaps (9, 10, 11, 17, 19–25) are aggregate classes that the
// SYNTAX_MAPPING fans out into combinations of these primitives.
export const LEX_EV = 1;
export const LEX_V = 2;
export const LEX_ADV = 3;
export const LEX_N = 4;
export const LEX_CONJ = 5;
export const LEX_PREP = 6;
export const LEX_ESii = 7;
export const LEX_ADJ = 8;
export const LEX_PRT = 12;
export const LEX_ESiii = 13;
export const LEX_ESi = 14;
export const LEX_PRON = 15;
export const LEX_INTJ = 16;
export const LEX_CNSTR = 18;

export type LexClass =
  | typeof LEX_EV   | typeof LEX_V    | typeof LEX_ADV  | typeof LEX_N
  | typeof LEX_CONJ | typeof LEX_PREP | typeof LEX_ESii | typeof LEX_ADJ
  | typeof LEX_PRT  | typeof LEX_ESiii | typeof LEX_ESi | typeof LEX_PRON
  | typeof LEX_INTJ | typeof LEX_CNSTR;

// `_SYNTAX_MAPPING` from upstream syntax.py lines 525–551. Maps the 1–25
// database class ints to their constituent lexical classes. Aggregate
// classes (e.g. 9 = noun+verb) expand into multiple primitives — the parser
// treats a token as matching a phrase slot if any of its mapped classes
// satisfy the slot's required class.
export const SYNTAX_MAPPING: Record<number, readonly LexClass[]> = {
  1:  [LEX_EV],
  2:  [LEX_V],
  3:  [LEX_ADV],
  4:  [LEX_N],
  5:  [LEX_CONJ],
  6:  [LEX_PREP],
  7:  [LEX_ESii, LEX_ADJ],         // Doubles as adjective.
  8:  [LEX_ADJ, LEX_ESii],         // Doubles as E.S.(II).
  9:  [LEX_N, LEX_V],
  10: [LEX_ADJ, LEX_N, LEX_ESii],  // Doubles as E.S.(II).
  11: [LEX_ADJ, LEX_V, LEX_ESii],  // Doubles as E.S.(II).
  12: [LEX_PRT],
  13: [LEX_ESiii],
  14: [LEX_ESi],
  15: [LEX_PRON, LEX_N],
  16: [LEX_ADV, LEX_INTJ],
  17: [LEX_PREP, LEX_PRT],
  18: [LEX_CNSTR],
  19: [LEX_ADV, LEX_N],
  20: [LEX_ADV, LEX_ADJ, LEX_ESii], // Doubles as E.S.(II).
  21: [LEX_CONJ, LEX_PREP],
  22: [LEX_V, LEX_PRT],
  23: [LEX_ADV, LEX_PRT],
  24: [LEX_N, LEX_PREP],
  25: [LEX_ADV, LEX_PREP],
};

// `_DLCT_*` from upstream syntax.py lines 59–66. The parser embeds these
// ints in exact-match AST elements like `'rre$1'` (rre, Central) and
// `'x.$6'` (x., Pastalia), so our string dialects must round-trip to the
// same ints upstream uses.
export const DLCT_UNKNOWN = 0;
export const DLCT_CENTRAL = 1;
export const DLCT_CULT_CIEL = 2;
export const DLCT_CLUSTER = 3;
export const DLCT_ALPHA = 4;
export const DLCT_METAFALSS = 5;
export const DLCT_PASTALIE = 6;
export const DLCT_ALPHA_EOLIA = 7;

export const DIALECT_INT: Record<Dialect, number> = {
  unknown:       DLCT_UNKNOWN,
  central:       DLCT_CENTRAL,
  "cult-ciel":   DLCT_CULT_CIEL,
  cluster:       DLCT_CLUSTER,
  alpha:         DLCT_ALPHA,
  metafalss:     DLCT_METAFALSS,
  pastalia:      DLCT_PASTALIE,
  "alpha-eolia": DLCT_ALPHA_EOLIA,
};

export const DIALECT_BY_INT: Record<number, Dialect> = {
  0: "unknown",
  1: "central",
  2: "cult-ciel",
  3: "cluster",
  4: "alpha",
  5: "metafalss",
  6: "pastalia",
  7: "alpha-eolia",
};
