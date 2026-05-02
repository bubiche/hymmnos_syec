import { test } from "node:test";
import assert from "node:assert/strict";

import { decode } from "./binasphere.ts";

// Voice segments now carry a `block` reference for the side-by-side renderer;
// these tests project to {voice, text} so the public decoded contract stays
// the focus and block shape gets its own dedicated test below.
function project(segs: ReturnType<typeof decode>) {
  return segs.map((s) => ({ voice: s.voice, text: s.text }));
}

test("non-encoded input passes through as a single null-voice segment", () => {
  const input = "Was yea ra chs hymmnos mea.\nRrha ki ra tie yor.";
  assert.deepEqual(decode(input), [{ voice: null, text: input }]);
});

test("simple 2-voice block decodes by interleaving pattern", () => {
  // Pattern "01" with 4 tokens [A B C D]:
  //   cycle 1: voice 0 ← A,  voice 1 ← B
  //   cycle 2: voice 0 ← C,  voice 1 ← D
  const input = "=> A B C D EXEC hymme 2x1/0>>01";
  assert.deepEqual(project(decode(input)), [
    { voice: 0, text: "A C" },
    { voice: 1, text: "B D" },
  ]);
});

test("trailing-`x` syllable fragments concat with the next non-x token", () => {
  // Pattern "01" with 4 tokens [HEx FOO LLO BAR]:
  //   voice 0: HEx (buffer "HE"), then LLO → word "HELLO"
  //   voice 1: FOO (word "FOO"), then BAR (word "BAR")
  const input = "=> HEx FOO LLO BAR EXEC hymme 2x1/0>>01";
  assert.deepEqual(project(decode(input)), [
    { voice: 0, text: "HELLO" },
    { voice: 1, text: "FOO BAR" },
  ]);
});

test("voice segments expose a shared block with interleaved tokens", () => {
  const segs = decode("=> A B C D EXEC hymme 2x1/0>>01");
  assert.equal(segs.length, 2);
  const v0 = segs[0]!;
  const v1 = segs[1]!;
  assert.notEqual(v0.voice, null);
  assert.notEqual(v1.voice, null);
  if (v0.voice === null || v1.voice === null) return;

  // Same block reference shared across all voice segments.
  assert.equal(v0.block, v1.block);

  assert.deepEqual(v0.block, {
    voiceCount: 2,
    pattern: [0, 1],
    interleaved: [
      { token: "A", voice: 0 },
      { token: "B", voice: 1 },
      { token: "C", voice: 0 },
      { token: "D", voice: 1 },
    ],
  });
});
