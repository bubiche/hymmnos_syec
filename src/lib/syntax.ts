// Hymmnos sentence parser. Forward-only recursive-descent port of upstream
// `common/syntax.py` at commit 75f5f4a8. The parser accepts an
// AnnotatedToken[] for one line and returns a phrase tree, or null if the
// line doesn't fully parse (the strict `countLeaves === wordCount` gate
// matches upstream — partial parses are rejected).
//
// The matcher is intentionally a near-mechanical port of `_processAST`:
// three rule classifiers (_ALL / _ONE / _ANY), three element kinds
// (lex-class int, exact-match string, nested rule), and the constraint
// guards at upstream lines 794-823 for AnP/AvP/AnlP/AvlP and AaP/AalP.
//
// Adapter shape — what we accept on the input side, where upstream ate
// raw `line.split()` strings:
//   - word tokens carry their corpus entries[] (multi-dialect candidates)
//   - emotion-sound and marker tokens are looked up in a corpus index
//     built once per parse
//   - whitespace + punctuation tokens are filtered out before digestion
//   - decorations from morphology survive through to the matcher so the
//     pastalia gate can fire (decoration-presence = pastalia, matching
//     upstream's `_sanitizePastalie` exactly)

import {
  DIALECT_INT, LEX_ADJ, LEX_ADV, LEX_CONJ, LEX_ESi, LEX_ESii,
  LEX_ESiii, LEX_EV, LEX_INTJ, LEX_N, LEX_PREP, LEX_PRON, LEX_PRT, LEX_V,
  SYNTAX_MAPPING, type LexClass,
} from "./lex.ts";
import type { AnnotatedToken, Corpus, Entry } from "./types.ts";

// AST classifiers, mirrored from upstream syntax.py lines 40-42. Values
// are arbitrary — upstream uses the integers 0/-1/1 because the elements
// after the classifier can themselves be integers (lex classes), and the
// type-disambiguation uses Python's `type()` check. We store classifiers
// as a single string in the rule's first slot to keep the AST literals
// readable.
type RuleType = "_all" | "_one" | "_any";
type ASTElement = LexClass | string | ASTRule;
type ASTRule = readonly [RuleType, ...ASTElement[]];

// Public phrase identifiers — the reduced set from `_PHRASE_REDUCTION`.
// Internal phrase fragments (NsP, NtP, AnP, ...) collapse to these on
// the way out.
export type PhraseId =
  | "AP" | "CP" | "EOP" | "ESP" | "EVP" | "MP"
  | "NP" | "PP" | "SP" | "SVP" | "TP" | "VP";

export type PhraseTree =
  | { kind: "phrase"; phrase: PhraseId; children: PhraseTree[] }
  | { kind: "leaf"; tokenIndex: number };

const EXACT_MATCH_REGEXP = /^[a-z.]+\$\d+$/;

// Upstream syntax.py lines 72-90.
const GENERAL_AST: ASTRule = ["_all",
  ["_any", LEX_CONJ, LEX_INTJ, LEX_PREP],
  ["_any",
    "ESP",
    ["_all",
      ["_one",
        ["_all", "VsP", "SgP", "VP"],
        ["_all", "SgP", "VP"],
        ["_all", "VsP", "VP"],
        "VP",
        "SgP",
      ],
      ["_any", ["_all", LEX_CONJ, "SgsP"]],
    ],
  ],
  ["_any", "CgP"],
  ["_any", "AaP"],
  ["_any", LEX_INTJ],
];

// Upstream syntax.py lines 92-127.
const PASTALIE_AST: ASTRule = ["_all",
  ["_any", LEX_CONJ, LEX_INTJ, LEX_PREP],
  ["_one",
    ["_all", "NsP", LEX_CONJ, "SpP", "EVP"],
    ["_all",
      "SevmP",
      ["_any",
        ["_one",
          ["_all", LEX_CONJ, "SevP"],
          "VP",
          "EVP",
        ],
      ],
    ],
    ["_all",
      ["_one",
        ["_all",
          ["_one",
            "SevnP",
            "EVhP",
          ],
        ],
        ["_any", "SpP"],
      ],
      ["_any", ["_one", "EVP", "VP"]],
      ["_any", ["_all", LEX_CONJ, "SevP"]],
    ],
    ["_all",
      LEX_PRON,
      "EVP",
    ],
  ],
  ["_any", "CpP"],
  ["_any", "AaP"],
  ["_any", LEX_INTJ],
];

