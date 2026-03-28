/**
 * Uses Claude to identify project ideas from a user's message history.
 * Much better than keyword matching since it understands context.
 *
 * Usage:
 *   npx tsx src/ingest/extract-ideas.ts
 */

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "node:fs";

const client = new Anthropic();

interface RawMsg {
  content: string;
  timestamp: string;
  guildName: string;
}

async function classifyBatch(messages: RawMsg[]): Promise<number[]> {
  const numbered = messages
    .map((m, i) => `[${i}] ${m.content}`)
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    temperature: 0,
    system: `You identify project ideas, feature proposals, and creative suggestions from Discord messages. A message is an "idea" if the person is:
- Proposing to build something (app, tool, bot, feature, project)
- Suggesting an experiment or approach to try
- Describing something they want to create or explore
- Pitching a concept to others
- Expressing excitement about a possibility they want to pursue

NOT ideas: questions, debugging, greetings, admin tasks, sharing links without commentary, status updates, opinions about existing things without proposing something new.

Respond with ONLY the numbers of messages that are ideas, comma-separated. If none, respond with "NONE".`,
    messages: [
      {
        role: "user",
        content: `Which of these messages are project ideas or creative proposals?\n\n${numbered}`,
      },
    ],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  if (text.trim() === "NONE") return [];

  return text
    .match(/\d+/g)
    ?.map(Number)
    .filter((n) => n >= 0 && n < messages.length) ?? [];
}

async function main() {
  const allMsgs: RawMsg[] = JSON.parse(readFileSync("data/raw/my-messages.json", "utf-8"));

  // Filter to substantial messages
  const candidates = allMsgs.filter(
    (m) => m.content.length > 40 && m.content.length < 500,
  );

  console.log(`${candidates.length} candidate messages to classify`);

  const batchSize = 30;
  const ideas: RawMsg[] = [];

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(candidates.length / batchSize);

    process.stdout.write(`Batch ${batchNum}/${totalBatches}... `);

    try {
      const ideaIndices = await classifyBatch(batch);
      const found = ideaIndices.map((idx) => batch[idx]);
      ideas.push(...found);
      console.log(`found ${found.length} ideas (${ideas.length} total)`);
    } catch (error: any) {
      console.log(`error: ${error.message}`);
    }
  }

  // Deduplicate by content
  const seen = new Set<string>();
  const unique = ideas.filter((m) => {
    if (seen.has(m.content)) return false;
    seen.add(m.content);
    return true;
  });

  // Sort by timestamp
  unique.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const output = unique.map((m) => ({
    content: m.content,
    timestamp: m.timestamp,
    guild: m.guildName,
  }));

  writeFileSync("data/ideas.json", JSON.stringify(output, null, 2));
  console.log(`\nDone! Found ${output.length} unique ideas, saved to data/ideas.json`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
