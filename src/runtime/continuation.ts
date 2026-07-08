import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getArtifactStorageRoot } from "../artifact-storage.ts";

export const DEFAULT_CONTINUATION_THRESHOLD = 0.85;
export const DEFAULT_MAX_CONTINUATIONS = 2;

export interface ContinuationConfig {
	threshold: number;
	maxContinuations: number;
}

export interface ContinuationDecisionInput {
	contextTokens?: number;
	contextWindow?: number;
	continuationCount?: number;
	maxContinuations?: number;
	alreadyTriggered?: boolean;
}

export interface ContinuationDecision {
	shouldContinue: boolean;
	reason: "over-threshold" | "unknown-window" | "below-threshold" | "max-continuations" | "already-triggered";
	ratio?: number;
}

export interface HandoffInput {
	kind: "main" | "subagent";
	name?: string;
	agent?: string;
	task?: string;
	lastOutput?: string;
	contextTokens?: number;
	contextWindow?: number;
}

function parseNumberEnv(name: string, fallback: number): number {
	const raw = process.env[name]?.trim();
	if (!raw) return fallback;
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getContinuationConfig(): ContinuationConfig {
	const threshold = parseNumberEnv("PI_CONTINUATION_THRESHOLD", DEFAULT_CONTINUATION_THRESHOLD);
	const maxContinuations = Math.floor(parseNumberEnv("PI_CONTINUATION_MAX", DEFAULT_MAX_CONTINUATIONS));
	return {
		threshold: Math.min(Math.max(threshold, 0.1), 0.98),
		maxContinuations: Math.max(0, maxContinuations),
	};
}

export function shouldContinueContext(
	input: ContinuationDecisionInput,
	config = getContinuationConfig(),
): ContinuationDecision {
	if (input.alreadyTriggered) return { shouldContinue: false, reason: "already-triggered" };
	const max = input.maxContinuations ?? config.maxContinuations;
	if ((input.continuationCount ?? 0) >= max) return { shouldContinue: false, reason: "max-continuations" };
	if (!input.contextTokens || !input.contextWindow) return { shouldContinue: false, reason: "unknown-window" };
	const ratio = input.contextTokens / input.contextWindow;
	if (ratio >= config.threshold) return { shouldContinue: true, reason: "over-threshold", ratio };
	return { shouldContinue: false, reason: "below-threshold", ratio };
}

function compactText(text: string | undefined, max = 4000): string {
	const trimmed = text?.trim();
	if (!trimmed) return "No recent output captured.";
	return trimmed.length > max ? `${trimmed.slice(0, max)}\n…[truncated]` : trimmed;
}

export function buildHandoffPrompt(input: HandoffInput): string {
	const ratio = input.contextTokens && input.contextWindow
		? `${((input.contextTokens / input.contextWindow) * 100).toFixed(1)}%`
		: "unknown";
	return [
		"## Auto-continuation handoff",
		`Kind: ${input.kind}`,
		input.name ? `Name: ${input.name}` : undefined,
		input.agent ? `Agent: ${input.agent}` : undefined,
		input.task ? `Original task: ${input.task}` : undefined,
		`Context usage: ${ratio}`,
		"",
		"## Recent output",
		compactText(input.lastOutput),
		"",
		"## Continue instructions",
		"Continue the original task from this handoff. Do not repeat completed work. Start by briefly restating the next concrete step, then proceed.",
	].filter((line): line is string => line !== undefined).join("\n");
}

export function buildContinuationTask(input: HandoffInput): string {
	return `${buildHandoffPrompt(input)}\n\nProceed now.`;
}

export function writeContinuationHandoff(input: HandoffInput): string {
	const dir = join(getArtifactStorageRoot(), "continuations");
	mkdirSync(dir, { recursive: true });
	const path = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.md`);
	writeFileSync(path, buildHandoffPrompt(input), "utf8");
	return path;
}
