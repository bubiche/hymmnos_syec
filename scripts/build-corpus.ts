// ETL: flan/hymmnoserver mysqldump -> data/corpus.json
//
// Strategy: parse the two INSERT lines out of the dump and convert to our
// shape. We don't need a real SQL engine — the dump has no exotic types,
// only quoted strings, integers, and NULL.
//
// Re-fetch the dump via:
//   git clone https://github.com/flan/hymmnoserver.git
//   cp hymmnoserver/database/hymmnoserver.mysqldump data/upstream/

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import iconv from "iconv-lite";
import { EMOTION_CATEGORIES, type EmotionCategory } from "../data/emotion-categories.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const DUMP_PATH = resolve(PROJECT_ROOT, "data/upstream/hymmnoserver.mysqldump");
const OUT_PATH = resolve(PROJECT_ROOT, "data/corpus.json");

// Pinned upstream commit. Bump when re-fetching the dump.
const SOURCE_COMMIT = "75f5f4a8172ed9d22ab1e03e269c174ae8c98621";

type Dialect =
  | "central" | "cult-ciel" | "cluster" | "alpha"
  | "metafalss" | "pastalia" | "alpha-eolia" | "unknown";

type Entry = {
  word: string;          // for Pastalia emotion verbs, dots mark bank slots
  dialect: Dialect;
  unofficial?: boolean;
  classCode: number;     // upstream class int (1–25), needed by the syntax parser
  partOfSpeech: string;
  meaning: string;
  description?: string;
};

type EmotionSound = {
  phrase: string;
  meaning: string;
  category: EmotionCategory;
};

type Corpus = {
  entries: Entry[];
  emotionSounds: EmotionSound[];
  builtAt: string;
  sourceCommit: string;
};

// Dialect codes from common/lookup.py. +50 = unofficial.
const DIALECT_BY_CODE: Record<number, Dialect> = {
  0: "unknown",
  1: "central",
  2: "cult-ciel",
  3: "cluster",
  4: "alpha",
  5: "metafalss",
  6: "pastalia",
  7: "alpha-eolia",
};

// Class codes from database/add_words.py (legend, not data).
const PART_OF_SPEECH_BY_CLASS: Record<number, string> = {
  1: "Emotion Verb",
  2: "verb",
  3: "adverb",
  4: "noun",
  5: "conjunction",
  6: "preposition",
  7: "Emotion Sound (II)",
  8: "adjective",
  9: "noun, verb",
  10: "adjective, noun",
  11: "adjective, verb",
  12: "particle",
  13: "Emotion Sound (III)",
  14: "Emotion Sound (I)",
  15: "pronoun",
  16: "interjection",
  17: "preposition, particle",
  18: "language construct",
  19: "adverb, noun",
  20: "adjective, adverb",
  21: "conjunction, preposition",
  22: "particle, verb",
  23: "adverb, particle",
  24: "noun, preposition",
  25: "adverb, preposition",
};

type SqlValue = string | number | null;

// The dump is double-encoded: original UTF-8 bytes were misread as CP-1252
// then re-encoded as UTF-8. To recover, encode each char back through CP-1252
// to a byte, then re-decode as UTF-8. Plain Latin-1 won't do — characters
// like ƒ (U+0192) and ‚ (U+201A) live in CP-1252's 0x80–0x9F range.
function fixMojibake(s: string): string {
  return iconv.encode(s, "win1252").toString("utf8");
}

// Parses the "(v1,v2,...),(v1,v2,...),..." body of a MySQL INSERT.
// Handles single-quoted strings (with backslash escapes and doubled quotes),
// integers, and NULL. No floats, dates, or hex literals — none in this dump.
function parseSqlValues(input: string): SqlValue[][] {
  const rows: SqlValue[][] = [];
  let i = 0;
  const n = input.length;

  const skipWs = () => { while (i < n && /\s/.test(input[i]!)) i++; };

  while (i < n) {
    skipWs();
    if (i >= n) break;
    if (input[i] === ",") { i++; continue; }
    if (input[i] !== "(") throw new Error(`Expected '(' at offset ${i}, got ${JSON.stringify(input[i])}`);
    i++;

    const row: SqlValue[] = [];
    while (true) {
      skipWs();
      const c = input[i];

      if (c === "'") {
        i++;
        let s = "";
        while (i < n) {
          const ch = input[i]!;
          if (ch === "\\") {
            const next = input[i + 1];
            if (next === "n") s += "\n";
            else if (next === "r") s += "\r";
            else if (next === "t") s += "\t";
            else if (next === "0") s += "\0";
            else if (next === "Z") s += "\x1a";
            else s += next ?? ""; // \\, \', \", etc.
            i += 2;
          } else if (ch === "'") {
            if (input[i + 1] === "'") { s += "'"; i += 2; }
            else { i++; break; }
          } else {
            s += ch; i++;
          }
        }
        row.push(s);
      } else if (c === "N" && input.slice(i, i + 4) === "NULL") {
        row.push(null);
        i += 4;
      } else if (c !== undefined && /[0-9-]/.test(c)) {
        const start = i;
        if (input[i] === "-") i++;
        while (i < n && /[0-9]/.test(input[i]!)) i++;
        row.push(parseInt(input.slice(start, i), 10));
      } else {
        throw new Error(`Unexpected char ${JSON.stringify(c)} at offset ${i}`);
      }

      skipWs();
      if (input[i] === ",") { i++; continue; }
      if (input[i] === ")") { i++; break; }
      throw new Error(`Expected ',' or ')' at offset ${i}, got ${JSON.stringify(input[i])}`);
    }
    rows.push(row);
  }

  return rows;
}