const D_C = DIALECT_INT.central;
const D_M = DIALECT_INT.metafalss;
const D_P = DIALECT_INT.pastalia;

const AST_FRAGMENTS: Record<string, ASTRule> = {
  AaP: ["_all",
    ["_one", LEX_ADV, LEX_ADJ],
    ["_any", "AalP"],
  ],
  AalP: ["_all",
    ["_one", LEX_ADV, LEX_ADJ],
    ["_any", "AalP"],
  ],
  AavP: ["_all",
    LEX_ADV,
    ["_any", "AavlP"],
  ],
  AavlP: ["_all",
    LEX_ADV,
    ["_any", "AavlP"],
  ],
  AnP: ["_all",
    ["_one", LEX_ADJ, LEX_ADV, LEX_PRON],
    ["_any", "AnlP"],
    ["_any", ["_all", LEX_CONJ, "AnP"]],
  ],
  AnlP: ["_all",
    ["_one", LEX_ADJ, LEX_ADV],
    ["_any", "AnlP"],
    ["_any", ["_all", LEX_CONJ, "AnP"]],
  ],
  AnpP: ["_all",
    ["_one", LEX_ADJ, LEX_ADV],
    ["_any", "AnplP"],
    ["_any", ["_all", LEX_CONJ, "AnpP"]],
  ],
  AnplP: ["_all",
    ["_one", LEX_ADJ, LEX_ADV],
    ["_any", "AnplP"],
    ["_any", ["_all", LEX_CONJ, "AnpP"]],
  ],
  AvP: ["_all",
    ["_one", LEX_ADJ, LEX_ADV, LEX_PRON],
    ["_any", "AvlP"],
    ["_any", ["_all", LEX_CONJ, "AvP"]],
  ],
  AvlP: ["_all",
    ["_one", LEX_ADJ, LEX_ADV],
    ["_any", "AvlP"],
    ["_any", ["_all", LEX_CONJ, "AvP"]],
  ],
  CgP: ["_one",
    "NP",
    ["_all",
      "VP",
      ["_any", "NP"],
      ["_any", "CgP"],
    ],
  ],
  CpP: ["_one",
    "NP",
    ["_all",
      ["_one", "VP", "EVP"],
      ["_any", "NP"],
      ["_any", "CpP"],
    ],
  ],
  ESP: ["_all", LEX_ESi, LEX_ESii, LEX_ESiii],
  EVNP: ["_all",
    ["_any", LEX_PRON],
    ["_any", "AvP"],
    LEX_EV,
    ["_any", "AavP"],
    ["_any",
      ["_all",
        ["_any", ["_one", LEX_PREP, LEX_PRT]],
        ["_one",
          ["_one",
            ["_all", "TP", "TP"],
            "TP",
          ],
          "EVOP",
          "EVNP",
        ],
        ["_any", "PP"],
      ],
    ],
  ],
  EVOP: ["_all",
    `x.$${D_P}`,
    ["_one",
      ["_all",
        ["_any", `rre$${D_C}`],
        ["_one",
          LEX_PRON,
          ["_all", LEX_EV, ["_any", "AavP"]],
        ],
      ],
      ["_all", `rre$${D_C}`, "NP"],
    ],
    "EVP",
  ],
  EVP: ["_all",
    ["_any", LEX_PRON],
    ["_any", "AvP"],
    LEX_EV,
    ["_any", ["_one", "AavP", "SevP"]],
    ["_any",
      ["_one",
        ["_one",
          ["_one",
            ["_all", "TP", "TP"],
            "TP",
          ],
          "PP",
        ],
        "EVNP",
      ],
    ],
    ["_any",
      "AavP",
      ["_one",
        ["_all", LEX_CONJ, ["_one", "VP", "EVP"]],
        "PP",
      ],
    ],
  ],
  EVhP: ["_all",
    LEX_EV,
    "TP",
    ["_any", "AavP"],
  ],
  EVscP: ["_all",
    LEX_EV,
    ["_any", "AavP"],
    ["_any",
      ["_one",
        `tes$${D_C}`,
        `ut$${D_C}`,
        `anw$${D_M}`,
        `dn$${D_P}`,
        `du$${D_P}`,
        `tie$${D_P}`,
        `tou$${D_C}`,
        `ween$${D_C}`,
        `won$${D_C}`,
        `elle$${D_C}`,
      ],
    ],
    "NsP",
    ["_any",
      ["_all", LEX_CONJ, ["_one", "VP", "EVP"]],
    ],
  ],
  EVsclP: ["_all",
    "EVscP",
    ["_any", "EVsclP"],
  ],
  NP: ["_all",
    ["_any", "AnP"],
    ["_one",
      ["_all", LEX_N, "NP"],
      LEX_N,
      "PP",
    ],
    ["_any",
      ["_all",
        ["_one",
          LEX_CONJ,
          `oz$${D_C}`,
          `ween$${D_C}`,
          `won$${D_C}`,
          `elle$${D_C}`,
        ],
        "NP",
      ],
    ],
  ],
  NsP: ["_all",
    ["_any", "AnP"],
    ["_one",
      ["_all", LEX_N, "NsP"],
      LEX_N,
    ],
    ["_any",
      ["_all",
        ["_one",
          LEX_CONJ,
          `oz$${D_C}`,
          `ween$${D_C}`,
          `won$${D_C}`,
          `elle$${D_C}`,
        ],
        "NsP",
      ],
    ],
  ],
  NtP: ["_all",
    ["_any", "AnP"],
    LEX_N,
    ["_any", "NtP"],
    ["_any",
      ["_all",
        ["_one",
          LEX_CONJ,
          `oz$${D_C}`,
          `ween$${D_C}`,
          `won$${D_C}`,
          `elle$${D_C}`,
        ],
        "NtP",
      ],
    ],
  ],
  PP: ["_all", ["_one", LEX_PREP, LEX_PRT], "NP"],
  SevP: ["_all",
    ["_one",
      ["_all",
        ["_any",
          ["_all",
            ["_any", `x.$${D_P}`],
            `rre$${D_C}`,
          ],
        ],
        ["_one",
          ["_all", ["_any", "AnpP"], LEX_PRON],
          ["_all", LEX_EV, ["_any", "AavP"]],
        ],
      ],
      ["_all", `rre$${D_C}`, "NsP"],
    ],
  ],
  SevnP: ["_all",
    `x.$${D_P}`,
    `rre$${D_C}`,
    "NsP",
  ],
  SevmP: ["_all",
    `x.$${D_P}`,
    `rre$${D_C}`,
    ["_one",
      ["_all",
        "EVscP",
        "EVscP",
        ["_any", "EVsclP"],
      ],
      "EVP",
    ],
  ],
  SgP: ["_all",
    ["_any", `rre$${D_C}`],
    ["_one",
      ["_all", ["_any", "AnpP"], LEX_PRON],
      "NsP",
    ],
  ],
  SgsP: ["_all",
    `rre$${D_C}`,
    ["_one",
      ["_all", ["_any", "AnpP"], LEX_PRON],
      "NsP",
    ],
  ],
  SpP: ["_all",
    `x.$${D_P}`,
    ["_one",
      ["_all", `rre$${D_C}`, "NsP"],
      ["_all",
        ["_any", `rre$${D_C}`],
        ["_one",
          "NsP",
          LEX_PRON,
          ["_all", LEX_EV, ["_any", "AavP"]],
        ],
      ],
    ],
  ],
  TP: ["_all",
    ["_any", ["_one", LEX_PRT, LEX_PREP, `en$${D_C}`]],
    "NtP",
  ],
  VP: ["_all",
    ["_any", LEX_PRON],
    ["_any", "AvP"],
    LEX_V,
    ["_any", "AavP"],
    ["_any",
      ["_one",
        ["_all", "TP", "TP"],
        "TP",
      ],
      "PP",
    ],
    ["_any",
      "AaP",
      ["_all", LEX_CONJ, ["_one", "VP", "EVP"]],
    ],
  ],
  VsP: ["_all",
    ["_any", "AvP"],
    LEX_V,
    ["_any", "AavP"],
    ["_any", "NsP"],
    ["_any",
      ["_all", LEX_CONJ, "VsP"],
    ],
  ],
};

