import { Client, GatewayIntentBits } from "discord.js";

/**
 * Create and configure the Discord.js client.
 *
 * Requires the MESSAGE CONTENT privileged intent to be enabled in the
 * Discord Developer Portal for the bot application.
 */
export function createClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });
}
