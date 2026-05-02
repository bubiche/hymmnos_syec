// Hand-authored qualitative category for every emotion-sound phrase in the
// upstream dump. Merged into `corpus.json` by `scripts/build-corpus.ts`.
//
// Phrases are stored in the canonical casing the dump uses; lookup at
// tokenize time will lowercase both sides. The structure mirrors the three
// hymmnoserver tiers, but each tier's phrases are coloured independently —
// a compound like "Was yea ra" tokenises as three separate emotion-sound
// tokens rather than a single combined one.
//
// Judgment calls worth reviewing:
//   Nn      reluctant            → sorrow  (reluctance leans negative)
//   i       impatient            → anger   (low-grade frustration)
//   paks    excited, nervous     → fear    (nervous tilts anxious)
//   quel    eager, desperate     → fear    (desperation outweighs eagerness)
//   wol     fervourous           → focus   (fervent attention, not passion)
//   ga/gaya rejection responses  → anger   (active rejection)

export type EmotionCategory =
  | "joy" | "sorrow" | "anger" | "focus" | "love" | "fear" | "neutral";

export const EMOTION_CATEGORIES: Record<string, EmotionCategory> = {
  // Tier I — intensity / discretion modifiers
  Fou:  "neutral",  // a little
  Ma:   "neutral",  // discretionary
  Nn:   "sorrow",   // reluctant
  Rrha: "focus",    // trance-like
  Was:  "neutral",  // very much
  Wee:  "neutral",  // reasonable

  // Tier II — primary emotional content
  apea:    "joy",     // blessed, bathed in happiness (cult-ciel)
  au:      "sorrow",  // sad (alpha-eolia)
  granme:  "love",    // wanting to protect, brave
  guwo:    "anger",   // angry, resentful
  i:       "anger",   // impatient
  jyel:    "sorrow",  // lonely
  ki:      "focus",   // focused, concentrating
  lau:     "fear",    // fear, dread (unofficial)
  num:     "neutral", // nil
  paks:    "fear",    // excited, nervous
  quel:    "fear",    // eager, desperate
  touwaka: "joy",     // hopeful
  waa:     "joy",     // happy (metafalss)
  wol:     "focus",   // fervourous
  yant:    "fear",    // fearful (metafalss)
  yea:     "joy",     // happy
  zweie:   "focus",   // determined, sincere

  // Tier III — situational response
  erra:  "joy",     // I want this to continue forever
  ga:    "anger",   // I want this to stop
  gagis: "neutral", // I am indifferent
  gaya:  "anger",   // I never want this to happen again
  ra:    "joy",     // I want this to continue
  wa:    "neutral", // I can tolerate this
};
