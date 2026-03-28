import {
  SlashCommandBuilder,
  REST,
  Routes,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import { readFileSync } from "node:fs";
import { env } from "../config.js";
import type { PersonaData } from "../persona/types.js";
import { buildIdeaPrompt } from "../ai/prompt.js";
import { generateResponse } from "../ai/claude.js";

interface SavedIdea {
  content: string;
  timestamp: string;
  guild: string;
}

/** Load Nick's real ideas from the extracted ideas file. */
function loadIdeas(path = "data/ideas.json"): SavedIdea[] {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    console.warn("Could not load ideas.json, /idea will generate from scratch");
    return [];
  }
}

const savedIdeas = loadIdeas();

const ideaCommand = new SlashCommandBuilder()
  .setName("idea")
  .setDescription("Generate a project idea in Nick's style")
  .addStringOption((option) =>
    option
      .setName("topic")
      .setDescription("Optional topic to focus the idea on (e.g. flutter, ai, games)")
      .setRequired(false),
  );

/** Register slash commands with Discord. */
export async function registerCommands(clientId: string): Promise<void> {
  const rest = new REST().setToken(env.DISCORD_BOT_TOKEN);
  const commands = [ideaCommand.toJSON()];

  console.log("Registering slash commands...");
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log("Slash commands registered");
}

/** Wire up the interactionCreate handler for slash commands. */
export function registerCommandHandler(client: Client, persona: PersonaData): void {
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "idea") {
      await handleIdea(interaction, persona);
    }
  });
}

async function handleIdea(
  interaction: ChatInputCommandInteraction,
  persona: PersonaData,
): Promise<void> {
  await interaction.deferReply();

  const topic = interaction.options.getString("topic") ?? undefined;
  const realIdeas = savedIdeas.map((i) => i.content);
  const systemPrompt = buildIdeaPrompt(persona, topic, realIdeas);

  const prompt = topic
    ? `Tell me about a project idea you've had related to "${topic}".`
    : "Tell me about a project idea you've had.";

  const response = await generateResponse({
    systemPrompt,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 500,
  });

  if (!response) {
    await interaction.editReply("Hmm, brain's empty right now. Try again!");
    return;
  }

  // Clean any accidental name prefix
  let cleaned = response;
  const namePrefix = `${persona.displayName}:`;
  if (cleaned.startsWith(namePrefix)) {
    cleaned = cleaned.slice(namePrefix.length).trim();
  }

  await interaction.editReply(cleaned);
}