function extractInsertValues(dump: string, table: string): string {
  // Tolerant of multi-line INSERTs, but in this dump each INSERT is one line.
  const re = new RegExp(`INSERT INTO \`${table}\` VALUES (.+?);\\s*$`, "ms");
  const m = re.exec(dump);
  if (!m) throw new Error(`No INSERT found for table ${table}`);
  return m[1]!;
}

function mapDialect(code: number): { dialect: Dialect; unofficial: boolean } {
  if (code in DIALECT_BY_CODE) {
    return { dialect: DIALECT_BY_CODE[code]!, unofficial: false };
  }
  if (code >= 50 && code - 50 in DIALECT_BY_CODE) {
    return { dialect: DIALECT_BY_CODE[code - 50]!, unofficial: true };
  }
  return { dialect: "unknown", unofficial: code >= 50 };
}

function buildEntry(row: SqlValue[]): Entry {
  // Schema: (word, meaning, japanese, dialect, kana, romaji, description, class, syllables)
  const [word, meaning, , dialectCode, , , description, classCode] = row;

  if (typeof word !== "string") throw new Error(`bad word: ${JSON.stringify(word)}`);
  if (typeof meaning !== "string") throw new Error(`bad meaning: ${JSON.stringify(meaning)}`);
  if (typeof dialectCode !== "number") throw new Error(`bad dialect: ${JSON.stringify(dialectCode)}`);
  if (typeof classCode !== "number") throw new Error(`bad class: ${JSON.stringify(classCode)}`);

  const { dialect, unofficial } = mapDialect(dialectCode);
  const partOfSpeech = PART_OF_SPEECH_BY_CLASS[classCode] ?? `class ${classCode}`;

  const entry: Entry = {
    word: fixMojibake(word),
    dialect,
    classCode,
    partOfSpeech,
    meaning: fixMojibake(meaning),
  };
  if (unofficial) entry.unofficial = true;
  if (typeof description === "string" && description.length > 0) {
    entry.description = fixMojibake(description);
  }

  return entry;
}

function buildEmotionSounds(entries: Entry[]): EmotionSound[] {
  const sounds: EmotionSound[] = [];
  const missing: string[] = [];
  const unused = new Set(Object.keys(EMOTION_CATEGORIES));

  for (const e of entries) {
    if (!e.partOfSpeech.startsWith("Emotion Sound")) continue;
    const category = EMOTION_CATEGORIES[e.word];
    if (!category) {
      missing.push(e.word);
      continue;
    }
    unused.delete(e.word);
    sounds.push({ phrase: e.word, meaning: e.meaning, category });
  }

  if (missing.length > 0) {
    throw new Error(`Missing emotion-sound categories: ${missing.join(", ")}`);
  }
  if (unused.size > 0) {
    throw new Error(`Stale categories not in dump: ${[...unused].join(", ")}`);
  }
  return sounds;
}

function summarise(entries: Entry[]): void {
  const byDialect = new Map<string, number>();
  const byPos = new Map<string, number>();
  let unofficialCount = 0;
  for (const e of entries) {
    byDialect.set(e.dialect, (byDialect.get(e.dialect) ?? 0) + 1);
    byPos.set(e.partOfSpeech, (byPos.get(e.partOfSpeech) ?? 0) + 1);
    if (e.unofficial) unofficialCount++;
  }
  console.log(`  unofficial: ${unofficialCount}`);
  console.log("  by dialect:");
  for (const [d, n] of [...byDialect.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${d.padEnd(12)} ${n}`);
  }
  console.log("  emotion-related part-of-speech counts:");
  for (const pos of ["Emotion Verb", "Emotion Sound (I)", "Emotion Sound (II)", "Emotion Sound (III)"]) {
    console.log(`    ${pos.padEnd(20)} ${byPos.get(pos) ?? 0}`);
  }
}

function summariseEmotionSounds(sounds: EmotionSound[]): void {
  const byCategory = new Map<string, number>();
  for (const s of sounds) {
    byCategory.set(s.category, (byCategory.get(s.category) ?? 0) + 1);
  }
  console.log("  emotion sounds by category:");
  for (const [c, n] of [...byCategory.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${c.padEnd(8)} ${n}`);
  }
}

function main(): void {
  const dump = readFileSync(DUMP_PATH, "utf8");
  const valuesText = extractInsertValues(dump, "hymmnos");
  const rows = parseSqlValues(valuesText);

  // Sanity: parsed-row count should equal the number of "),(" separators + 1.
  const expectedTuples = (valuesText.match(/\),\(/g)?.length ?? 0) + 1;
  if (rows.length !== expectedTuples) {
    throw new Error(`tuple count mismatch: parsed ${rows.length}, expected ${expectedTuples}`);
  }

  console.log(`parsed ${rows.length} rows from hymmnos`);

  const entries = rows.map(buildEntry);
  const emotionSounds = buildEmotionSounds(entries);

  const corpus: Corpus = {
    entries,
    emotionSounds,
    builtAt: new Date().toISOString(),
    sourceCommit: SOURCE_COMMIT,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(corpus, null, 2) + "\n", "utf8");

  console.log(`wrote ${entries.length} entries and ${emotionSounds.length} emotion sounds to ${OUT_PATH}`);
  summarise(entries);
  summariseEmotionSounds(emotionSounds);
}

main();
