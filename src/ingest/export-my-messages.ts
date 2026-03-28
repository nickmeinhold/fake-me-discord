/**
 * Export all of a user's messages across all servers they belong to,
 * using Discord's search API (which supports author filtering).
 *
 * NOTE: This uses a user token (not a bot token) for personal data export.
 * User token automation is against Discord's ToS — use this only for
 * one-off exports of your own data, not in production or for other users.
 *
 * Usage:
 *   npx tsx src/ingest/export-my-messages.ts --token YOUR_USER_TOKEN --user-id YOUR_USER_ID
 */

const BASE = "https://discord.com/api/v9";

interface CliArgs {
  token: string;
  userId: string;
  output: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const token = get("--token");
  const userId = get("--user-id");
  if (!token || !userId) {
    console.error("Usage: npx tsx src/ingest/export-my-messages.ts --token TOKEN --user-id USER_ID");
    console.error("  --output <path>  (default: data/raw/my-messages.json)");
    process.exit(1);
  }

  return {
    token,
    userId,
    output: get("--output") ?? "data/raw/my-messages.json",
  };
}

async function api(token: string, path: string, params?: Record<string, string>, retries = 0): Promise<any> {
  const url = new URL(`${BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: token },
  });

  if (res.status === 429) {
    if (retries >= 5) {
      throw new Error(`Rate limited ${retries} times on ${path} — giving up`);
    }
    const retry = res.headers.get("Retry-After");
    const waitMs = (parseFloat(retry ?? "5") + 0.5) * 1000;
    console.log(`  Rate limited (attempt ${retries + 1}/5), waiting ${Math.round(waitMs / 1000)}s...`);
    await sleep(waitMs);
    return api(token, path, params, retries + 1);
  }

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ExportedMessage {
  id: string;
  content: string;
  timestamp: string;
  channelId: string;
  guildId: string;
  guildName: string;
  channelName: string;
}

async function searchGuild(
  token: string,
  guildId: string,
  guildName: string,
  userId: string,
): Promise<ExportedMessage[]> {
  const messages: ExportedMessage[] = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const params: Record<string, string> = {
      author_id: userId,
      include_nsfw: "true",
      offset: String(offset),
    };

    const data = await api(token, `/guilds/${guildId}/messages/search`, params);
    total = data.total_results ?? 0;

    if (!data.messages || data.messages.length === 0) break;

    for (const group of data.messages) {
      // Search returns message groups (context); the matching message is in the middle
      for (const msg of group) {
        if (msg.author?.id === userId && msg.content?.trim()) {
          messages.push({
            id: msg.id,
            content: msg.content,
            timestamp: msg.timestamp,
            channelId: msg.channel_id,
            guildId,
            guildName,
            channelName: "", // filled in later if needed
          });
        }
      }
    }

    offset += data.messages.length;
    console.log(`  ${Math.min(offset, total)}/${total} results processed`);

    // Be nice to the API — search endpoints have strict rate limits
    await sleep(1000);
  }

  return messages;
}

async function searchDMs(
  token: string,
  userId: string,
): Promise<ExportedMessage[]> {
  // Get DM channels
  const channels: any[] = await api(token, "/users/@me/channels");
  const messages: ExportedMessage[] = [];

  for (const channel of channels) {
    const channelName =
      channel.recipients?.map((r: any) => r.username).join(", ") ?? "DM";

    let offset = 0;
    let total = Infinity;

    while (offset < total) {
      const params: Record<string, string> = {
        author_id: userId,
        offset: String(offset),
      };

      let data: any;
      try {
        data = await api(token, `/channels/${channel.id}/messages/search`, params);
      } catch {
        break; // some DM channels may not support search
      }

      total = data.total_results ?? 0;
      if (total === 0 || !data.messages || data.messages.length === 0) break;

      for (const group of data.messages) {
        for (const msg of group) {
          if (msg.author?.id === userId && msg.content?.trim()) {
            messages.push({
              id: msg.id,
              content: msg.content,
              timestamp: msg.timestamp,
              channelId: channel.id,
              guildId: "DM",
              guildName: "Direct Messages",
              channelName,
            });
          }
        }
      }

      offset += data.messages.length;
      await sleep(1000);
    }

    if (messages.length > 0) {
      console.log(`  DM with ${channelName}: found messages`);
    }
  }

  return messages;
}

async function main() {
  const args = parseArgs();
  console.log("Exporting your messages across all servers...\n");

  // Get guilds
  const guilds: any[] = await api(args.token, "/users/@me/guilds");
  console.log(`Found ${guilds.length} servers\n`);

  const allMessages: ExportedMessage[] = [];

  // Search each guild (skip DMs — use DiscordChatExporter for those)
  for (let i = 0; i < guilds.length; i++) {
    const guild = guilds[i];
    console.log(`[${i + 1}/${guilds.length}] Searching: ${guild.name}...`);
    try {
      const messages = await searchGuild(args.token, guild.id, guild.name, args.userId);
      allMessages.push(...messages);
      console.log(`  Found ${messages.length} messages\n`);
    } catch (error: any) {
      console.log(`  Skipped (${error.message})\n`);
    }
  }

  // Deduplicate by message ID
  const seen = new Set<string>();
  const unique = allMessages.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  // Sort by timestamp
  unique.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Write output
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { resolve, dirname } = await import("node:path");
  const outPath = resolve(args.output);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(unique, null, 2));

  console.log(`\nDone! Exported ${unique.length} unique messages to ${outPath}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
