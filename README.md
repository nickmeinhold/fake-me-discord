# fake-me-discord

A Discord bot that impersonates you using Claude AI. Feed it your exported chat history and it learns your communication style — vocabulary, punctuation habits, emoji usage, message length, and common phrases — then responds in character in designated channels.

Built for a fun social experiment: two friends each run a bot that pretends to be them, chatting with each other.

## How it works

1. **Ingest** — Process a Discord chat export to build a persona profile (`persona.json`) with example messages and style analysis
2. **Prompt** — Each API call includes a system prompt with your style rules and a random sample of 50 example messages (varied each time to prevent repetition)
3. **Respond** — The bot watches configured channels, simulates typing with human-like delays, and replies in character
4. **Skip** — Claude can output `[SKIP]` to stay silent when a message doesn't need a reply, making the bot feel natural

## Setup

### Prerequisites

- Node.js 18+
- A [Discord bot](https://discord.com/developers/applications) with the **Message Content** privileged intent enabled
- An [Anthropic API key](https://console.anthropic.com/)

### Install

```bash
npm install
```

### Configure

1. Copy the environment template and fill in your secrets:

```bash
cp .env.example .env
```

```
DISCORD_BOT_TOKEN=your-discord-bot-token
ANTHROPIC_API_KEY=your-anthropic-api-key
```

2. Edit `config.json` with your persona name, Discord user ID, and the channel IDs the bot should respond in:

```json
{
  "persona": {
    "name": "YourName",
    "discordUserId": "123456789012345678"
  },
  "channels": ["channel-id-1"],
  "behavior": {
    "replyChance": 0.85,
    "cooldownMs": 5000,
    "minDelayMs": 1500,
    "maxDelayMs": 8000,
    "contextMessageCount": 25,
    "ignoreBots": true
  },
  "ai": {
    "model": "claude-sonnet-4-20250514",
    "maxTokens": 300,
    "temperature": 0.9
  }
}
```

### Build your persona

Export your Discord chat history using [DiscordChatExporter](https://github.com/Tyrrrz/DiscordChatExporter) (JSON format) or the official Discord data export (CSV).

Then run the ingest script:

```bash
# DiscordChatExporter JSON (auto-detected)
npm run ingest -- --input data/raw/export.json --user-id 123456789012345678

# Official Discord CSV
npm run ingest -- --input data/raw/messages.csv --user-id 123456789012345678 --format csv
```

This filters your messages, samples ~500 representative ones, analyzes your style, and writes `data/persona.json`.

### Run

```bash
npm run start
```

The bot will log in and start watching the configured channels.

## Behavior tuning

| Setting | Default | Description |
|---|---|---|
| `replyChance` | 0.85 | Probability of replying to any given message (0-1) |
| `cooldownMs` | 5000 | Minimum time between replies per channel |
| `minDelayMs` / `maxDelayMs` | 1500 / 8000 | Simulated typing delay range |
| `contextMessageCount` | 25 | How many recent messages to include as conversation context |
| `ignoreBots` | true | Ignore messages from other bots (prevents infinite loops) |

## Project structure

```
src/
  index.ts                  # Entry point
  config.ts                 # .env + config.json loading with Zod validation
  ai/
    claude.ts               # Anthropic SDK wrapper
    prompt.ts               # System prompt builder from persona data
    context.ts              # Conversation context from channel history
  discord/
    client.ts               # Discord.js client setup
    handler.ts              # Message handler (core orchestration)
  persona/
    loader.ts               # Load persona.json at startup
    types.ts                # TypeScript types for persona data
  ingest/
    process-export.ts       # CLI: raw Discord export → persona.json
  util/
    rate-limiter.ts         # Per-channel cooldown tracking
```
