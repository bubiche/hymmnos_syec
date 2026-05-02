// Skeleton landing screen for step 8 — verifies the scaffold runs end-to-end:
// Preact mounts, Tailwind utilities apply, and both glyph fonts load and
// render their respective scripts. Real components arrive in steps 9-12.

const HYMMNOS_PANGRAM = "Was yea ra chs hymmnos mea";
const AR_CIELA_PANGRAM = "ammue apea beja chyet clyncye deata";

export function App() {
  return (
    <main class="mx-auto max-w-3xl px-6 py-12 space-y-10">
      <header class="space-y-1">
        <h1 class="text-3xl font-semibold">syec</h1>
        <p class="text-stone-400">annotated Hymmnos lyrics reader</p>
      </header>

      <section class="space-y-3">
        <h2 class="text-sm uppercase tracking-wide text-stone-500">
          Hymmnos script
        </h2>
        <p class="text-3xl font-[Hymmnos]">{HYMMNOS_PANGRAM}</p>
        <p class="text-stone-500 text-sm">{HYMMNOS_PANGRAM}</p>
      </section>

      <section class="space-y-3">
        <h2 class="text-sm uppercase tracking-wide text-stone-500">
          Ar Ciela script
        </h2>
        <p class="text-3xl font-[Ar_Ciela]">{AR_CIELA_PANGRAM}</p>
        <p class="text-stone-500 text-sm">{AR_CIELA_PANGRAM}</p>
      </section>

      <p class="text-stone-600 text-sm">
        scaffold ready — input + annotation arriving in steps 9-12
      </p>
    </main>
  );
}
