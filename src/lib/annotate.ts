// Promotes `Token[]` to `AnnotatedToken[]` by picking a single primary
// `Entry` for each `word` token — the one the renderer shows inline when a
// spelling resolves to several dialect variants. All other kinds pass
// through unchanged so the renderer can keep using the discriminant.
//
// Primary selection follows the dialect priority below (Central first, on
// the rationale from PLAN.md's open question), with the official entry
// preferred over a `+50` unofficial variant inside the same dialect.

import type {
  AnnotatedToken, Dialect, Entry, Token,
} from "./types.ts";

const DIALECT_PRIORITY: readonly Dialect[] = [
  "central",
  "pastalia",
  "metafalss",
  "cult-ciel",
  "alpha",
  "alpha-eolia",
  "cluster",
  "unknown",
];

function pickPrimary(entries: Entry[]): Entry {
  for (const dialect of DIALECT_PRIORITY) {
    const matches = entries.filter((e) => e.dialect === dialect);
    if (matches.length === 0) continue;
    return matches.find((e) => !e.unofficial) ?? matches[0]!;
  }
  return entries[0]!;
}

export function annotate(tokens: Token[]): AnnotatedToken[] {
  return tokens.map((t) => {
    if (t.kind !== "word") return t;
    const annotated: AnnotatedToken = {
      kind: "word",
      text: t.text,
      entries: t.entries,
      primary: pickPrimary(t.entries),
    };
    if (t.decorations) annotated.decorations = t.decorations;
    return annotated;
  });
}