// Maps internal phrase fragment names
// to the public reduced phrase IDs.
const PHRASE_REDUCTION: Record<string, PhraseId> = {
  AaP: "AP", AavP: "AP", AnP: "AP", AnpP: "AP", AvP: "AP",
  CP: "CP", ESP: "ESP",
  EVNP: "EOP", EVOP: "EOP",
  EVP: "EVP", EVhP: "EVP", EVscP: "EVP",
  NP: "NP", NsP: "NP", NtP: "NP",
  PP: "PP",
  SevP: "SVP",
  SevnP: "SP", SevmP: "SP", SgP: "SP", SgsP: "SP", SpP: "SP",
  TP: "TP",
  VP: "VP", VsP: "VP",
};

// ----- Internal node shape used during matching --------------------------
//
// Mirrors upstream `_SyntaxTree` / `_Phrase` / `_Word`. Carries a memoised
// leaf count so the matcher's repeated `countLeaves()` calls are O(1)
// instead of O(n) per node.

type InternalNode =
  | { kind: "phrase"; phrase: string; children: InternalNode[]; leaves: number }
  | { kind: "leaf"; originalIndex: number };

const LEAF_COUNT = (n: InternalNode): number =>
  n.kind === "leaf" ? 1 : n.leaves;

// ----- Token digestion ---------------------------------------------------
//
// `DigestedWord` mirrors upstream's `(details, prefix, suffix, slots)`.
// `candidates` corresponds to upstream's `details` — the multi-dialect
// candidate list returned by `lookup.readWords`. We seed `candidates` from
// the AnnotatedToken's `entries` field (already in upstream `ORDER BY
// dialect ASC` order via annotate.ts's DIALECT_PRIORITY: central first),
// then apply the pastalia+decoration rewrite in a second pass.

