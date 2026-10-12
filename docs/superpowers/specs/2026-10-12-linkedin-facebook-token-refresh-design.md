# LinkedIn and Facebook Token Lifecycle Design

## Goal

Influence must recover from normal LinkedIn and Facebook access-token expiry without manual token copying or editing `config/.env`. A one-time OAuth connection seeds durable credentials; scheduled publishing refreshes credentials before expiry and falls back to a reconnect flow when the provider has revoked or cannot refresh them.

## Scope

This change covers only LinkedIn and Facebook. Instagram and Threads already use the existing Meta token store and refresh service and are not refactored except where shared credential interfaces are required.

The following provider behaviors are supported:

- LinkedIn stores the access token, refresh token, and both expiry times when the authorization response provides them. It refreshes through LinkedIn's OAuth token endpoint before access-token expiry. If the LinkedIn app does not provide refresh-token support, the connection remains usable until expiry and then requests one new OAuth authorization.
- Facebook stores the long-lived user token and expiry. Before publishing, it exchanges the still-valid long-lived user token for a new long-lived user token, then derives the current Page token from `/me/accounts` for the configured Page. A revoked or expired user token requires one new Facebook OAuth connection.

## Credential model

Extend the persistent token record with optional provider-specific fields while preserving the existing file format:

```ts
type TokenProvider = "instagram" | "threads" | "linkedin" | "facebook"

interface StoredToken {
  provider: TokenProvider
  accessToken: string
  refreshToken?: string
  accountId: string
  expiresAt: string
  refreshTokenExpiresAt?: string
}
```

The token store remains outside the deployed source tree, uses restrictive permissions, writes atomically, and serializes mutations. Tokens must never be rendered into OAuth success pages, logs, or error messages.

## Runtime flow

Adapters receive a shared credential-refresh service. Before a publish, the adapter loads the provider record and asks the service for a current access token. The service returns the stored token when it is outside the refresh window; otherwise it performs the provider-specific exchange, persists the result, and returns the new token. Concurrent refreshes for the same provider share one in-flight request.

The Facebook adapter uses the refreshed user token to resolve the configured Page token immediately before publishing. The Page token is kept in memory only for the current process and is never written to configuration or the persistent token store.

## OAuth flows

Add LinkedIn OAuth start and callback routes alongside the existing Facebook route. Both callbacks persist credentials and return only provider/account identity and expiry metadata. The LinkedIn callback uses the app's configured client credentials and requested publishing scope. The Facebook callback persists the long-lived user token returned by the existing exchange.

Required environment variables:

```env
TOKEN_STORE_PATH=../influence-runtime/tokens.json
PUBLIC_BASE_URL=https://example.org
LINKEDIN_APP_ID=
LINKEDIN_APP_SECRET=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_PAGE_ID=
```

Existing `LINKEDIN_ACCESS_TOKEN` and `FACEBOOK_ACCESS_TOKEN` remain accepted as bootstrap configuration for publishing, but OAuth-created records take precedence once present. Existing author/page identifiers remain required.

## Failure behavior

- A refresh failure with a still-valid current token uses the current token and permits the publish, while recording the failure through the existing job error path only if publishing itself fails.
- An expired, revoked, or unusable token produces a safe reconnect error naming the provider but never containing the token.
- Missing provider client credentials make the corresponding OAuth start route return a configuration error; they do not expose secrets.
- An OAuth authorization code, state, or redirect mismatch fails without modifying stored credentials.

## Verification

Tests must cover token-store persistence and provider isolation, refresh-window behavior, concurrent refresh de-duplication, expired-token reconnect errors, LinkedIn responses with and without refresh tokens, Facebook user-token renewal followed by Page-token resolution, safe OAuth callback responses, and adapter use of refreshed credentials. Typecheck, the frontend build, focused publishing tests, and the full suite must be run. Existing unrelated Sharp fixture failures remain reported separately if still present.

## Non-goals

- Adding automatic refresh for Mastodon or Bluesky.
- Replacing provider OAuth with browser automation.
- Persisting Facebook Page tokens separately from the user-token record.
- Exposing an administrative token-management UI.
