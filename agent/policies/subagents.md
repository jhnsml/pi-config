# Parent dispatch and fallback

## When to read

Read before dispatching a Herdr subagent, choosing its model/thinking, or recovering a failed child. This is parent-side guidance, not extension configuration. Leaf agents keep their spawning restrictions.

## Dispatch

1. Use only the roles the task needs. Scout finds code; context-builder connects requirements to code/checks; researcher finds outside facts; planner settles decisions; worker implements; reviewer checks. Small tasks do not require a six-agent pipeline.
2. Give each child its goal, cwd, scope and non-goals, approved decisions, allowed writes, acceptance checks, relevant evidence paths, and output path when an artifact is needed. Fresh-context children need a self-contained brief. Keep independent reviewers supplied with requirements and diff scope rather than the worker's conclusions.
3. Keep one writer per worktree. Delegate independent read-only work in parallel when it helps. Planning and research may write only their assigned artifacts or authorized tracker records.
4. Check exact model IDs and supported thinking levels in the live authenticated catalog. Use the role's default unless the task warrants an override. When changing models, choose thinking for the new model explicitly; an old model's effort label is not a quality guarantee. Check required text/image support and context capacity too.
5. Herdr delivers child results automatically. After spawning, do independent work or end the turn. Do not poll session files, status tools, or logs for completion. If Herdr is unavailable, report that and do authorized work directly; do not pretend a child ran.

## Thinking: quality first

Current role defaults intentionally remain conservative. Do not lower effort merely to reduce usage. A successful launch proves compatibility, not quality; evaluate accepted correctness, completeness, and regressions before adopting a lower default.

| Model | Role/default | Task-specific adjustment | Basis |
| --- | --- | --- | --- |
| `opencode-go/deepseek-v4-flash` | Scout, context-builder: `high` | Consider `max` for unusually difficult analysis if supported and justified by the task | DeepSeek documents `high` as its default for V4 Flash/Pro; `medium` and `xhigh` map to high on its API. Local provider mapping must still be checked. |
| `opencode-go/grok-4.6` | Worker: `high` | Consider `xhigh` for the hardest debugging/security/concurrency problems | xAI documents high as default and xhigh for hardest problems where quality outweighs latency. |
| `openai-codex/gpt-5.6-sol` | Planner, researcher, reviewer: `high` | `medium` is an option for clearly bounded ordinary work; consider `xhigh` for unusually difficult decisions or review | OpenAI documents medium as API default. Keeping high for these roles is a conservative local choice, not a provider claim that all agent work requires high. No local quality comparison justifies lowering these defaults yet. |

Sources: [DeepSeek thinking](https://api-docs.deepseek.com/guides/thinking_mode), [xAI reasoning](https://docs.x.ai/developers/model-capabilities/text/reasoning), [Sol model reference](https://developers.openai.com/api/docs/models/gpt-5.6-sol), and `/Users/yhn/.pi/agent/research/model-thinking-recommendations.md` for prior research and its limitations. Provider API recommendations do not establish identical subscription-provider behavior. For other models, check their own guidance and live compatibility; do not reuse this table by model-family analogy.

## Parent-managed fallback

### Approved backups

No standing backup model order has been approved yet. Use an order explicitly approved by the user for this session or role; otherwise propose an exact model + thinking pair and ask before switching. Being enabled/authenticated is not approval for fallback or extra API billing. Record session-specific approvals in the task handoff, not durable memory.

### Recovery

1. Read the delivered failure. Distinguish an explicit exhausted quota from temporary rate limits, outages, bad credentials, invalid configuration, and code/test failures. Allow bounded transient retry; do not model-hop to hide a task failure. An ambiguous error needs diagnosis, not an assumed quota failure.
2. Check the old child's delivered lifecycle state. Before replacing a writer, establish that it cannot continue writing, including commands it launched. Escape/interruption alone is not proof: it leaves the child session alive. If ownership is uncertain, pause and ask for the old writer to be stopped; never launch a concurrent replacement writer.
3. After failure delivery, read the previous session/artifacts as recovery evidence, not as a completion poll. Inspect current worktree state and completed edits. Carry forward the approved task, files already changed, checks run, failures, remaining work, and uncertain external actions. If completion of an external action is unclear, verify it before any replay.
4. Select the next untried approved backup with the required capabilities and its own thinking setting. Prefer a known separate quota pool. Two model names, or even two provider routes, do not prove independent quotas. Announce the old/new model, reason, and effort; never enable unapproved paid billing.
5. The installed `subagent_resume` tool has no model/thinking override. Use a new `subagent` spawn with explicit model/thinking, the same role/cwd, and the recovered brief. This is a replacement, not seamless cross-model resume. Require it to check current files before continuing. Preserve planner interactivity and the reviewer’s independent review requirements.
6. Track attempted backups for the task. Stop when the approved list is exhausted, state is unsafe to recover, or no capable model is available. Report partial work and the decision needed. The parent must remain usable; if it also hits its limit, the user must switch its model or wait.

## Finish

Check the child's result against its acceptance criteria and evidence. Keep `complete`, `partial`, and `blocked` distinct. Route code reviews through the reviewer using `open-code-review-delegate` in every repository; purely textual reviews are exempt. Missing OCR is a blocker to report, not a silent fallback. Commit/publish only with authorization.
