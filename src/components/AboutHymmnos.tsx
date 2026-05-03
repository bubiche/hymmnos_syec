// Collapsible "About Hymmnos" panel surfaced above the input. Six native
// <details> sections distilled from the English fan translation at
// hymmnoserver.uguu.ca — introduction, the reader's word-type legend,
// grammar skeleton, Pastalia / emotion verbs, the dialect roster, and the
// Ar Ciela notation. Default-collapsed at both the outer and inner level
// so the page still opens to the input/output flow; expanding is a
// no-state-management toggle handled by the browser.

import type { ComponentChildren } from "preact";

import { CATEGORY_PILL, PHRASE_PALETTE } from "./AnnotatedView.tsx";
import type { PhraseId } from "../lib/syntax.ts";
import type { EmotionCategory } from "../lib/types.ts";

const CATEGORIES: EmotionCategory[] = [
  "joy", "sorrow", "anger", "focus", "love", "fear", "neutral",
];

// 11 phrase types shown in the legend; MP is in the public PhraseId type
// for completeness but never produced by the current AST, so we omit it.
// Order: roughly outer-to-inner / sentence-level to leaf-level so the
// legend reads as a top-down decomposition.
const PHRASE_LEGEND: PhraseId[] = [
  "CP", "ESP", "SP", "SVP", "VP", "EVP", "TP", "EOP", "NP", "AP", "PP",
];

function Section({
  title,
  children,
}: {
  title: string;
  children: ComponentChildren;
}) {
  return (
    <details class="border-t border-stone-800 first:border-t-0">
      <summary class="cursor-pointer select-none py-2 text-sm font-medium text-stone-200 hover:text-stone-100">
        {title}
      </summary>
      <div class="pb-4 text-sm leading-relaxed text-stone-300 space-y-2">
        {children}
      </div>
    </details>
  );
}

