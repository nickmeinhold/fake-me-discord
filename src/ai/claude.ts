import Anthropic from "@anthropic-ai/sdk";
import { env, config } from "../config.js";

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

interface GenerateOptions {
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

/**
 * Generate a response from Claude using the persona's system prompt
 * and the conversation context.
 *
 * Returns the response text, or null if Claude outputs [SKIP].
 */
export async function generateResponse(options: GenerateOptions): Promise<string | null> {
  const { systemPrompt, messages } = options;

  if (messages.length === 0) return null;

  const response = await client.messages.create({
    model: config.ai.model,
    max_tokens: config.ai.maxTokens,
    temperature: config.ai.temperature,
    system: systemPrompt,
    messages,
  });

  const text =
    response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

  // Check for the [SKIP] control token
  if (text === "[SKIP]" || text.startsWith("[SKIP]")) {
    return null;
  }

  return text || null;
}
