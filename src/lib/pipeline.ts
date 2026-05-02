// Top-level annotation pipeline: input string → grouped, annotated output.
//
// The renderer needs more than a flat list of segments — Binasphere blocks
// span multiple voices that should render side-by-side under a shared
// reference strip, while non-encoded text renders as plain interlinear
// gloss. So this composer emits `AnnotatedGroup[]` discriminated by `kind`:
//
//   passthrough → one annotated segment, render with `<AnnotatedView>`
//   block       → N voice segments + the `BinasphereBlock` they share,
//                 render with `<BinasphereView>`
//
// Voice segments belonging to the same Binasphere line are coalesced by
// reference equality on the `block` field — the decoder already shares one
// block ref across all of a block's voice segments.

import { annotate } from "./annotate.ts";
import { decode } from "./binasphere.ts";
import { tokenize } from "./tokenize.ts";
import type {
  AnnotatedToken, BinasphereBlock, Corpus,
} from "./types.ts";

export type AnnotatedSegment = {
  voice: number | null;
  tokens: AnnotatedToken[];
};

export type AnnotatedGroup =
  | { kind: "passthrough"; segment: AnnotatedSegment }
  | { kind: "block"; block: BinasphereBlock; voices: AnnotatedSegment[] };

export function annotateInput(
  input: string,
  corpus: Corpus,
): AnnotatedGroup[] {
  const groups: AnnotatedGroup[] = [];
  let openBlock: BinasphereBlock | null = null;
  let openVoices: AnnotatedSegment[] = [];

  const flushBlock = () => {
    if (openBlock !== null) {
      groups.push({ kind: "block", block: openBlock, voices: openVoices });
      openBlock = null;
      openVoices = [];
    }
  };

  for (const seg of decode(input)) {
    const annotated: AnnotatedSegment = {
      voice: seg.voice,
      tokens: annotate(tokenize(seg.text, corpus)),
    };
    if (seg.voice === null) {
      flushBlock();
      groups.push({ kind: "passthrough", segment: annotated });
      continue;
    }
    if (seg.block !== openBlock) {
      flushBlock();
      openBlock = seg.block;
    }
    openVoices.push(annotated);
  }
  flushBlock();

  return groups;
}