export function AboutHymmnos() {
  return (
    <details class="rounded-lg border border-stone-800 bg-stone-900/40 px-4">
      <summary class="cursor-pointer select-none py-3 text-sm font-medium text-stone-100 hover:text-stone-200">
        About Hymmnos
      </summary>

      <div class="space-y-0 pb-2">
        <Section title="Introduction">
          <p>
            Hymmnos is the constructed language of song magic in the{" "}
            <em>Ar Tonelico</em> video game series. In its fiction, words are
            waves that propagate through the world — H-waves carry intent and
            emotion, D-waves carry physical matter — and the right phrase, sung
            in the right way, produces real effects.
          </p>
          <p>
            It's a coherent system with grammar and vocabulary you can learn,
            not just decorative chant. This reader is a tool for following
            along: paste lyrics into the input below and each token is
            annotated with its Latin reading, gloss, and (where applicable) the
            dialect glyph.
          </p>
        </Section>

        <Section title="Word types in this reader">
          <p>
            Each non-whitespace token becomes a column with a glyph row, a
            Latin reading, and a short gloss. The four kinds you'll encounter:
          </p>
          <ul class="list-disc pl-5 space-y-1">
            <li>
              <strong class="text-stone-200">Words</strong> — Hymmnos
              vocabulary. Hover or tap a word column to see its full dictionary
              entry, including any other dialect variants that share the
              spelling.
            </li>
            <li>
              <strong class="text-stone-200">Emotion sounds</strong> — three-word
              prefixes that open most sentences and carry the speaker's feeling.
              Rendered as coloured pills by category:
            </li>
          </ul>
          <ul class="flex flex-wrap gap-1.5 pl-5">
            {CATEGORIES.map((c) => (
              <li
                key={c}
                class={`inline-flex px-2 py-0.5 rounded text-[10px] uppercase tracking-wide ring-1 ${CATEGORY_PILL[c]}`}
              >
                {c}
              </li>
            ))}
          </ul>
          <ul class="list-disc pl-5 space-y-1">
            <li>
              <strong class="text-stone-200">Markers</strong> —{" "}
              <code class="font-mono text-xs">EXEC</code>,{" "}
              <code class="font-mono text-xs">=&gt;</code>,{" "}
              <code class="font-mono text-xs">/.</code>,{" "}
              <code class="font-mono text-xs">-&gt;</code> and similar tokens
              that delimit chants and Binasphere blocks.
            </li>
            <li>
              <strong class="text-stone-200">Decorations</strong> — for
              Pastalia, the matched bank-slot fills or vowel prefix / suffix
              show up as a muted fourth line under the gloss.
            </li>
          </ul>
          <p>
            Punctuation and unrecognised tokens render in greyer styles so the
            rest of the line stays scannable.
          </p>
        </Section>

        <Section title="Phrase types">
          <p>
            When a line parses cleanly, the reader wraps each phrase in a
            tinted box with a short type badge. Phrases nest: the outer
            sentence box contains its emotion-sound prefix, then a verb or
            emotion-verb phrase, then objects and modifiers. You can toggle
            the boxes off with the checkbox in the header.
          </p>
          <p>
            The eleven types you'll see, roughly from sentence root inward:
          </p>
          <ul class="flex flex-wrap gap-2">
            {PHRASE_LEGEND.map((id) => {
              const palette = PHRASE_PALETTE[id];
              return (
                <li
                  key={id}
                  class={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded ${palette.box}`}
                >
                  <span
                    class={`text-[10px] font-semibold uppercase tracking-wider ${palette.badge}`}
                  >
                    {id}
                  </span>
                  <span class="text-[12px] text-stone-300">{palette.name}</span>
                </li>
              );
            })}
          </ul>
          <p>
            Lines that don't fully parse — partial input mid-edit, malformed
            grammar, or unknown words — fall back to the flat token row with
            no boxes. As you finish typing a sentence, the boxes pop in.
          </p>
        </Section>

        <Section title="Grammar basics">
          <p>
            A typical Hymmnos sentence opens with an{" "}
            <em>Emotion Sound</em> — a three-word prefix expressing the
            speaker's feeling — followed by a verb and one or more objects. The
            speaker is the implicit subject; non-speaker subjects are
            introduced with{" "}
            <code class="font-mono text-xs">rre</code> plus a subject pronoun.
          </p>
          <p>
            The first emotion word marks degree, the second marks the feeling
            itself, and the third marks desirability. So{" "}
            <em>Was yea ra chs hymmnos mea</em> reads as{" "}
            <em>Was yea ra</em> (very + happy + want-to-continue) +{" "}
            <em>chs</em> (become) +{" "}
            <em>hymmnos mea</em> (my song): roughly, "I am happy to become a
            song."
          </p>
        </Section>

        <Section title="Pastalia & emotion verbs">
          <p>
            Pastalia is a later, much more compact dialect: a single{" "}
            <em>Emotion Verb</em> can be a whole sentence. Each verb is a
            lowercase consonant skeleton — the <em>bank slots</em> — with
            uppercase <em>Emotion Vowels</em> filled in. Slots before the
            period carry more emotional weight than those after.
          </p>
          <p>
            Vowels come in three categories:
          </p>
          <ul class="list-disc pl-5 space-y-1">
            <li>
              <strong class="text-stone-200">A E I O U</strong> — the speaker's
              own feelings (A = strength, E = happiness, I = pain, …).
            </li>
            <li>
              <strong class="text-stone-200">YA YE YI YO YU</strong> — feelings
              about another person.
            </li>
            <li>
              <strong class="text-stone-200">LYA LYE LYI LYO LYU</strong> —
              feelings about the world or surroundings.
            </li>
          </ul>
          <p>
            Vowels can also prefix nouns to mark possession plus emotional
            charge: <em>Egasar</em> is "my stuffed animal, that makes me
            happy"; <em>YUgasar</em> is "their stuffed animal, that worries
            them." A complete Pastalia sentence might be{" "}
            <em>cEzE hymmnos/.</em> — "I am delighted to express myself through
            song."
          </p>
        </Section>

        <Section title="Persistent Emotion Sounds">
          <p>
            Long Hymmns sometimes share one emotion-sound prefix across many
            sentences instead of repeating it on every line. The block
            opens with the declared triple followed by{" "}
            <code class="font-mono text-xs">0x vvi.</code> and closes with{" "}
            <code class="font-mono text-xs">1x AAs ixi.</code> — for example:
          </p>
          <pre class="text-xs leading-snug bg-stone-950/60 border border-stone-800 rounded p-2 overflow-x-auto">
{`Was yea ra 0x vvi.
chs hymmnos rudje
Wee ki ra kalla en yor
1x AAs ixi.`}
          </pre>
          <p>
            Every body line inside the block parses <em>as if</em> the
            declared triple were prepended, so{" "}
            <em>chs hymmnos rudje</em> reads as{" "}
            <em>Was yea ra chs hymmnos rudje</em> — a complete sentence — and
            shows up with the same phrase boxes it would in the un-shortened
            form. The triple isn't drawn into the body row (the prefix is
            implicit, not literally written), but the reader marks every line
            inside the block with a yellow left bar so you can see the
            persistent emotion at a glance. If a body line embeds another
            ES(I) word, the parser splits there and the second half gets the
            same prefix re-applied — that's a sentence break.
          </p>
        </Section>

        <Section title="Dialects">
          <p>
            Seven dialects appear in the corpus, used at different points in
            the games' history:
          </p>
          <ul class="list-disc pl-5 space-y-1">
            <li>
              <strong class="text-stone-200">Central</strong> — the everyday
              standard of Sol Ciel's Tower; the default you'll see most.
            </li>
            <li>
              <strong class="text-stone-200">Cult Ciel</strong> — the ancient
              ceremonial form used by the first Tsukikanade shamans. Now
              largely dead and written in its own glyph set.
            </li>
            <li>
              <strong class="text-stone-200">Cluster</strong> — a regional
              variant from the Sol Cluster, mechanically near-identical to
              Central.
            </li>
            <li>
              <strong class="text-stone-200">Alpha</strong> — Tower-specific
              dialects bound to individual Origin Reyvateils; not really
              general-purpose.
            </li>
            <li>
              <strong class="text-stone-200">Metafalss</strong> — the sacred
              language of First-Era Metafalss; individual words carry unusual
              power.
            </li>
            <li>
              <strong class="text-stone-200">Pastalia</strong> — the Infel
              Phira-era dialect with the radically compact emotion-verb grammar
              above.
            </li>
            <li>
              <strong class="text-stone-200">Alpha-EOLIA</strong> — a small
              Alpha variant attested in a handful of words.
            </li>
          </ul>
        </Section>

        <Section title="Ar Ciela">
          <p>
            Ar Ciela isn't really a human language. In the fiction it's the
            language of the planet itself, expressed as electromagnetic H-waves
            spanning roughly 20 Hz to 600 kHz — about thirty times the range of
            human hearing.
          </p>
          <p>
            Each individual sound carries its own emotional concept (desire,
            transformation, protection); words are aggregations of those
            feelings rather than labels for objects, which is why concrete
            nouns are essentially unrepresentable. The Cult Ciel dialect
            rendered in this reader is the human-audible portion of that
            language, written in its own glyph set.
          </p>
        </Section>
      </div>
    </details>
  );
}
