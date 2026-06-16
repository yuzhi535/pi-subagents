import {
	assert,
	createTestDir,
	describe,
	it,
	join,
} from "../support/index.ts";
import { buildChildLaunchPlan } from "../../src/launch/child-launch-plan.ts";

/**
 * The child launch plan is the foundation seam for agent definition and launch
 * parameter resolution. Callers should not need to re-learn child capability,
 * model, cwd, and session path rules in separate modules.
 */
describe("child launch plan", () => {
	it("resolves model, runtime paths, and child capability facts in one place", async () => {
		const cwd = createTestDir();
		const parentSessionDir = join(cwd, "parent-sessions");

		const plan = await buildChildLaunchPlan({
			params: {
				name: "code-review",
				task: "review the diff",
				title: "Code review",
				agent: "reviewer",
				model: "provider/override:high",
				cwd: "launch-cwd",
			},
			agentDefs: {
				model: "provider/default",
				thinking: "low",
				tools: "read,bash",
				skills: "none",
				extensions: "none",
				denyTools: "bash",
				spawning: false,
				cwd: "agent-cwd",
				cwdBase: cwd,
			},
			parentCwd: cwd,
			parentSessionDir,
			parentModelRef: "provider/parent",
			parentThinking: "medium",
			modelRegistry: {
				getAvailable: () => [
					{
						provider: "provider",
						id: "override",
						thinkingLevelMap: { high: "high" },
					},
				],
			},
		});

		assert.equal(plan.effectiveModel, "provider/override");
		assert.equal(plan.effectiveThinking, "high");
		assert.equal(plan.effectiveModelRef, "provider/override:high");
		assert.equal(plan.runtimePaths.effectiveCwd, join(cwd, "launch-cwd"));
		assert.equal(plan.runtimePaths.targetCwdForSession, join(cwd, "launch-cwd"));
		assert.ok(plan.subagentSessionFile.startsWith(`${parentSessionDir}/`));

		assert.equal(plan.capability.tools, "read,bash");
		assert.equal(plan.capability.skills, "none");
		assert.equal(plan.capability.injectSkills, undefined);
		assert.deepEqual(plan.capability.extensions, []);
		assert.deepEqual([...plan.capability.denySet].sort(), [
			"bash",
			"subagent",
			"subagent_resume",
		]);
		assert.deepEqual(plan.capability.skillLaunchPlan.launchArgs, ["--no-skills"]);
	});

	it("enforces allowed models after resolving bare model ids", async () => {
		const cwd = createTestDir();
		const parentSessionDir = join(cwd, "parent-sessions");

		const plan = await buildChildLaunchPlan({
			params: {
				name: "code-review",
				task: "review the diff",
				title: "Code review",
				agent: "reviewer",
				model: "glm-5.1:high",
			},
			agentDefs: {
				model: "zai-messages/glm-5-turbo:off",
				allowedModels: "zai-messages/glm-5.1:high",
			},
			parentCwd: cwd,
			parentSessionDir,
			parentModelRef: "zai-messages/glm-5-turbo",
			parentThinking: "medium",
			modelRegistry: {
				getAvailable: () => [
					{ provider: "zai-messages", id: "glm-5.1" },
					{ provider: "zai-messages", id: "glm-5-turbo" },
				],
			},
		});

		assert.equal(plan.effectiveModelRef, "zai-messages/glm-5.1:high");

		await assert.rejects(
			() => buildChildLaunchPlan({
				params: {
					name: "code-review",
					task: "review the diff",
					title: "Code review",
					agent: "reviewer",
					model: "glm-5.1",
				},
				agentDefs: {
					allowedModels: "openai-ws/gpt-5.5:low",
				},
				parentCwd: cwd,
				parentSessionDir,
				parentModelRef: "zai-messages/glm-5-turbo",
				parentThinking: "medium",
				modelRegistry: {
					getAvailable: () => [
						{ provider: "zai-messages", id: "glm-5.1" },
						{ provider: "zai-messages", id: "glm-5-turbo" },
					],
				},
			}),
			/Model 'zai-messages\/glm-5\.1:medium' is not allowed for agent 'reviewer'/,
		);
	});

	it("resolves bare agent default models before allowed model checks", async () => {
		const cwd = createTestDir();
		const parentSessionDir = join(cwd, "parent-sessions");

		const plan = await buildChildLaunchPlan({
			params: {
				name: "code-review",
				task: "review the diff",
				title: "Code review",
				agent: "reviewer",
			},
			agentDefs: {
				model: "glm-5.1:high",
				allowedModels: "openai-ws/gpt-5.5:low",
			},
			parentCwd: cwd,
			parentSessionDir,
			parentModelRef: "zai-messages/glm-5-turbo",
			parentThinking: "medium",
			modelRegistry: {
				getAvailable: () => [
					{ provider: "zai-messages", id: "glm-5.1" },
					{ provider: "zai-messages", id: "glm-5-turbo" },
				],
			},
		});

		assert.equal(plan.effectiveModelRef, "zai-messages/glm-5.1:high");
	});

	it("passes bare agent default models through untouched without allowed-models", async () => {
		const cwd = createTestDir();
		const parentSessionDir = join(cwd, "parent-sessions");

		const plan = await buildChildLaunchPlan({
			params: {
				name: "code-review",
				task: "review the diff",
				title: "Code review",
				agent: "reviewer",
			},
			agentDefs: {
				model: "some-bare-model",
			},
			parentCwd: cwd,
			parentSessionDir,
			modelRegistry: {
				getAvailable: () => [
					{ provider: "zai-messages", id: "glm-5.1" },
				],
			},
		});

		assert.equal(plan.effectiveModel, "some-bare-model");
	});

	it("treats allowed model refs without thinking as model-wide entries", async () => {
		const cwd = createTestDir();
		const parentSessionDir = join(cwd, "parent-sessions");
		const base = {
			params: {
				name: "code-review",
				task: "review the diff",
				title: "Code review",
				agent: "reviewer",
				model: "zai-messages/glm-5.1:high",
			},
			parentCwd: cwd,
			parentSessionDir,
		};

		await assert.doesNotReject(() => buildChildLaunchPlan({
			...base,
			agentDefs: { model: "zai-messages/glm-5-turbo:off", allowedModels: "zai-messages/glm-5.1" },
		}));

		await assert.rejects(
			() => buildChildLaunchPlan({
				...base,
				agentDefs: { model: "zai-messages/glm-5-turbo:off", allowedModels: "zai-messages/glm-5.1:low" },
			}),
			/Model 'zai-messages\/glm-5\.1:high' is not allowed for agent 'reviewer'/,
		);
	});

	it("allows the inherited parent model when no agent default is set", async () => {
		const cwd = createTestDir();
		const parentSessionDir = join(cwd, "parent-sessions");

		const plan = await buildChildLaunchPlan({
			params: {
				name: "code-review",
				task: "review the diff",
				title: "Code review",
				agent: "reviewer",
			},
			agentDefs: { allowedModels: "nahcrof/glm-5.1:off" },
			parentCwd: cwd,
			parentSessionDir,
			parentModelRef: "zai-messages/glm-5-turbo",
			parentThinking: "off",
			modelRegistry: {
				getAvailable: () => [
					{ provider: "zai-messages", id: "glm-5-turbo" },
					{ provider: "nahcrof", id: "glm-5.1" },
				],
			},
		});

		assert.equal(plan.effectiveModelRef, "zai-messages/glm-5-turbo:off");
	});
});
