// Top-level wiring: input → 100ms-debounced pipeline → group renderers.
// `annotateInput` emits a discriminated `AnnotatedGroup[]`: passthrough
// segments render via `<AnnotatedView>`, Binasphere blocks via
// `<BinasphereView>` (side-by-side voices + interleaved reference strip).

import { useEffect, useMemo, useState } from "preact/hooks";

import corpusJson from "../data/corpus.json";
import { AboutHymmnos } from "./components/AboutHymmnos.tsx";
import { AnnotatedView } from "./components/AnnotatedView.tsx";
import { BinasphereView } from "./components/BinasphereView.tsx";
import { LyricsInput } from "./components/LyricsInput.tsx";
import { annotateInput } from "./lib/pipeline.ts";
import type { Corpus } from "./lib/types.ts";

const corpus = corpusJson as Corpus;

// 2-voice Binasphere block with both voices oracle-pinned to parse — 6
// syllables per voice, alternating pattern `01`. Decodes to:
//   voice 0: Was yea ra chs hymmnos mea
//   voice 1: Wee ki ra chs ieeya ciel
// The original upstream-docs sample decoded to long multi-sentence
// voices that fell back to flat rendering even after the per-voice
// sentence split — this one demonstrates the phrase-tree feature inside
// the Binasphere column. Followed by two standalone lines that exercise
// the Pastalia emotion-verb + emotion-vowel-prefix decoration paths.
const SAMPLE = [
  "=> Was Wee yea ki ra ra chs chs hymmnos ieeya mea ciel EXEC hymme 2x1/0>>01",
  "Was yea ra chs hymmnos mea.",
  "aOuk Yacia.",
].join("\n");
const DEBOUNCE_MS = 100;

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function App() {
  const [input, setInput] = useState(SAMPLE);
  const [showSyntaxTree, setShowSyntaxTree] = useState(true);
  const debounced = useDebounced(input, DEBOUNCE_MS);
  const groups = useMemo(
    () => annotateInput(debounced, corpus),
    [debounced],
  );

  return (
    <main class="mx-auto max-w-3xl px-6 py-12 space-y-6">
      <header class="flex items-center gap-3">
        <img
          src={`${import.meta.env.BASE_URL}favicon.png`}
          alt=""
          class="h-10 w-auto"
        />
        <div class="space-y-0.5">
          <h1 class="text-3xl font-semibold leading-none">syec</h1>
          <p class="text-sm text-stone-400">annotated Hymmnos lyrics reader</p>
        </div>
        <label class="ml-auto inline-flex items-center gap-2 text-sm text-stone-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showSyntaxTree}
            onChange={(e) =>
              setShowSyntaxTree((e.currentTarget as HTMLInputElement).checked)
            }
            class="h-4 w-4 accent-stone-400"
          />
          Show syntax tree
        </label>
      </header>

      <AboutHymmnos />

      <LyricsInput value={input} onInput={setInput} />

      <section class="space-y-6">
        {groups.map((g, gi) =>
          g.kind === "block" ? (
            <BinasphereView
              key={gi}
              block={g.block}
              voices={g.voices}
              showTree={showSyntaxTree}
            />
          ) : (
            <AnnotatedView
              key={gi}
              segment={g.segment}
              showTree={showSyntaxTree}
            />
          ),
        )}
      </section>

      <footer class="pt-8 mt-8 border-t border-stone-800 text-xs text-stone-400 space-y-2">
        <p class="text-stone-300">Credits</p>
        <ul class="space-y-1">
          <li>
            Original Hymmnos Server:{" "}
            <a
              class="underline decoration-stone-600 hover:decoration-stone-400 hover:text-stone-200"
              href="http://game.salburg.com/hymmnoserver/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Hymmnos Server
            </a>{" "}
            by Akira Tsuchiya.
          </li>
          <li>
            English translations:{" "}
            <a
              class="underline decoration-stone-600 hover:decoration-stone-400 hover:text-stone-200"
              href="https://hymmnoserver.uguu.ca/index.php"
              target="_blank"
              rel="noopener noreferrer"
            >
              English Hymmnos Server (fan translation)
            </a>{" "}
            by Neil Tallim (
            <a
              class="underline decoration-stone-600 hover:decoration-stone-400 hover:text-stone-200"
              href="https://github.com/flan/hymmnoserver/"
              target="_blank"
              rel="noopener noreferrer"
            >
              source
            </a>
            ).
          </li>
          <li>
            Fonts:{" "}
            <a
              class="underline decoration-stone-600 hover:decoration-stone-400 hover:text-stone-200"
              href="http://game.salburg.com/hymmnoserver/hymmnos.ttf"
              target="_blank"
              rel="noopener noreferrer"
            >
              hymmnos.ttf
            </a>{" "}
            and{" "}
            <a
              class="underline decoration-stone-600 hover:decoration-stone-400 hover:text-stone-200"
              href="http://game.salburg.com/hymmnoserver/ar-ciela_compartment.ttf"
              target="_blank"
              rel="noopener noreferrer"
            >
              ar-ciela_compartment.ttf
            </a>{" "}
            from Hymmnos Server.
          </li>
        </ul>
      </footer>
    </main>
  );
}
