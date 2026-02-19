import "dotenv/config";
import { readFileSync } from "node:fs";
import { z } from "zod";

const envSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1, "DISCORD_BOT_TOKEN is required"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
});

const configSchema = z.object({
  persona: z.object({
    name: z.string().min(1),
    discordUserId: z.string().min(1),
  }),
  channels: z.array(z.string().min(1)).min(1),
  behavior: z.object({
    replyChance: z.number().min(0).max(1).default(0.85),
    cooldownMs: z.number().nonnegative().default(5000),
    minDelayMs: z.number().nonnegative().default(1500),
    maxDelayMs: z.number().nonnegative().default(8000),
    contextMessageCount: z.number().int().positive().default(25),
    ignoreBots: z.boolean().default(true),
  }),
  ai: z.object({
    model: z.string().default("claude-sonnet-4-20250514"),
    maxTokens: z.number().int().positive().default(300),
    temperature: z.number().min(0).max(2).default(0.9),
  }),
});

export type AppConfig = z.infer<typeof configSchema>;
export type EnvConfig = z.infer<typeof envSchema>;

function loadEnv(): EnvConfig {
  return envSchema.parse(process.env);
}

function loadConfig(path = "config.json"): AppConfig {
  const raw = readFileSync(path, "utf-8");
  return configSchema.parse(JSON.parse(raw));
}

/** Validated environment variables. */
export const env = loadEnv();

/** Validated application config from config.json. */
export const config = loadConfig();