type Candidate = {
  word: string;
  classCode: number;
  dialect: number;
};

type DigestedWord = {
  originalIndex: number;
  candidates: Candidate[];
  hasPrefix: boolean;
};

type DigestResult = {
  words: DigestedWord[];
  pastalia: boolean;
};

const candidateFromEntry = (e: Entry): Candidate => ({
  word: e.word,
  classCode: e.classCode,
  dialect: DIALECT_INT[e.dialect],
});

// Build a one-shot lookup index for emotion-sound and marker tokens. Word
// tokens already carry their entries[] from annotate.ts, so this only
// needs to cover the kinds where the AnnotatedToken has no entries field.
function buildLookupIndex(corpus: Corpus): Map<string, Entry[]> {
  const index = new Map<string, Entry[]>();
  for (const e of corpus.entries) {
    const key = e.word.toLowerCase();
    const list = index.get(key) ?? [];
    list.push(e);
    index.set(key, list);
  }
  return index;
}

let cachedLookupIndex: { corpus: Corpus; index: Map<string, Entry[]> } | null = null;
function getLookupIndex(corpus: Corpus): Map<string, Entry[]> {
  if (cachedLookupIndex && cachedLookupIndex.corpus === corpus) {
    return cachedLookupIndex.index;
  }
  const index = buildLookupIndex(corpus);
  cachedLookupIndex = { corpus, index };
  return index;
}

