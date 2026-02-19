import type { Message, TextChannel } from "discord.js";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Fetch recent messages from a Discord channel and format them as a
 * conversation for the Claude API.
 *
 * - Messages from others → role: "user" with "username: text" prefix
 * - Messages from the bot → role: "assistant" (the persona's own replies)
 *
 * Adjacent messages with the same role are merged to satisfy Claude's
 * alternating-role requirement.
 */
export async function buildConversationContext(
  channel: TextChannel,
  botUserId: string,
  limit: number,
): Promise<ConversationMessage[]> {
  const fetched = await channel.messages.fetch({ limit });
  // Discord returns newest-first; reverse to chronological order
  const messages = [...fetched.values()].reverse();

  const conversation: ConversationMessage[] = [];

  for (const msg of messages) {
    // Skip empty messages (e.g. image-only)
    const text = msg.content.trim();
    if (!text) continue;

    const role: "user" | "assistant" = msg.author.id === botUserId ? "assistant" : "user";
    const content =
      role === "user" ? `${msg.author.displayName}: ${text}` : text;

    // Merge adjacent same-role messages
    const last = conversation[conversation.length - 1];
    if (last && last.role === role) {
      last.content += `\n${content}`;
    } else {
      conversation.push({ role, content });
    }
  }

  // Claude requires the conversation to start with "user" — drop leading assistant messages
  while (conversation.length > 0 && conversation[0].role === "assistant") {
    conversation.shift();
  }

  return conversation;
}
