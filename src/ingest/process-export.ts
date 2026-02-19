/**
 * CLI script to process a raw Discord chat export into persona.json.
 *
 * Supports:
 * - DiscordChatExporter JSON format (primary)
 * - Official Discord data export CSV (messages/c{channelId}/messages.csv)
 *
 * Usage:
 *   npm run ingest -- --input data/raw/export.json --user-id 123456789012345678
 *   npm run ingest -- --input data/raw/messages.csv --user-id 123456789012345678 --format csv
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { PersonaData, StyleNotes } from "../persona/types.js";

// --- CLI argument parsing ---

interface CliArgs {
  input: string;
  userId: string;
  format: "json" | "csv";
  output: string;
  sampleSize: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const input = get("--input");
  const userId = get("--user-id");
  if (!input || !userId) {
    console.error("Usage: npm run ingest -- --input <file> --user-id <discord-user-id>");
    console.error("  --format json|csv   (default: auto-detected from extension)");
    console.error("  --output <path>     (default: data/persona.json)");
    console.error("  --sample-size <n>   (default: 500)");
    process.exit(1);
  }

  const format = (get("--format") ?? (input.endsWith(".csv") ? "csv" : "json")) as "json" | "csv";
  const output = get("--output") ?? "data/persona.json";
  const sampleSize = parseInt(get("--sample-size") ?? "500", 10);

  return { input, userId, format, output, sampleSize };
}

// --- Parsers ---

interface RawMessage {
  content: string;
  authorId: string;
  timestamp: string;
}

/**
 * Parse DiscordChatExporter JSON format.
 * Expected structure: { messages: [{ author: { id }, content, timestamp }] }
 */
function parseDiscordChatExporterJson(filePath: string): RawMessage[] {
  const raw = JSON.parse(readFileSync(filePath, "utf-8"));
  const messages: unknown[] = raw.messages ?? [];
  return messages.map((m: any) => ({
    content: String(m.content ?? ""),
    authorId: String(m.author?.id ?? ""),
    timestamp: String(m.timestamp ?? ""),
  }));
}

/**
 * Parse official Discord data export CSV.
 * Columns: ID,Timestamp,Contents,Attachments
 * (No author ID column — assumes all messages are from the exporting user.)
 */
function parseDiscordCsv(filePath: string, userId: string): RawMessage[] {
  const raw = readFileSync(filePath, "utf-8");
  const lines = raw.split("\n").slice(1); // skip header
  return lines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      // CSV with potential quoted fields
      const fields = parseCsvLine(line);
      return {
        content: fields[2] ?? "",
        authorId: userId, // CSV exports are always the requesting user
        timestamp: fields[1] ?? "",
      };
    });
}

/** Minimal CSV line parser that handles quoted fields with commas. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// --- Message filtering & sampling ---

/**
 * Filter to the target user's messages, removing:
 * - Empty messages
 * - Messages that are only URLs/attachments
 * - Messages shorter than 10 or longer than 300 chars (for style analysis)
 * - Bot commands (starting with ! / . / /)
 */
function filterMessages(messages: RawMessage[], userId: string): string[] {
  const urlOnly = /^https?:\/\/\S+$/;
  const botCommand = /^[!./]/;

  return messages
    .filter((m) => m.authorId === userId)
    .map((m) => m.content.trim())
    .filter((text) => {
      if (text.length < 10 || text.length > 300) return false;
      if (urlOnly.test(text)) return false;
      if (botCommand.test(text)) return false;
      return true;
    });
}

/**
 * Sample messages distributed across the array to get temporal variety.
 * Uses systematic sampling (every Nth message) with a random offset.
 */
function sampleMessages(messages: string[], count: number): string[] {
  if (messages.length <= count) return messages;

  const step = messages.length / count;
  const offset = Math.random() * step;
  const sampled: string[] = [];

  for (let i = 0; i < count; i++) {
    const idx = Math.floor(offset + i * step);
    sampled.push(messages[idx]);
  }
  return sampled;
}

// --- Style analysis ---

const EMOJI_REGEX = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;