function digestTokens(tokens: AnnotatedToken[], corpus: Corpus): DigestResult | null {
  const lookup = getLookupIndex(corpus);
  const words: DigestedWord[] = [];
  let pastalia = false;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (tok.kind === "whitespace" || tok.kind === "punctuation") continue;
    if (tok.kind === "unknown") return null;

    if (tok.kind === "word") {
      const candidates = tok.entries.map(candidateFromEntry);
      // Pastalia detection: any decoration is a hint, mirroring upstream
      // _sanitizePastalie. The force-class-4 rewrite below has a
      // narrower trigger (prefix only).
      if (tok.decorations !== undefined) pastalia = true;
      const hasPrefix = tok.decorations?.kind === "general"
        && tok.decorations.prefix !== undefined
        && tok.decorations.prefix.length > 0;
      words.push({ originalIndex: i, candidates, hasPrefix });
      continue;
    }

    // emotion-sound and marker — same shape: look up by text. Both kinds
    // must exist in the corpus or the line can't parse.
    const entries = lookup.get(tok.text.toLowerCase());
    if (!entries || entries.length === 0) return null;
    words.push({
      originalIndex: i,
      candidates: entries.map(candidateFromEntry),
      hasPrefix: false,
    });
  }

  // Pastalia + prefix-decoration → force class to LEX_N (4), mirroring
  // upstream syntax.py line 781 (`pastalie and p`). Only fires when the
  // word has a non-empty PREFIX from morphology — emotion-verb slot
  // decorations and pure-suffix decorations don't trigger it. The
  // rewrite is what lets prefixed Central nouns slot into the Pastalia
  // AST as nouns regardless of their dictionary class.
  if (pastalia) {
    for (const w of words) {
      if (!w.hasPrefix) continue;
      const pIndex = w.candidates.findIndex(c => c.dialect === D_P);
      const src = pIndex >= 0 ? w.candidates[pIndex]! : w.candidates[0]!;
      w.candidates = [{ word: src.word, classCode: LEX_N, dialect: src.dialect }];
    }
  }

  return { words, pastalia };
}

// ----- Matcher -----------------------------------------------------------

// `processWord_int` — match the head word's class against the target
// lex-class. Mirrors upstream syntax.py lines 912-920.
function processWord_int(words: DigestedWord[], target: LexClass): InternalNode | null {
  if (words.length === 0) return null;
  const head = words[0]!;
  for (const cand of head.candidates) {
    const classes = SYNTAX_MAPPING[cand.classCode];
    if (classes && classes.includes(target)) {
      return { kind: "leaf", originalIndex: head.originalIndex };
    }
  }
  return null;
}

// `processWord_exact` — match the head word's `(word, dialect)` against
// the exact-match specifier. Mirrors upstream syntax.py lines 899-910.
function processWord_exact(words: DigestedWord[], spec: string): InternalNode | null {
  if (words.length === 0) return null;
  const head = words[0]!;
  for (const cand of head.candidates) {
    const key = `${cand.word.toLowerCase()}$${cand.dialect}`;
    if (key === spec) {
      return { kind: "leaf", originalIndex: head.originalIndex };
    }
  }
  return null;
}

// Constraint guards from upstream syntax.py lines 794-823. Two distinct
// guards layered onto specific phrase fragments at entry time.
function applyGuards(words: DigestedWord[], phrase: string | null): boolean {
  if (words.length === 0) return true;

  // Guard 1: AnP/AvP/AnlP/AvlP head-disambiguation.
  if (phrase === "AnP" || phrase === "AvP" || phrase === "AnlP" || phrase === "AvlP") {
    if (words.length === 1) return false;
    const relevant: LexClass[] = phrase === "AnP" || phrase === "AnlP"
      ? [LEX_N] : [LEX_EV, LEX_V];
    const filter: LexClass[] = [LEX_ADV, LEX_ADJ];
    const headClassesPerCand = words[0]!.candidates
      .map(c => SYNTAX_MAPPING[c.classCode] ?? []);
    const nextClassesPerCand = words[1]!.candidates
      .map(c => SYNTAX_MAPPING[c.classCode] ?? []);

    for (const classes of headClassesPerCand) {
      const multi = classes.length > 1;
      const hasFilter = classes.some(c => filter.includes(c as LexClass));
      const hasRelevant = classes.some(c => relevant.includes(c as LexClass));
      if (multi && hasFilter && hasRelevant) {
        // Head is ambiguous between modifier and head-of-phrase. The
        // following word must also carry the relevant class, else fail.
        for (const f of nextClassesPerCand) {
          if (!f.some(c => relevant.includes(c as LexClass))) return false;
        }
      }
    }
  }

  // Guard 2: AaP/AalP — first candidate of head must not be re$1 / na$1 /
  // zz$6 (these are exclusively prefix words). Note: upstream looks at
  // only `words[0][0][0]` — the first candidate of the head word.
  if (phrase === "AaP" || phrase === "AalP") {
    const c = words[0]!.candidates[0]!;
    const key = `${c.word.toLowerCase()}$${c.dialect}`;
    if (key === `re$${D_C}` || key === `na$${D_C}` || key === `zz$${D_P}`) {
      return false;
    }
  }

  return true;
}

