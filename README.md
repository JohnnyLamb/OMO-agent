# OMO Agent

A minimal, soulful AI coding assistant built on the ChatGPT Codex API.

## Core Features

- **Identity System:** Configurable personality via `IDENTITY.md`, `SOUL.md`, and `USER.md`.
- **Memory:** Automatic daily logs (`memory/YYYY-MM-DD.md`) and curated long-term memory (`MEMORY.md`).
- **Independent Auth:** Custom OAuth flow for ChatGPT subscription (no API keys needed).
- **Tooling:** Read/Write/Edit files, run Bash commands.
- **Aesthetics:** Clean terminal UI with streaming, spinners, and markdown rendering.

## Setup

1. Clone the repo
2. `npm install`
3. `npm run dev`
4. Login via browser when prompted

## Project Structure

- `src/agent.ts`: Core logic (API, streaming, system prompt)
- `src/auth.ts`: OAuth and token management
- `src/tools/`: File and shell tools
- `brain/`: Knowledge artifacts (implementation plans, etc.)

## Credits

Built with love by J.A. Lamb & Omo.
