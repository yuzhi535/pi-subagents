# Auto continuation design

## Goal
Add automatic continuation for both main Pi sessions and subagents when context gets too full.

## Scope
- Main Pi: detect high context usage, write a handoff summary, start a new session, and continue from that summary.
- Subagents: detect high child context usage, request a handoff, stop the child, then relaunch the same agent with the summary and original task.
- Keep the first version conservative and opt-in/configurable.

## Approach
Create a small continuation module with:
- threshold config: default 85% context usage
- max continuations: default 2 per chain
- handoff artifact path under the existing subagent artifact root
- summary format: goal, progress, files touched/read, next step, risks

## Main Pi flow
1. On turn boundaries, check `ctx.getContextUsage()`.
2. If usage is over threshold and continuation limit is not reached, create a handoff summary.
3. Open a new session with the summary as setup context.
4. Send a user message asking Pi to continue from the handoff.

## Subagent flow
1. Watchers already poll child session files and model context windows.
2. If a running child exceeds threshold, send it a concise handoff/finish instruction.
3. When it exits, extract the handoff or latest output.
4. Relaunch the same agent/mode/model with original task plus handoff.
5. Preserve async/background behavior and avoid duplicate result delivery.

## Safety
- Default max continuation count: 2.
- Never trigger if no model context window is known.
- Never trigger twice for the same running process.
- If handoff fails, return the normal failure/result instead of looping.

## Tests
- Unit tests for threshold decisions and max-continuation state.
- Unit tests for subagent relaunch prompt construction.
- Existing subagent tests must still pass.
