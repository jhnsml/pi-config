# pi-config

Opinionated, version-controlled configuration for [Pi](https://pi.dev). The repository contains portable configuration and extension manifests; credentials, sessions, memory stores, logs, caches, and downloaded artifacts stay local.

This is a starter configuration, not a zero-dependency preset. Review `agent/settings.json` and `agent/mcp.json` before adopting it: the selected models, editor, MCP servers, and optional extensions reflect this setup.

## Layout

- `agent/AGENTS.md` — global agent instructions.
- `agent/settings.json` — Pi preferences, model defaults, and pinned packages.
- `agent/mcp.json` — lazy MCP servers and host-config imports; credentials use environment variables.
- `agent/plannotator.json` and `agent/hermes-memory-config.json` — extension-specific settings.
- `agent/agents/` — global definitions for `pi-herdr-subagents`.
- `agent/extensions/guardrails.json` — shared safety policy.
- `agent/npm/package.json` and `package-lock.json` — reproducible npm package installation; `node_modules` is excluded.

There is intentionally no `agent/models.json`. Pi already provides the enabled OpenAI Codex and OpenCode Go model catalogs. Add `models.json` only for a custom provider, proxy, local model server, or built-in model override.

Global skills are loaded from `~/.agents/skills`, which is a separate prerequisite and is not copied by this repository.

## Install on a new machine

1. Install Pi, Node.js/npm, [Herdr](https://herdr.dev), and the [`ax` CLI](https://github.com/yusukebe/ax/releases) v0.1.23 or newer. The `pi-ax` package registers the native Pi tool, but delegates execution to this CLI.
2. Clone this repository to `~/.pi`. If `~/.pi` already exists, back it up and merge the reviewed files instead of overwriting it.
3. Install Herdr's generated Pi integration:

   ```bash
   herdr integration install pi
   ```
4. Install the locked npm dependencies:

   ```bash
   npm install --prefix ~/.pi/agent/npm --legacy-peer-deps
   ```

   Pi can also install the packages listed in `agent/settings.json` on startup after the configuration is trusted.
5. Authenticate the configured providers. The default requires ChatGPT/Codex login; the OpenCode Go entries require its provider credential.
6. Set any MCP credentials you intend to use: `OAK_TOKEN`, `DELPHI_API_KEY`, and `STITCH_API_KEY`. Remove unavailable servers and unnecessary compatibility imports from `agent/mcp.json`.
7. Install the skills you want under `~/.agents/skills`, or remove that path from `agent/settings.json`.
8. Start Pi inside Herdr:

   ```bash
   herdr
   pi
   ```

## Machine-specific choices

- `externalEditor` is `zed --wait`; change or remove it if Zed is unavailable.
- Local voice transcription uses the regenerable `parakeet-v3` download.
- `paper` expects a local MCP server at `127.0.0.1:29979`.
- The agent definitions use exact model IDs and may require both OpenAI Codex and OpenCode Go authentication.
- Git packages are pinned to commits for reproducible installs. Update those refs deliberately.

## Deliberately excluded

See `.gitignore`. Important exclusions include:

- credentials and provider state: `agent/auth.json`, `agent/models-store.json`;
- sessions, memory, usage data, logs, SQLite databases, and interview state;
- trust decisions, MCP cache/onboarding state, and migration backups;
- `node_modules`, Pi-managed Git checkouts, and downloaded voice models.

Never commit `agent/auth.json` or replace environment references in `agent/mcp.json` with literal tokens.