function computeStyleNotes(messages: string[]): StyleNotes {
  const totalLength = messages.reduce((sum, m) => sum + m.length, 0);
  const avgLength = Math.round(totalLength / messages.length);

  const withEmoji = messages.filter((m) => EMOJI_REGEX.test(m)).length;
  const emojiFrequency = Math.round((withEmoji / messages.length) * 100) / 100;

  // Capitalization: check if first character of messages is usually lowercase
  const lowercaseStarts = messages.filter(
    (m) => m[0] && m[0] === m[0].toLowerCase() && m[0] !== m[0].toUpperCase(),
  ).length;
  const lowercaseDominant = lowercaseStarts / messages.length > 0.6;

  // Punctuation habits
  const punctuationNotes: string[] = [];
  const endsWithPeriod = messages.filter((m) => m.endsWith(".")).length / messages.length;
  const endsWithExclamation = messages.filter((m) => m.endsWith("!")).length / messages.length;
  const endsWithQuestion = messages.filter((m) => m.endsWith("?")).length / messages.length;
  const endsWithNoPunct = messages.filter((m) => /[a-zA-Z0-9]$/.test(m)).length / messages.length;

  if (endsWithNoPunct > 0.5) punctuationNotes.push("often omits ending punctuation");
  if (endsWithPeriod > 0.3) punctuationNotes.push("frequently ends with periods");
  if (endsWithExclamation > 0.15) punctuationNotes.push("uses exclamation marks often");
  if (endsWithQuestion > 0.2) punctuationNotes.push("asks lots of questions");

  // Common phrases: find 2-3 word sequences that appear often
  const phraseCounts = new Map<string, number>();
  for (const msg of messages) {
    const words = msg.toLowerCase().split(/\s+/);
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      phraseCounts.set(bigram, (phraseCounts.get(bigram) ?? 0) + 1);
    }
  }

  const commonPhrases = [...phraseCounts.entries()]
    .filter(([, count]) => count >= 5) // appears at least 5 times
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([phrase]) => phrase);

  return {
    avgLength,
    emojiFrequency,
    lowercaseDominant,
    punctuationNotes,
    commonPhrases,
  };
}

// --- Main ---

function main() {
  const args = parseArgs();
  console.log(`Processing ${args.format.toUpperCase()} export: ${args.input}`);
  console.log(`Filtering for user ID: ${args.userId}`);

  // Parse
  const raw =
    args.format === "json"
      ? parseDiscordChatExporterJson(args.input)
      : parseDiscordCsv(args.input, args.userId);

  console.log(`Parsed ${raw.length} total messages`);

  // Filter
  const filtered = filterMessages(raw, args.userId);
  console.log(`${filtered.length} messages after filtering (10-300 chars, no URLs/commands)`);

  if (filtered.length === 0) {
    console.error("No messages matched. Check the user ID and export format.");
    process.exit(1);
  }

  // Sample
  const sampled = sampleMessages(filtered, args.sampleSize);
  console.log(`Sampled ${sampled.length} messages`);

  // Analyze style
  const styleNotes = computeStyleNotes(filtered); // analyze all filtered, not just sampled
  console.log(`Style: avg ${styleNotes.avgLength} chars, ${styleNotes.emojiFrequency} emoji rate`);
  console.log(`  Lowercase dominant: ${styleNotes.lowercaseDominant}`);
  console.log(`  Punctuation: ${styleNotes.punctuationNotes.join(", ") || "no strong patterns"}`);
  console.log(`  Common phrases: ${styleNotes.commonPhrases.slice(0, 5).join(", ")}`);

  // Build persona
  // Try to load name from config.json, fall back to "Unknown"
  let displayName = "Unknown";
  try {
    const configRaw = JSON.parse(readFileSync("config.json", "utf-8"));
    displayName = configRaw.persona?.name ?? "Unknown";
  } catch {
    console.warn("Could not read config.json for persona name, using 'Unknown'");
  }

  const persona: PersonaData = {
    displayName,
    exampleMessages: sampled,
    styleNotes,
  };

  // Write output
  const outputPath = resolve(args.output);
  mkdirSync(resolve(args.output, ".."), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(persona, null, 2));
  console.log(`\nWrote persona to ${outputPath}`);
}

main();
