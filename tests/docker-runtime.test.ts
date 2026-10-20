import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Docker runtime image", () => {
  it("defines the Node 24 Debian runtime and required media dependencies", () => {
    const dockerfile = readFileSync(`${root}/Dockerfile`, "utf8");

    expect(dockerfile).toMatch(/^FROM node:24-bookworm/m);
    expect(dockerfile).toMatch(/chromium/);
    expect(dockerfile).toMatch(/ffmpeg/);
    expect(dockerfile).toMatch(/fonts-/);
    expect(dockerfile).toMatch(/ARG UID/);
    expect(dockerfile).toMatch(/ARG GID/);
    expect(dockerfile).toMatch(/npm ci/);
    expect(dockerfile).toMatch(/WORKDIR \/app/);
    expect(dockerfile).not.toMatch(/COPY content/);
  });

  it("keeps content, configuration, dependencies, and runtime secrets out of the image context", () => {
    const dockerignore = readFileSync(`${root}/.dockerignore`, "utf8");

    expect(dockerignore).toMatch(/^content\/$/m);
    expect(dockerignore).toMatch(/^config\/\.env$/m);
    expect(dockerignore).toMatch(/^node_modules\/$/m);
    expect(dockerignore).toMatch(/^influence-runtime\/$/m);
  });
});

describe("Compose runtime", () => {
  it("has not been added before the Compose task", () => {
    expect(existsSync(`${root}/compose.yaml`)).toBe(false);
  });
});
