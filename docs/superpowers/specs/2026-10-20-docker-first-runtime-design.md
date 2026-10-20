# Influence Docker-first Runtime Design

## Status

Design approved conversationally; written-spec review required before implementation.

## Goal

Run Influence inside a reproducible Docker environment while keeping a central,
host-accessible `./influence` command that controls both the container lifecycle
and the Influence CLI. The repository remains the source of truth for code,
configuration templates, calendar data, generated content, and deployment.

## Scope assumptions

- Local development and command execution are Docker-first.
- A production Compose configuration is prepared as part of the redesign.
- The existing host-side rsync deployment remains the upload mechanism; it must
  continue to exclude `content/` and must not start or mutate production without
  an explicit operational command.
- Existing CLI commands retain their names and semantics inside the container.

## Proposed architecture

### Host wrapper

Add an executable root-level `./influence` Bash wrapper. It resolves its own
repository root and dispatches:

- lifecycle: `up`, `down`, `restart`, `status|ps`, `logs`
- interactive access: `shell`, `exec`
- development tools: `test`, `typecheck`, `lint`, `npm`
- CLI fallback: all other arguments run `node bin/influence.js ...` in a
  disposable application container
- `compose`: escape hatch for direct Docker Compose operations

The wrapper must fail clearly when Docker or Compose is unavailable and must not
silently execute the application on the host.

### Development Compose

Add `compose.yaml` with one primary `app` service based on a Node 24 Debian
image. The image installs Chromium/Playwright runtime dependencies, ffmpeg,
font packages, and npm dependencies. The repository is bind-mounted at
`/app`; a named volume keeps `/app/node_modules` container-local.

The app service is suitable for one-shot CLI commands and an interactive shell.
Review-server commands use published host ports and bind to `0.0.0.0` inside the
container. Host `content/` and `config/.env` remain bind-mounted and writable.

### Production Compose

Add `compose.production.yaml` using the same application image family without
host source-code bind mounts. It receives configuration through an env file and
uses an explicit persistent content/runtime mount. The production wrapper
commands remain separate from development commands so a normal `./influence up`
cannot accidentally operate on production.

The existing rsync deployment continues to exclude `content/`; production
image rebuild/restart is an explicit wrapper operation and is not implicit in
upload.

### Ownership and secrets

- Build-time dependencies are installed in the image.
- Runtime-generated files are created with the host UID/GID in development.
- API keys stay in the host env file or process environment and are never copied
  into an image layer.
- `content/` remains outside the image and is never baked into production
  images.
- The token store is mounted at a stable container path while retaining its
  existing host persistence boundary.

## Command examples

```text
./influence up -d
./influence status
./influence logs
./influence prayer generate --kind evening
./influence content generate-week --date 2026-10-20
./influence review serve
./influence test
./influence shell
./influence compose config
./influence prod up -d
./influence prod status
./influence prod logs
```

## Compatibility and migration

The existing `bin/influence.js` remains the container entrypoint. The npm `bin`
mapping remains available for users who install dependencies locally, but all
documented project commands move to `./influence`. Existing `config/.env`
variable names remain valid; only path defaults that cross the host/container
boundary are normalized through Compose environment values.

## Verification

Add tests for:

- wrapper help and unknown-command dispatch;
- safe rejection of unsupported lifecycle commands and missing Docker;
- Compose configuration rendering with safe dummy values;
- host UID/GID propagation and content exclusion from build context;
- CLI commands executing in the container rather than on the host;
- review-server port/bind behavior;
- development and production command separation.

Run focused wrapper/static checks, `npm test`, `npm run typecheck`, targeted
lint, and a Docker-enabled smoke test covering `./influence up`, a CLI command,
and `./influence down`.

## Risks and decisions to confirm during implementation

- Chromium and Sharp may require Debian runtime libraries beyond the minimal
  Node image.
- Production persistence and the exact remote Compose invocation must be
  aligned with the public server’s existing deployment directory.
- The wrapper must preserve exit codes and signal handling for one-shot CLI and
  long-running review commands.
