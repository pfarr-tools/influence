# Meta token refresh for Instagram and Threads

## Goal

Influence should renew Instagram and Threads access tokens automatically during normal publishing, without requiring the user to copy tokens into `config/.env` or restart the application after each renewal.

An already expired or revoked token still requires one manual OAuth authorization. This is a provider constraint and cannot be replaced by a refresh request.

## Current root cause

The configured adapters read `INSTAGRAM_ACCESS_TOKEN` and `THREADS_ACCESS_TOKEN` once from the process environment. The existing OAuth callbacks display newly issued tokens as HTML and instruct the user to write them to `config/.env` and restart Influence. No token value or expiry is persisted by the application, so adapters cannot refresh or survive token rotation.

## Design

### Token store

Add a small server-side token store outside the public frontend and content trees, configurable through an environment variable and defaulting to a gitignored runtime file next to the server configuration. The file is created with mode `0600`; reads and writes are limited to the publishing process. It stores provider, access token, account/user identifiers, and an absolute expiry timestamp, but never exposes token values through review responses, logs, or error messages.

Writes use a temporary file in the same directory followed by an atomic rename. The store supports independent records for Instagram and Threads so rotating one provider cannot overwrite the other.

Existing environment tokens remain supported as bootstrap credentials. On first use, an environment token can be adopted into the store when its expiry is known; OAuth callbacks always write the complete record.

### Refresh lifecycle

Before an Instagram or Threads API operation, the adapter obtains the current token from the store. If it is within the configurable refresh window, it calls the provider's long-lived-token refresh endpoint and atomically persists the returned token and expiry before continuing.

The refresh operation is serialized per provider to prevent concurrent queue workers from rotating the same token simultaneously. If a refresh fails, the current token is used only when it is still valid; otherwise the publication fails with a reconnect-required error that contains no secret.

Threads uses Meta's `th_refresh_token` endpoint. Instagram uses the applicable Meta long-lived-token refresh flow supported by the configured Instagram API mode. The implementation must keep provider-specific endpoint and response parsing in the provider service rather than duplicating it in the queue.

### OAuth callback

The existing Threads callback behavior is changed so successful authorization persists the token record and displays only a success message, account identifier, and expiry information. Instagram receives the same persistent authorization path if its configured API mode requires an OAuth callback.

The callback must not place access tokens in HTML, logs, or URLs. Existing credentials remain valid until replaced by a successful refresh or reauthorization.

### Failure and recovery

Expired, revoked, or invalid tokens cannot be refreshed automatically. The publication job remains retryable/failed according to the existing queue policy, and the error tells the operator to reconnect the affected provider through the existing OAuth start route. No automatic repeated OAuth redirect is attempted from a cron/worker process.

## Testing

- Unit-test token file creation, restrictive permissions, atomic replacement, provider isolation, and absence of secret values in errors/output.
- Test Threads and Instagram refresh requests, expiry-window behavior, response parsing, and reuse of a still-valid token.
- Test concurrent refresh calls share one in-flight refresh per provider.
- Test OAuth callbacks persist credentials without rendering token values.
- Test publishing adapters use the refreshed token and preserve existing publication behavior.
- Run focused tests, the full test suite, typecheck, frontend build, and `git diff --check`.

## Scope boundaries

This change covers Instagram and Threads automatic refresh. Facebook and Mastodon are not refactored into the new lifecycle unless an existing provider-specific flow can be reused without changing their authentication semantics. No secret is migrated into Git or the public `content/` repository.