// Recursive AST matcher. Mirrors upstream `_processAST` syntax.py lines
// 794-878. Returns a list of internal nodes consumed from the input
// prefix, or null on failure. When `phrase` is set and the rule produced
// at least one node, the result is wrapped in a phrase parent.
function processAST(
  words: DigestedWord[],
  ast: ASTRule,
  phrase: string | null = null,
): InternalNode[] | null {
  if (!applyGuards(words, phrase)) return null;

  const ruleType = ast[0];
  let working = words;
  const successes: InternalNode[][] = [];
  let success = false;

  for (let i = 1; i < ast.length; i++) {
    const elem = ast[i] as ASTElement;
    let result: InternalNode[] | null = null;
    let offset = 0;

    if (typeof elem === "number") {
      const w = processWord_int(working, elem);
      if (w) {
        offset = 1;
        result = [w];
      }
    } else if (typeof elem === "string") {
      if (EXACT_MATCH_REGEXP.test(elem)) {
        const w = processWord_exact(working, elem);
        if (w) {
          offset = 1;
          result = [w];
        }
      } else {
        const frag = AST_FRAGMENTS[elem];
        if (!frag) throw new Error(`unknown phrase fragment: ${elem}`);
        const r = processAST(working, frag, elem);
        if (r) {
          offset = r.reduce((acc, n) => acc + LEAF_COUNT(n), 0);
          result = r;
        }
      }
    } else {
      // Nested rule.
      const r = processAST(working, elem as ASTRule);
      if (r) {
        offset = r.reduce((acc, n) => acc + LEAF_COUNT(n), 0);
        result = r;
      }
    }

    success = result !== null;

    if (!success && ruleType === "_all") return null;
    if (success) successes.push(result!);
    if (success && ruleType === "_one") break;
    if (offset > 0) working = working.slice(offset);
  }

  if (!success && ruleType === "_one") return null;

  const flat: InternalNode[] = [];
  for (const s of successes) for (const n of s) flat.push(n);

  if (phrase && flat.length > 0 && phrase in PHRASE_REDUCTION) {
    const leaves = flat.reduce((acc, n) => acc + LEAF_COUNT(n), 0);
    return [{ kind: "phrase", phrase, children: flat, leaves }];
  }
  return flat;
}

// ----- Public entry ------------------------------------------------------

function toPhraseTree(node: InternalNode): PhraseTree {
  if (node.kind === "leaf") return { kind: "leaf", tokenIndex: node.originalIndex };
  return {
    kind: "phrase",
    phrase: PHRASE_REDUCTION[node.phrase] ?? "CP",
    children: node.children.map(toPhraseTree),
  };
}

export function parseLine(
  tokens: AnnotatedToken[],
  corpus: Corpus,
): PhraseTree | null {
  const digested = digestTokens(tokens, corpus);
  if (!digested) return null;
  const { words, pastalia } = digested;
  if (words.length === 0) return null;

  const ast = pastalia ? PASTALIE_AST : GENERAL_AST;
  const result = processAST(words, ast);
  if (!result) return null;

  const totalLeaves = result.reduce((acc, n) => acc + LEAF_COUNT(n), 0);
  // Strict coverage gate (upstream syntax.py line 894). Partial parses
  // are rejected; the caller falls back to flat token rendering.
  if (totalLeaves !== words.length) return null;

  const root: InternalNode = {
    kind: "phrase",
    phrase: "CP",
    children: result,
    leaves: totalLeaves,
  };
  return toPhraseTree(root);
}
