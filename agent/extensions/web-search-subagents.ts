/**
 * web-search-subagents: scoped loader for pi-web-access.
 *
 * pi-web-access is kept disabled globally ("extensions": [] in settings.json
 * packages) so web_search/fetch_content don't pollute every session's tool
 * surface. This wrapper loads it only inside pi-herdr-subagents child
 * sessions spawned for agents that actually do web research.
 *
 * Mechanism: pi-herdr-subagents sets PI_SUBAGENT_AGENT in child sessions it
 * launches. Main sessions and children of other agents return early here,
 * so pi-web-access registers its tools only for the allowlisted agents.
 *
 * Search provider: pi-web-access "auto" — resolves to the openai provider,
 * which authenticates from pi's own openai-codex OAuth store (no API key
 * needed). Set a provider in pi-web-access's own config to override.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import webAccess from "../npm/node_modules/pi-web-access/index.ts";

const ENABLED_AGENTS = new Set(["researcher", "context-builder"]);

export default function (pi: ExtensionAPI) {
  const agent = process.env.PI_SUBAGENT_AGENT;
  if (!agent || !ENABLED_AGENTS.has(agent)) return;
  webAccess(pi);
}
