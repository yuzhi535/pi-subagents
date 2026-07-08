import { readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { shouldContinueContext, writeContinuationHandoff } from "./continuation.ts";

const COMMAND = "__auto-continue";

interface MinimalContextUsage {
	tokens?: number;
	contextWindow?: number;
	percent?: number | null;
}

interface MainContinuationState {
	triggered: boolean;
	count: number;
}

const state: MainContinuationState = { triggered: false, count: 0 };

function getUsage(ctx: unknown): MinimalContextUsage | null {
	const fn = (ctx as { getContextUsage?: () => MinimalContextUsage | null | undefined }).getContextUsage;
	if (typeof fn !== "function") return null;
	return fn.call(ctx) ?? null;
}

function getUsageTokens(usage: MinimalContextUsage | null): number | undefined {
	if (typeof usage?.tokens === "number") return usage.tokens;
	if (typeof usage?.percent === "number" && typeof usage?.contextWindow === "number") {
		return (usage.percent / 100) * usage.contextWindow;
	}
	return undefined;
}

export function resetMainContinuationForTest(): void {
	state.triggered = false;
	state.count = 0;
}

export function registerMainContinuation(pi: ExtensionAPI): void {
	pi.registerCommand(COMMAND, {
		description: "Internal auto-continuation handoff command",
		handler: async (args: string, ctx: unknown) => {
			const handoffPath = args.trim();
			if (!handoffPath) return;
			const handoff = readFileSync(handoffPath, "utf8");
			const commandCtx = ctx as {
				newSession?: (options: {
					parentSession?: string | null;
					setup?: (sessionManager: { appendMessage: (message: unknown) => void }) => void | Promise<void>;
					withSession?: (nextCtx: { sendUserMessage: (content: string) => Promise<void> | void }) => Promise<void> | void;
				}) => Promise<{ cancelled?: boolean }>;
				sessionManager?: { getSessionFile?: () => string | null | undefined };
				ui?: { notify?: (message: string, level?: string) => void };
			};
			if (typeof commandCtx.newSession !== "function") {
				commandCtx.ui?.notify?.(`Auto-continuation handoff written: ${handoffPath}`, "info");
				return;
			}
			await commandCtx.newSession({
				parentSession: commandCtx.sessionManager?.getSessionFile?.() ?? null,
				setup: (sessionManager) => {
					sessionManager.appendMessage({
						role: "user",
						content: [{ type: "text", text: handoff }],
						timestamp: Date.now(),
					});
				},
				withSession: async (nextCtx) => {
					await nextCtx.sendUserMessage("Continue the previous task from the auto-continuation handoff.");
				},
			});
		},
	});

	pi.on("agent_end", (_event, ctx) => {
		const usage = getUsage(ctx);
		const contextTokens = getUsageTokens(usage);
		const decision = shouldContinueContext({
			contextTokens,
			contextWindow: usage?.contextWindow,
			continuationCount: state.count,
			alreadyTriggered: state.triggered,
		});
		if (!decision.shouldContinue) return;
		state.triggered = true;
		state.count += 1;
		const handoffPath = writeContinuationHandoff({
			kind: "main",
			name: "main-pi",
			lastOutput: "Main Pi context crossed the auto-continuation threshold. Continue from the current session state and recent conversation.",
			contextTokens,
			contextWindow: usage?.contextWindow,
		});
		pi.sendUserMessage(`/${COMMAND} ${handoffPath}`, { deliverAs: "followUp" });
	});

	pi.on("input", () => {
		state.triggered = false;
		return { action: "continue" as const };
	});
}
