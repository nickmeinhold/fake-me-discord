import { env, config } from "./config.js";
import { loadPersona } from "./persona/loader.js";
import { createClient } from "./discord/client.js";
import { registerHandler } from "./discord/handler.js";

async function main() {
  console.log("fake-me-discord starting up...");

  // Load persona data
  const persona = loadPersona();

  // Create and configure Discord client
  const client = createClient();

  // Wire up message handler
  registerHandler(client, persona);

  // Log when ready
  client.once("ready", (c) => {
    console.log(`Logged in as ${c.user.tag}`);
    console.log(`Watching ${config.channels.length} channel(s)`);
    console.log(`Reply chance: ${config.behavior.replyChance * 100}%`);
    console.log(`Cooldown: ${config.behavior.cooldownMs}ms`);
  });

  // Login
  await client.login(env.DISCORD_BOT_TOKEN);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
