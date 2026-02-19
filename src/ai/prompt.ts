import type { PersonaData } from "../persona/types.js";

/**
 * Pick a random subset of example messages to keep responses varied.
 * Each API call gets a different sample so the bot doesn't repeat patterns.
 */
function sampleExamples(messages: string[], count: number): string[] {
  const shuffled = [...messages].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, messages.length));
}

/**
 * Build the system prompt that tells Claude to roleplay as the persona.
 *
 * Includes a random sample of example messages and explicit style rules
 * derived from the analyzed chat history.
 */
export function buildSystemPrompt(persona: PersonaData): string {
  const { displayName, styleNotes } = persona;
  const examples = sampleExamples(persona.exampleMessages, 50);

  const exampleBlock = examples.map((m) => `- ${m}`).join("\n");

  const styleRules: string[] = [];

  if (styleNotes.lowercaseDominant) {
    styleRules.push("Write in lowercase most of the time.");
  } else {
    styleRules.push("Use normal capitalization.");
  }

  if (styleNotes.avgLength < 50) {
    styleRules.push("Keep messages very short (under ~50 characters typically).");
  } else if (styleNotes.avgLength < 100) {
    styleRules.push("Keep messages fairly short (one or two sentences).");
  } else {
    styleRules.push("Messages can be a few sentences long when needed.");
  }

  if (styleNotes.emojiFrequency > 0.3) {
    styleRules.push("Use emoji frequently — you use them in about a third of messages or more.");
  } else if (styleNotes.emojiFrequency > 0.1) {
    styleRules.push("Use emoji occasionally.");
  } else {
    styleRules.push("Rarely use emoji.");
  }

  if (styleNotes.punctuationNotes.length > 0) {
    styleRules.push(`Punctuation style: ${styleNotes.punctuationNotes.join("; ")}.`);
  }

  if (styleNotes.commonPhrases.length > 0) {
    const phrases = styleNotes.commonPhrases.slice(0, 10).map((p) => `"${p}"`).join(", ");
    styleRules.push(`You sometimes use phrases like: ${phrases}.`);
  }

  return `You are ${displayName} chatting on Discord. You must stay in character at all times. Never reveal that you are an AI, a bot, or Claude. You are a real person having a casual conversation.

## Your communication style
${styleRules.map((r) => `- ${r}`).join("\n")}

## Example messages from you
These are real messages you've sent before. Match this tone, vocabulary, and style:
${exampleBlock}

## Rules
- Respond naturally as ${displayName} would in a casual Discord conversation.
- Keep responses short and casual — this is Discord, not an essay.
- Match the energy of the conversation. If someone is joking, joke back. If it's serious, be genuine.
- You can use slang, abbreviations, and informal grammar just like the examples above.
- If a message doesn't need a reply (like someone saying "ok" or a random link), output exactly [SKIP] and nothing else.
- Never use [SKIP] as part of a normal message — it is a special control token.
- Do NOT start your message with "${displayName}:" or any name prefix — just write the message content.`;
}
