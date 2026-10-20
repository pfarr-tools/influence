import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runWrapper(...args: string[]) {
	const directory = mkdtempSync(join(tmpdir(), "influence-wrapper-"));
	const log = join(directory, "docker.log");
	const docker = join(directory, "docker");
	writeFileSync(
		docker,
		`#!/bin/sh\nprintf '%s\\n' "$@" > "${log}"\n`,
	);
	chmodSync(docker, 0o755);

	const result = spawnSync("./influence", args, {
		cwd: process.cwd(),
		env: { ...process.env, DOCKER_BIN: docker },
		encoding: "utf8",
	});

	return { result, invocation: readFileSync(log, "utf8").trim().split("\n") };
}

describe("host influence wrapper", () => {
	it("routes application arguments to the container CLI", () => {
		const { result, invocation } = runWrapper("calendar", "validate", "content/content-plan.json");

		expect(result.status).toBe(0);
		expect(invocation).toEqual([
			"compose",
			"-f",
			"compose.yaml",
			"run",
			"--rm",
			"--no-deps",
			"app",
			"node",
			"bin/influence.js",
			"calendar",
			"validate",
			"content/content-plan.json",
		]);
	});

	it("routes review serving with a container-reachable bind address", () => {
		const { invocation } = runWrapper("review", "serve");

		expect(invocation).toContain("--host");
		expect(invocation).toContain("0.0.0.0");
	});

	it("never falls back to host npm for project tooling", () => {
		const { invocation } = runWrapper("typecheck");

		expect(invocation).toEqual([
			"compose",
			"-f",
			"compose.yaml",
			"run",
			"--rm",
			"--no-deps",
			"app",
			"npm",
			"run",
			"typecheck",
		]);
	});
});
