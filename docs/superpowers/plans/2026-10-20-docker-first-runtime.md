# Docker-first Influence Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Run Influence through a Dockerized Node 24 runtime while exposing a host-level `./influence` command for container lifecycle, development tools, and CLI execution.

**Architecture:** A Debian-based Node 24 application image contains npm dependencies, Chromium/Playwright runtime support, ffmpeg, and fonts. `compose.yaml` provides bind-mounted development execution with host UID/GID propagation; `compose.production.yaml` provides an explicit production path without source-code bind mounts. The root Bash wrapper dispatches lifecycle/tooling commands to Compose and all other arguments to the containerized `bin/influence.js` entrypoint.

**Tech Stack:** Bash, Docker Compose, Node.js 24, npm, TypeScript, Vitest, Playwright/Chromium, Sharp, ffmpeg.

**Spec:** `docs/superpowers/specs/2026-10-20-docker-first-runtime-design.md`

## Global Constraints

- The wrapper must never silently execute the application on the host.
- `content/` remains host-mounted/persistent and is never copied into an image layer.
- Secrets stay in `config/.env` or the process environment and never enter image layers or logs.
- Development-generated files must be owned by the invoking host user.
- Production operations must be explicit and separate from development operations.
- Existing `bin/influence.js` CLI semantics remain unchanged.
- Uploads continue to use `rsync -az --exclude='/content/'`.

## Review Focus

- Docker unavailable: `./influence` exits with a useful error instead of falling back to host Node.
- Host UID/GID differs from 1000: generated files remain writable by the invoking user.
- `config/.env` or token-store paths are absent: Compose reports a clear configuration error without creating secrets.
- Review server binds to `0.0.0.0` inside the container and is reachable through the documented host port.
- Production commands cannot accidentally use the development Compose project or host source bind mounts.

### Task 1: Define the Docker application image

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Modify: `package.json` only if a container-specific script is required
- Test: `tests/docker-runtime.test.ts`

**Interfaces:**
- Produces a `development` image that can run `node bin/influence.js ...` from `/app`.
- Accepts `UID` and `GID` build arguments and runs development commands as that user.

- [ ] **Step 1: Write failing static image tests**

  Add tests asserting that the Dockerfile uses Node 24 Debian, installs Chromium/ffmpeg/font runtime packages, defines UID/GID arguments, and does not copy `content/` into the image. Assert `.dockerignore` excludes `content/`, `config/.env`, `node_modules`, and runtime secrets.

- [ ] **Step 2: Run the focused test and verify it fails**

  Run: `npm test -- --run tests/docker-runtime.test.ts`

  Expected: FAIL because the Dockerfile and `.dockerignore` do not exist.

- [ ] **Step 3: Implement the image**

  Use a Node 24 bookworm base, install the packages required by Playwright/Chromium, Sharp, and ffmpeg, copy only package manifests before `npm ci`, then copy source files. Keep the runtime working directory `/app`, expose no application port by default, and avoid embedding `content/` or env files.

