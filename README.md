# pi-config

Version-controlled configuration for [pi](https://pi.dev), the coding agent. This repository is the contents of `~/.pi`, minus secrets, sessions, memory stores, logs, caches, and large regenerable artifacts.

## Layout

- `agent/AGENTS.md` — global agent instructions
- `agent/settings.json` — pi settings: models, packages, subagent model defaults live in `agent/pi-herdr-subagents.config.json` (see below)
- `agent/models.json` — custom provider/model definitions (API keys via env vars)
- `agent/mcp.json` — MCP servers (tokens via env vars)
- `agent/plannotator.json`, `agent/hermes-memory-config.json` — extension configs
- `agent/agents/` — global subagent definitions (pi-herdr-subagents frontmatter)
- `agent/extensions/` — local extensions (bash-tools, guardrails, herdr integration)
- `agent/skills/` — global skills
- `agent/npm/package.json` + `package-lock.json` — installed pi packages (node_modules excluded)
- `agent/pi-herdr-subagents.config.json` — model defaults for pi-herdr-subagents (symlinked into the package dir, see below)

## Deliberately excluded (see `.gitignore`)

- `agent/auth.json`, `agent/models-store.json` — credentials / provider state
- `agent/sessions/`, `agent/projects-memory/`, `agent/pi-hermes-memory/`, `agent/usage-data/`, `*.sqlite`, `run-history.jsonl`, `interview-sessions.json`, `pi-acp/`, `.pi-subagents/` — sessions, memory, logs, databases
- `agent/trust.json`, `agent/mcp-onboarding.json`, `agent/mcp-cache.json`, `agent/migration-backups/` — machine-local state with absolute paths
- `agent/npm/node_modules/`, `agent/git/`, `models/` — large, regenerable (npm install / pi package sync / voice model download)

## Restore on a new machine

1. Clone to `~/.pi`
2. `cd ~/.pi/agent/npm && npm install` (or let pi sync packages from `settings.json`)
3. Recreate the pi-herdr-subagents config symlink:
   ```bash
   ln -sf ../../../pi-herdr-subagents.config.json \
     ~/.pi/agent/npm/node_modules/pi-herdr-subagents/config.json
   ```
4. Set env vars referenced by configs (e.g. `DEEPSEEK_API_KEY`, `OAK_TOKEN`, `STITCH_API_KEY`)
5. Log in with `pi` auth flows as needed (auth.json is not committed)

## Notes

- Subagents run via `pi-herdr-subagents` inside [herdr](https://herdr.dev) (`HERDR_ENV=1`). `pi-subagents` is deprecated/removed; its model config was migrated to `agent/pi-herdr-subagents.config.json`. Fields with no equivalent (fallbackModels, watchdog, oracle/delegate overrides) were dropped.
- `agent/skills/` contains symlinks into `~/.agents/skills/` — that directory is a separate prerequisite and not part of this repo.
- `web_search` (pi-web-access) is disabled for subagents: pi-herdr-subagents has no per-subagent extension loading, and `pi-web-access` is configured with `"extensions": []`. Researcher/context-builder agents rely on `ax` instead.
