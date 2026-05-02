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

// Real Hymmnos sample — 2-voice Binasphere block, pattern 01101010
// (8 cycle positions × 8 cycles = 64 syllable tokens). Decodes to:
//   voice 0: Rrha apea gagis gran paul nosaash yanje en ini ar ciel /
//            Rrha apea ra hartes yora chyet walasye forgandal wassa ciel
//   voice 1: Rrha guwo gagis tie innna gatyuny ini ar ciel la zahha /
//            Rrha guwo ga gatyuny ar ciel en ini sor gatyunla art sa fayra
// Followed by two Pastalia exercise lines that hit the emotion-verb +
// emotion-vowel-prefix decoration paths in `<AnnotatedView>`.
const SAMPLE = [
  "=> RRHA RRHA GUWO Ax GAx PEx GIS A GAx TIE INNx GIS NA GRAN GAx PAUL NOx TYUNY INI SAASH AR YANJE CIEL EN INI LA ZAx AR HHA CIEL RRHA RRHA Ax GUWO GA PEx GAx A TYUNY RA HARx AR CIEL TES EN YORA INI CHYET WAx SOR GAx LAx TYUNx SYE LA FORx GANx ART SA DAL FAYx WASSA RA CIEL EXEC hymme 2x1/0>>01101010",
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
      </header>

      <AboutHymmnos />

      <LyricsInput value={input} onInput={setInput} />

      <section class="space-y-6">
        {groups.map((g, gi) =>
          g.kind === "block" ? (
            <BinasphereView key={gi} block={g.block} voices={g.voices} />
          ) : (
            <AnnotatedView key={gi} segment={g.segment} />
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
