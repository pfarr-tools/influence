# Meta token refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist Instagram and Threads OAuth credentials and renew valid long-lived tokens automatically before publication, so routine publishing needs no user interaction.

**Architecture:** Add a small atomic, file-backed token store outside `content/`, then inject it into the Instagram and Threads adapters. Provider-specific OAuth services own exchange/refresh requests; the queue remains responsible only for publishing and retry state. Existing environment tokens bootstrap adapter configuration, while successful OAuth callbacks persist the durable records used for future refreshes.

**Tech Stack:** TypeScript, Node.js `fs/promises`, Vitest, Meta Graph APIs, existing Commander CLI and HTTP review server.

**Spec:** `docs/superpowers/specs/2026-10-12-meta-token-refresh-design.md`

## Global Constraints

- Refresh only Instagram and Threads in this change; do not alter Facebook or Mastodon token semantics.
- Store secrets outside the public frontend and `content/` trees, with file mode `0600` and atomic replacement.
- Never render access tokens in HTML, JSON responses, logs, URLs, or error messages.
- A token that is expired or revoked must produce a reconnect-required publication error; workers must not start an interactive OAuth redirect.
- Preserve all existing uncommitted work and deploy every edit with `rsync -az --exclude='/content/' ./ peregrinus@peregrinus.de:/home/peregrinus/sites/influence/` without `--delete`.
- Use Conventional Commits for any commits created during implementation.

## Review Focus

- A concurrent queue run must issue at most one refresh request per provider and all callers must use the resulting token; test with parallel refresh calls.
- A refresh response without a token or expiry must not overwrite a valid stored credential; test malformed provider responses.
- A failed refresh while the current token is still valid must still allow the publication attempt; test fallback behavior.
- An expired or revoked credential must not leak its value in the reconnect error or callback response; test both paths.
- A token record for Instagram must never be used for Threads, and vice versa; test provider isolation.

### Task 1: Implement the secure token store

**Files:**
- Create: `src/services/publishing/token-store.ts`
- Modify: `src/config/runtime-config.ts`
- Modify: `.gitignore`
- Test: `tests/token-store.test.ts`

**Interfaces:**
- Produces `TokenProvider = "instagram" | "threads"` and `StoredToken` with `accessToken`, provider account identifier, and `expiresAt`.
- Produces `TokenStore.get(provider)`, `TokenStore.save(record)`, and `TokenStore.remove(provider)` using the configured path.

- [ ] **Step 1: Write failing tests** for creating a `0600` store, saving/loading provider-isolated records, atomic replacement, and rejecting malformed records without returning secrets.
- [ ] **Step 2: Run `npm test -- tests/token-store.test.ts`** and confirm failure because the store module does not exist.
- [ ] **Step 3: Implement `TokenStore`** with `mkdir`, same-directory temporary writes, `rename`, restrictive mode, and schema validation. Read failures return no credential; write failures remain explicit.
- [ ] **Step 4: Add `TOKEN_STORE_PATH`** to runtime configuration with default `config/tokens.json`, and ignore that file in Git.
- [ ] **Step 5: Run the focused token-store tests** and confirm all pass.
- [ ] **Step 6: Deploy the edit and commit only this task** with `feat: add persistent Meta token store`.

### Task 2: Add provider-specific token refresh services

**Files:**
- Create: `src/services/publishing/meta-token-refresh.ts`
- Modify: `src/services/publishing/threads-adapter.ts`
- Modify: `src/services/publishing/instagram-adapter.ts`
- Test: `tests/meta-token-refresh.test.ts`

**Interfaces:**
- Consumes `TokenStore` from Task 1.
- Produces `refreshThreadsToken(record)` and `refreshInstagramToken(record)` returning a complete `StoredToken`.
- Produces a per-provider `getOrRefreshToken(provider, currentRecord, now)` operation that shares one in-flight refresh.

- [ ] **Step 1: Write failing tests** for Threads `GET /refresh_access_token?grant_type=th_refresh_token`, Instagram `GET /refresh_access_token?grant_type=ig_refresh_token`, refresh-window decisions, malformed responses, and per-provider in-flight deduplication.
- [ ] **Step 2: Run the focused refresh tests** and confirm the missing refresh functions fail.
- [ ] **Step 3: Implement the refresh service** with a configurable refresh window, expiry arithmetic, strict response validation, and provider-specific endpoints. Do not log request URLs containing tokens.
- [ ] **Step 4: Implement fallback semantics**: if refresh fails but `expiresAt` is still in the future, return the current token; if expired, throw a reconnect-required error without the token value.
- [ ] **Step 5: Run the focused refresh tests** and confirm all pass.
- [ ] **Step 6: Deploy the edit and commit only this task** with `feat: refresh Meta publishing tokens automatically`.