- [ ] **Step 4: Run static tests and typecheck**

  Run: `npm test -- --run tests/docker-runtime.test.ts && npm run typecheck`

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add Dockerfile .dockerignore tests/docker-runtime.test.ts package.json package-lock.json
  git commit -m "feat: add docker runtime image"
  ```

### Task 2: Add development Compose services and runtime paths

**Files:**
- Create: `compose.yaml`
- Modify: `config/.env.example`
- Test: `tests/docker-runtime.test.ts`

**Interfaces:**
- Provides service `app` with `/app` source bind mount and a named `/app/node_modules` volume.
- Provides `CONTENT_CALENDAR_PATH`, `OUTPUT_DIR`, `TOKEN_STORE_PATH`, `UID`, and `GID` as explicit container paths/environment values.

- [ ] **Step 1: Extend failing Compose tests**

  Assert that `docker compose -f compose.yaml config` can render with safe dummy values, that the app service mounts the repository and keeps `content/` external to the image, and that UID/GID are passed through.

- [ ] **Step 2: Run the Compose test and verify it fails**

  Run: `npm test -- --run tests/docker-runtime.test.ts`

  Expected: FAIL because `compose.yaml` does not exist.

- [ ] **Step 3: Implement development Compose**

  Define a project name, build target, `/app` working directory, env-file handling, source bind mount, node_modules volume, and optional review-server port mapping. Use an idle app command for lifecycle control; one-shot CLI commands will use `docker compose run --rm`.

- [ ] **Step 4: Verify Compose rendering**

  Run: `docker compose -f compose.yaml config`

  Expected: exit 0 with no missing-variable errors when safe dummy values are supplied.

- [ ] **Step 5: Commit**

  ```bash
  git add compose.yaml config/.env.example tests/docker-runtime.test.ts
  git commit -m "feat: add development compose runtime"
  ```

### Task 3: Add the host control wrapper

**Files:**
- Create: `./influence`
- Test: `tests/influence-wrapper.test.ts`

**Interfaces:**
- `./influence up|down|restart|status|ps|logs` maps to Compose lifecycle commands.
- `./influence shell` opens an app shell; `exec` passes a service and command through.
- `./influence test|typecheck|lint|npm ...` executes tools inside the app container.
- Any other arguments execute `node bin/influence.js ...` through `docker compose run --rm app`.
- `./influence compose ...` passes commands directly to Compose.

- [ ] **Step 1: Write failing wrapper tests**

  Test the script text and command routing with a temporary fake `docker` executable. Assert CLI arguments are preserved, Docker failure exits nonzero, no host `node`/`npm` command is invoked, and the review server receives a container-reachable bind address.

- [ ] **Step 2: Run the focused test and verify it fails**

  Run: `npm test -- --run tests/influence-wrapper.test.ts`

  Expected: FAIL because `./influence` does not exist.

- [ ] **Step 3: Implement the wrapper**

  Resolve `ROOT` from `BASH_SOURCE`, use `set -euo pipefail`, centralize the Compose command, preserve exit codes with `exec`, and emit concise help/error output. Unknown commands must dispatch to the containerized CLI entrypoint.

- [ ] **Step 4: Verify wrapper behavior**

  Run: `npm test -- --run tests/influence-wrapper.test.ts && ./influence --help`

  Expected: static routing tests pass; `./influence --help` reaches the container path when Docker is available, otherwise reports the Docker prerequisite.

- [ ] **Step 5: Commit**

  ```bash
  git add influence tests/influence-wrapper.test.ts
  git commit -m "feat: add docker control wrapper"
  ```

### Task 4: Add explicit production Compose operations

**Files:**
- Create: `compose.production.yaml`
- Modify: `./influence`
- Modify: `config/.env.example`
- Test: `tests/docker-runtime.test.ts`

**Interfaces:**
- `./influence prod up|down|restart|status|logs|exec` uses only `compose.production.yaml`.
- Production does not bind-mount source code or `content/` into the image.
- Production content/runtime persistence is provided through explicitly named mounts.

- [ ] **Step 1: Write failing production separation tests**

  Assert production commands select the production Compose file, reject development-only commands under `prod`, and contain no source-code bind mount.

- [ ] **Step 2: Run the tests and verify they fail**

  Run: `npm test -- --run tests/docker-runtime.test.ts tests/influence-wrapper.test.ts`

  Expected: FAIL because the production Compose file and routing do not exist.

- [ ] **Step 3: Implement production Compose and wrapper routing**

  Use the same image family with an explicit production service and persistent runtime/content mount. Keep production configuration supplied by env files/process environment. Do not add automatic deployment, `git pull`, destructive volume removal, or implicit restart behavior.

- [ ] **Step 4: Verify production configuration**

  Run: `docker compose -f compose.production.yaml config` with safe dummy values and run the production wrapper routing tests.

  Expected: exit 0 and all routing assertions pass.

- [ ] **Step 5: Commit**

  ```bash
  git add compose.production.yaml influence config/.env.example tests/docker-runtime.test.ts tests/influence-wrapper.test.ts
  git commit -m "feat: separate production compose operations"
  ```

### Task 5: Update documentation and perform Docker smoke verification

**Files:**
- Modify: `README.md`
- Modify: `docs/CLI.md`
- Modify: `docs/Admin.md`
- Modify: `build/ARCHITECTURE.md`

**Interfaces:**
- Documentation presents `./influence` as the canonical entrypoint and explains host persistence, env files, ports, and dev/prod separation.

- [ ] **Step 1: Document the Docker-first workflow**

  Replace host-Node installation instructions with Docker-first commands while documenting the optional direct npm path as secondary. Include `./influence up -d`, CLI pass-through, review-server access, tests, shell access, and explicit production commands.

- [ ] **Step 2: Run the complete verification suite**

  Run: `npm test && npm run typecheck && npm run lint && docker compose -f compose.yaml config && docker compose -f compose.production.yaml config`

  Expected: project tests and typecheck pass; any pre-existing full-lint/fixture failures are reported with exact output; both Compose files render successfully.

- [ ] **Step 3: Run the Docker smoke test**

  Run: `./influence build` or the documented image-build command, `./influence up -d`, a harmless CLI command such as `./influence calendar validate content/content-plan.json`, then `./influence down`.

  Expected: the command runs inside the container, reads host-mounted content, writes no root-owned files, and shutdown completes cleanly.

- [ ] **Step 4: Commit**

  ```bash
  git add README.md docs/CLI.md docs/Admin.md build/ARCHITECTURE.md
  git commit -m "docs: document docker-first influence workflow"
  ```

- [ ] **Step 5: Final integration verification**

  Run `git status --short`, inspect the final commit list, rerun the focused wrapper/Compose tests, and confirm the upload command continues to exclude `/content/`.

