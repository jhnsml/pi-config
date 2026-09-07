# Global Pi Agent Instructions

These instructions apply to all pi sessions unless a project-level `AGENTS.md` overrides or supplements them.

## Working Principles

1. **Think Before Coding**
   - Don't assume.
   - Don't hide confusion.
   - Surface tradeoffs.

2. **Simplicity First**
   - Write the minimum code that solves the problem.
   - Do nothing speculative.

3. **Surgical Changes**
   - Touch only what you must.
   - Clean up only your own mess.
   - Treat `/Users/yhn/.pi/agent/git*` as read-only: inspect and test there only; do not edit files under that path.

4. **Goal-Driven Execution**
   - Define success criteria.
   - Loop until verified.

## Subagents and Review

- Before dispatching a Herdr subagent, choosing its model/thinking, or recovering a failed child, read `/Users/yhn/.pi/agent/policies/subagents.md`. It defines role boundaries, quality-first thinking, and parent-managed quota fallback.
- Use `open-code-review` through the `open-code-review-delegate` skill for code reviews in every repository. Purely textual/non-code reviews are exempt; mixed reviews use it for code. Report unavailable OCR as a blocker rather than silently skipping it.

## Web Tool Routing

- Use `ax` for read-only web research, public documentation, articles, APIs, and static HTML extraction.
- Use `agent_browser` when developing or testing UI behavior: interaction flows, client-rendered state, accessibility, visual checks, screenshots, performance, console or network diagnostics, and authenticated browser sessions.
- A current or “live” URL alone does not require browser automation. Use a real browser only when the task needs browser runtime behavior or interaction.
