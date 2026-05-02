// Renders a Binasphere block as a side-by-side stack of voices, each its
// own `<AnnotatedView>`. A reference strip above shows the original
// interleaved syllables colour-coded by voice — each strip cell is a
// Hymmnos glyph above its Latin reading, so the strip mirrors how
// upstream renders the encoded form while staying machine-readable.
//
// Layout: a flex-wrap row with each voice claiming `min-w-[260px]`. On
// narrow screens that means one voice per row (vertical stack); on wider
// screens 2+ fit side-by-side, which scales naturally if Quatrasphere
// lands in v2.
//
// Voice colours come from a small fixed palette chosen to read distinctly
// against the dark background and not collide with the seven emotion-sound
// pill hues used by `<AnnotatedView>` (amber/sky/rose/violet/pink/teal/
// stone). Anything beyond the palette length wraps modulo — fine for v1
// since 2 voices is the only case in scope.

import { AnnotatedView } from "./AnnotatedView.tsx";
import type { AnnotatedSegment } from "../lib/pipeline.ts";
import type { BinasphereBlock } from "../lib/types.ts";

type Props = {
  block: BinasphereBlock;
  voices: AnnotatedSegment[];
};

const VOICE_TEXT = [
  "text-emerald-300",
  "text-fuchsia-300",
  "text-orange-300",
  "text-cyan-300",
];

const VOICE_PILL = [
  "bg-emerald-500/15 ring-emerald-400/30",
  "bg-fuchsia-500/15 ring-fuchsia-400/30",
  "bg-orange-500/15 ring-orange-400/30",
  "bg-cyan-500/15 ring-cyan-400/30",
];

function voiceTextClass(voice: number): string {
  return VOICE_TEXT[voice % VOICE_TEXT.length]!;
}

function voicePillClass(voice: number): string {
  return VOICE_PILL[voice % VOICE_PILL.length]!;
}

function formatPattern(pattern: number[], voiceCount: number): string {
  // Mirrors upstream's input format: packed when N ≤ 9, space-delimited
  // otherwise. Pattern is normalised to digits at parse time, so the
  // round-trip is purely cosmetic here.
  return voiceCount <= 9 ? pattern.join("") : pattern.join(" ");
}

function StripCell(props: {
  text: string;
  pillClass?: string;
  colorClass?: string;
}) {
  const wrapper = props.pillClass
    ? `inline-flex flex-col items-center px-1.5 py-1 rounded ring-1 ${props.pillClass} ${props.colorClass ?? ""}`
    : `inline-flex flex-col items-center px-1 py-1 ${props.colorClass ?? "text-stone-500"}`;
  return (
    <span class={wrapper}>
      <span
        class="text-base leading-none mb-1"
        style={{ fontFamily: "var(--font-hymmnos)" }}
      >
        {props.text}
      </span>
      <span class="font-mono text-[11px] leading-none">{props.text}</span>
    </span>
  );
}

export function BinasphereView({ block, voices }: Props) {
  const trailer = `EXEC hymme ${block.voiceCount}x1/0>>${formatPattern(block.pattern, block.voiceCount)}`;

  return (
    <div class="space-y-4 rounded-lg border border-stone-800 bg-stone-900/40 p-4">
      <div class="flex flex-wrap items-end gap-x-1.5 gap-y-2">
        <StripCell text="=>" />
        {block.interleaved.map((tok, i) => (
          <StripCell
            key={i}
            text={tok.token}
            pillClass={voicePillClass(tok.voice)}
            colorClass={voiceTextClass(tok.voice)}
          />
        ))}
        <StripCell text={trailer} />
      </div>

      <div class="flex flex-wrap gap-6">
        {voices.map((seg) => (
          <div key={seg.voice} class="flex-1 min-w-[260px] space-y-2">
            <div
              class={`text-xs uppercase tracking-wide ${voiceTextClass(seg.voice ?? 0)}`}
            >
              voice {seg.voice}
            </div>
            <AnnotatedView segment={seg} />
          </div>
        ))}
      </div>
    </div>
  );
}
