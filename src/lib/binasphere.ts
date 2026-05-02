// 2-voice (and N-voice) Binasphere Chorus decoder. Ported from upstream
// `common/transformations.py` (`decodeBinasphere` + `_reconstructBinasphere`).
//
// A Binasphere block is a single line of the form
//
//   => <interleaved syllables> EXEC hymme <N>x1/0>><pattern>
//
// where <pattern> is a string of digits (one per cycle position) — packed
// when N <= 9, space-delimited when N > 9. Each digit names the voice (0..N-1)
// that consumes the next syllable token. Tokens ending in `x` are
// syllable fragments that buffer until the same voice receives a non-`x`
// token, at which point the buffered fragments concatenate with the closing
// token to form one decoded word.
//
// `decode(input)` walks the input line-by-line and either passes a line
// through as `{voice: null, text: line}` or expands a Binasphere line into
// one segment per voice. Adjacent non-Binasphere lines are coalesced so the
// downstream tokenizer sees them as a single string.
//
// v2 follow-up: the flat segment array can't distinguish voice 0 of
// block A from voice 0 of block B if a single input contains two blocks.
// Real Hymmnos has at most one Binasphere block per song; revisit if/when
// that stops being true.

import type { BinasphereBlock, BinasphereSegment } from "./types.ts";

type DecodedLine = {
  voices: string[];
  block: BinasphereBlock;
};

// Mirrors upstream's _BINASPHERE_REGEXP. Lazy `(.+?)` for the body so
// `EXEC hymme` is the right anchor; `\s+` and `\s*` instead of fixed-space
// literals are forgiving of double-spaces. The `i` flag accepts mixed-case
// "EXEC hymme" / "exec_hymme"; the body is captured raw and uppercase by
// convention.
const BINASPHERE_REGEXP =
  /^=>(.+?)EXEC[ _]hymme\s+(\d*[1-9])x1\/0\s*>>\s*((?:\d+\s*)+)$/i;

function tryDecodeLine(line: string): DecodedLine | null {
  const m = BINASPHERE_REGEXP.exec(line.trimEnd());
  if (!m) return null;

  const tokens = m[1]!.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const size = parseInt(m[2]!, 10);

  const seqRaw = m[3]!.trim();
  let pattern: number[];
  if (/\s/.test(seqRaw)) {
    pattern = seqRaw.split(/\s+/).map((s) => parseInt(s, 10));
  } else if (size <= 9) {
    pattern = [...seqRaw].map((c) => parseInt(c, 10));
  } else {
    // Upstream: "For line-counts greater than 9, sequence entries must be
    // space-delimited" — otherwise multi-digit voice indices are ambiguous.
    return null;
  }

  if (pattern.some((p) => Number.isNaN(p) || p < 0 || p >= size)) return null;
  if (tokens.length % pattern.length !== 0) return null;

  const buffers: string[][] = Array.from({ length: size }, () => []);
  const words: string[][] = Array.from({ length: size }, () => []);
  const interleaved: { token: string; voice: number }[] = [];

  let ti = 0;
  while (ti < tokens.length) {
    for (const voice of pattern) {
      const fragment = tokens[ti++]!;
      interleaved.push({ token: fragment, voice });
      if (fragment.endsWith("x") || fragment.endsWith("X")) {
        buffers[voice]!.push(fragment.slice(0, -1));
      } else {
        words[voice]!.push(buffers[voice]!.join("") + fragment);
        buffers[voice] = [];
      }
    }
  }

  // Unterminated fragments → bail rather than throw, so a malformed line
  // falls back to passthrough at the call site.
  for (const buf of buffers) {
    if (buf.length > 0) return null;
  }

  return {
    voices: words.map((w) => w.join(" ")),
    block: { voiceCount: size, pattern, interleaved },
  };
}

export function decode(input: string): BinasphereSegment[] {
  const lines = input.split("\n");
  const result: BinasphereSegment[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    result.push({ voice: null, text: buffer.join("\n") });
    buffer = [];
  };

  for (const line of lines) {
    const decoded = tryDecodeLine(line);
    if (decoded) {
      flush();
      // Same `block` reference on every voice segment — the renderer groups
      // by reference equality to render the side-by-side BinasphereView.
      decoded.voices.forEach((text, voice) => {
        result.push({ voice, text, block: decoded.block });
      });
    } else {
      buffer.push(line);
    }
  }
  flush();

  return result;
}
