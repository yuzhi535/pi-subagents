# Auto Continuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add conservative automatic continuation for main Pi sessions and subagents when context usage approaches the model window.

**Architecture:** Add a focused continuation module for threshold/state/handoff text, then wire it into the subagent watcher and Pi lifecycle hooks. Keep the first version deterministic and bounded: no LLM summarizer dependency, max two continuations, no trigger without known context window.

**Tech Stack:** TypeScript Pi extension, existing pi-subagents runtime, Node fs/path utilities, existing session JSONL helpers.

## Global Constraints

- Modify `/Users/zhouyuxi/code/pi-subagents-dev`, which is loaded by `~/.pi/agent/settings.json`.
- Keep new files focused and under existing source layout ownership.
- Default threshold: 85% of context window.
- Default max continuations: 2 per chain.
- Never trigger when context window is unknown.
- Never trigger twice for the same running process.
- Preserve existing `subagent_resume`, async/background, and result delivery behavior.

---

### Task 1: Continuation core

**Files:**
- Create: `src/runtime/continuation.ts`
- Test: `test/runtime/continuation.test.ts`
- Modify: `test/test.ts`

**Interfaces:**
- Produces: `shouldContinueContext(input): ContinuationDecision`
- Produces: `buildHandoffPrompt(input): string`
- Produces: `buildContinuationTask(input): string`

- [ ] Create `src/runtime/continuation.ts` with threshold/defaults/state helpers.
- [ ] Add tests for below-threshold, above-threshold, unknown window, max count, and duplicate process guard.
- [ ] Export pure helpers only; no process spawning in this task.
- [ ] Run `node --test test/runtime/continuation.test.ts`.

### Task 2: Subagent auto continuation

**Files:**
- Modify: `src/runtime/background-watch.ts`
- Modify: `src/runtime/interactive-watch.ts`
- Modify: `src/runtime/resume-service.ts` or `src/runtime/wiring.ts` if relaunch belongs there
- Modify: `src/types.ts`
- Test: `test/runtime/continuation.test.ts` or new `test/runtime/subagent-continuation.test.ts`

**Interfaces:**
- Consumes: `shouldContinueContext`, `buildHandoffPrompt`, `buildContinuationTask`
- Produces: bounded relaunch behavior for completed/pending subagents

- [ ] Add continuation metadata to `RunningSubagent`: continuation count, trigger flag, original task, original agent params if needed.
- [ ] In watcher polling, compute context ratio from existing `contextTokens`/`modelContextWindow` data.
- [ ] When threshold is crossed, mark trigger flag and send a handoff instruction or stop path.
- [ ] On child completion, if continuation was requested and max count allows, relaunch same agent with handoff + original task.
- [ ] Ensure normal result delivery remains unchanged when continuation is not triggered.
- [ ] Add unit tests for no duplicate relaunch and max continuation cap.

### Task 3: Main Pi continuation hook

**Files:**
- Modify: `src/subagents.ts`
- Create or extend: `src/runtime/main-continuation.ts`
- Test: `test/runtime/main-continuation.test.ts`

**Interfaces:**
- Consumes: `ctx.getContextUsage()`
- Uses: command/session context when available; otherwise notifies or no-ops safely

- [ ] Add lifecycle hook on `turn_end` or `agent_end` to check context usage.
- [ ] If over threshold and under max count, create deterministic handoff text.
- [ ] For command-capable contexts, switch/new session and send a continuation user message.
- [ ] For non-command contexts, insert a visible handoff message instructing manual `/new` continuation.
- [ ] Add tests for threshold/no-threshold/max/no-window behavior.

### Task 4: Config and documentation in prompts

**Files:**
- Modify: `src/runtime/continuation.ts`
- Modify: `src/subagents.ts`
- Modify: `docs/superpowers/specs/2026-07-08-auto-continuation-design.md` if behavior differs

**Interfaces:**
- Env vars: `PI_CONTINUATION_THRESHOLD`, `PI_CONTINUATION_MAX`

- [ ] Read env vars with validation and defaults.
- [ ] Add concise system/tool prompt text only if needed so agents understand handoff output.
- [ ] Keep docs short; no broad README rewrite.

### Task 5: Verification

**Files:**
- No new source unless fixing issues.

- [ ] Run targeted unit tests added above.
- [ ] Run existing `npm test` if dependencies resolve in this checkout.
- [ ] Run a minimal live `pi -p` smoke only if unit tests pass and runtime dependencies are available.
- [ ] Record any baseline failures separately from new failures.
