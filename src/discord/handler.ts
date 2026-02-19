import type { Client, Message, TextChannel } from "discord.js";
import { config } from "../config.js";
import type { PersonaData } from "../persona/types.js";
import { buildSystemPrompt } from "../ai/prompt.js";
import { buildConversationContext } from "../ai/context.js";
import { generateResponse } from "../ai/claude.js";
import { RateLimiter } from "../util/rate-limiter.js";

const rateLimiter = new RateLimiter(config.behavior.cooldownMs);
const allowedChannels = new Set(config.channels);

/** Returns a random integer between min and max (inclusive). */
function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Sleep for a given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wire up the messageCreate handler on the Discord client.
 * This is the core orchestration — every incoming message flows through here.
 */
export function registerHandler(client: Client, persona: PersonaData): void {
  client.on("messageCreate", async (message: Message) => {
    try {
      await handleMessage(message, client, persona);
    } catch (error) {
      console.error("Error handling message:", error);
    }
  });
}

async function handleMessage(
  message: Message,
  client: Client,
  persona: PersonaData,
): Promise<void> {
  // --- Guard checks ---

  // Ignore DMs
  if (!message.guild) return;

  // Channel allowlist
  if (!allowedChannels.has(message.channelId)) return;

  // Ignore own messages
  if (message.author.id === client.user?.id) return;

  // Ignore bots (unless configured otherwise)
  if (config.behavior.ignoreBots && message.author.bot) return;

  // Ignore empty messages (images, embeds only)
  if (!message.content.trim()) return;

  // --- Probabilistic skip ---
  if (Math.random() > config.behavior.replyChance) {
    return;
  }

  // --- Cooldown ---
  if (rateLimiter.isOnCooldown(message.channelId)) {
    return;
  }

  // --- Build context and generate ---
  const channel = message.channel as TextChannel;

  const conversationContext = await buildConversationContext(
    channel,
    client.user!.id,
    config.behavior.contextMessageCount,
  );

  // Show typing indicator and add human-like delay
  const delay = randomDelay(config.behavior.minDelayMs, config.behavior.maxDelayMs);
  channel.sendTyping();

  const systemPrompt = buildSystemPrompt(persona);

  // Start API call and delay in parallel
  const [response] = await Promise.all([
    generateResponse({ systemPrompt, messages: conversationContext }),
    sleep(delay),
  ]);

  // [SKIP] → do nothing
  if (!response) return;

  // Clean response: remove any accidental name prefix
  let cleaned = response;
  const namePrefix = `${persona.displayName}:`;
  if (cleaned.startsWith(namePrefix)) {
    cleaned = cleaned.slice(namePrefix.length).trim();
  }

  if (!cleaned) return;

  await channel.send(cleaned);
  rateLimiter.recordSend(message.channelId);
}
