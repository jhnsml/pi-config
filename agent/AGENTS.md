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

4. **Goal-Driven Execution**
   - Define success criteria.
   - Loop until verified.

## Subagents and Review

- Before dispatching a Herdr subagent, choosing its model/thinking, or recovering a failed child, read `/Users/yhn/.pi/agent/policies/subagents.md`. It defines role boundaries, quality-first thinking, and parent-managed quota fallback.
- Use `open-code-review` through the `open-code-review-delegate` skill for code reviews in every repository. Purely textual/non-code reviews are exempt; mixed reviews use it for code. Report unavailable OCR as a blocker rather than silently skipping it.