### Task 3: Integrate refresh into Instagram and Threads publishing

**Files:**
- Modify: `src/services/publishing/adapters.ts`
- Modify: `src/services/publishing/instagram-adapter.ts`
- Modify: `src/services/publishing/threads-adapter.ts`
- Modify: `src/services/publishing/types.ts`
- Test: `tests/instagram-adapter.test.ts`
- Test: `tests/threads-adapter.test.ts`

**Interfaces:**
- Adapters receive a token provider/store configuration from `createConfiguredAdapters` and use the refresh service before every API operation.
- The request body/query token must be the refreshed value; publication payload and result contracts stay unchanged.

- [ ] **Step 1: Write failing adapter tests** proving an expiring stored token is refreshed before Instagram media creation and Threads container creation, while a valid token is reused.
- [ ] **Step 2: Run the adapter tests** and confirm they fail because adapters still use static config tokens.
- [ ] **Step 3: Inject shared token state into configured adapters** and replace direct token reads with the refresh service result. Keep story, carousel, polling, and publish calls on the same current token.
- [ ] **Step 4: Add tests** for refresh failure with still-valid fallback and expired-token reconnect errors, asserting the secret is absent from thrown messages.
- [ ] **Step 5: Run Instagram, Threads, refresh, and existing adapter tests** and confirm all pass.
- [ ] **Step 6: Deploy the edit and commit only this task** with `feat: use refreshed tokens for Meta publishing`.

### Task 4: Persist Instagram and Threads OAuth callback results and remove secret disclosure

**Files:**
- Modify: `src/services/publishing/threads-adapter.ts`
- Modify: `src/services/publishing/instagram-adapter.ts` if its OAuth service is added here
- Modify: `src/services/review/server/routes/review-routes.ts`
- Modify: `src/index.ts`
- Test: `tests/review-api-routes.test.ts`
- Test: `tests/threads-adapter.test.ts`

**Interfaces:**
- OAuth services accept a `TokenStore` and persist successful authorization results, including account/user ID and absolute expiry.
- Callback HTML contains only success/failure status, provider/account identifier, expiry, and reconnect instructions; never token text.

- [ ] **Step 1: Write failing callback tests** that complete Threads OAuth and assert the token is persisted while the response does not contain it. Add the equivalent Instagram flow if the current API mode requires a separate callback.
- [ ] **Step 2: Run the callback tests** and confirm they fail because callbacks currently render tokens and do not write a store record.
- [ ] **Step 3: Persist callback results** and wire the same token-store path into review-server dependencies and configured adapters.
- [ ] **Step 4: Replace token-bearing HTML** with a generic success message and safe expiry/account data. Ensure callback errors remain actionable without exposing credentials.
- [ ] **Step 5: Run focused route/OAuth tests and typecheck** and confirm all pass.
- [ ] **Step 6: Deploy the edit and commit only this task** with `fix: persist OAuth credentials without exposing tokens`.

### Task 5: Make reconnect failures operationally clear and verify the branch

**Files:**
- Modify: `src/services/publishing/publishing-service.ts` only if queue error classification needs a targeted change
- Modify: `src/services/review/server/view-models/review-view-models.ts` only if the existing queue error display truncates or hides the safe reconnect notice
- Modify: `README.md` and `config/.env.example` with setup/refresh requirements
- Test: `tests/publishing-service.test.ts` or the closest existing publication-service test file

**Interfaces:**
- Existing queue retry behavior remains intact; reconnect-required errors are safe for the queue UI and logs.
- Documentation states that the first authorization is manual and later valid-token refreshes are automatic.

- [ ] **Step 1: Write a failing publication test** for an expired Meta token: the job becomes retryable/failed according to current policy and the stored secret is absent from `lastError`.
- [ ] **Step 2: Implement only the necessary error classification or UI/documentation changes.** Do not add automatic browser redirects to cron or workers.
- [ ] **Step 3: Run the focused publication test** and confirm it passes.
- [ ] **Step 4: Run the full verification set:** `npm test`, `npm run typecheck`, `npm run review:frontend:build`, and `git diff --check`.
- [ ] **Step 5: Inspect `git status` and deploy the final branch** with the required `rsync` command. Report any pre-existing unrelated test failures separately.
- [ ] **Step 6: Commit the documentation/operational changes** with `docs: document automatic Meta token refresh`.
