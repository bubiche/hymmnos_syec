import { test } from "node:test";
import assert from "node:assert/strict";

import { decode } from "./binasphere.ts";

test("non-encoded input passes through as a single null-voice segment", () => {
  const input = "Was yea ra chs hymmnos mea.\nRrha ki ra tie yor.";
  assert.deepEqual(decode(input), [{ voice: null, text: input }]);
});

test("simple 2-voice block decodes by interleaving pattern", () => {
  // Pattern "01" with 4 tokens [A B C D]:
  //   cycle 1: voice 0 ← A,  voice 1 ← B
  //   cycle 2: voice 0 ← C,  voice 1 ← D
  const input = "=> A B C D EXEC hymme 2x1/0>>01";
  assert.deepEqual(decode(input), [
    { voice: 0, text: "A C" },
    { voice: 1, text: "B D" },
  ]);
});

test("trailing-`x` syllable fragments concat with the next non-x token", () => {
  // Pattern "01" with 4 tokens [HEx FOO LLO BAR]:
  //   voice 0: HEx (buffer "HE"), then LLO → word "HELLO"
  //   voice 1: FOO (word "FOO"), then BAR (word "BAR")
  const input = "=> HEx FOO LLO BAR EXEC hymme 2x1/0>>01";
  assert.deepEqual(decode(input), [
    { voice: 0, text: "HELLO" },
    { voice: 1, text: "FOO BAR" },
  ]);
});
