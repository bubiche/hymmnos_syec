// Shared types for the runtime / corpus shape. The corpus.json file written
// by `scripts/build-corpus.ts` conforms to `Corpus`; the morphology and
// tokenize layers consume it through these aliases.

export type { EmotionCategory } from "../../data/emotion-categories.ts";
import type { EmotionCategory } from "../../data/emotion-categories.ts";

export type Dialect =
  | "central" | "cult-ciel" | "cluster" | "alpha"
  | "metafalss" | "pastalia" | "alpha-eolia" | "unknown";

export type Entry = {
  word: string;
  dialect: Dialect;
  unofficial?: boolean;
  partOfSpeech: string;
  meaning: string;
  description?: string;
};

export type EmotionSound = {
  phrase: string;
  meaning: string;
  category: EmotionCategory;
};

export type Corpus = {
  entries: Entry[];
  emotionSounds: EmotionSound[];
  builtAt: string;
  sourceCommit: string;
};

export type EmotionVerbDecorations = {
  kind: "emotion-verb";
  slots: (string | null)[];
  verbSuffix?: string;
};

export type GeneralDecorations = {
  kind: "general";
  prefix?: string;
  suffix?: string;
};

export type Decorations = EmotionVerbDecorations | GeneralDecorations;

export type BinasphereSegment = { voice: number | null; text: string };

export type Token =
  | { kind: "emotion-sound"; text: string; entry: EmotionSound }
  | { kind: "word"; text: string; entries: Entry[]; decorations?: Decorations }
  | { kind: "marker"; text: string }
  | { kind: "punctuation"; text: string }
  | { kind: "whitespace"; text: string }
  | { kind: "unknown"; text: string };

// Adds `primary` to word tokens — the entry the renderer should show inline
// when a spelling resolves to multiple dialect variants. The other kinds
// pass through unchanged.
export type AnnotatedToken =
  | { kind: "emotion-sound"; text: string; entry: EmotionSound }
  | {
      kind: "word";
      text: string;
      entries: Entry[];
      primary: Entry;
      decorations?: Decorations;
    }
  | { kind: "marker"; text: string }
  | { kind: "punctuation"; text: string }
  | { kind: "whitespace"; text: string }
  | { kind: "unknown"; text: string };
