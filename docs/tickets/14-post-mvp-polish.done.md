# 14 — Post-MVP Polish

**Phase:** 11
**Depends on:** acceptance gates green (tickets 01–13)
**Unblocks:** nothing (optional)

## Scope

Stretch goals after the smoke test passes. Each item is independent — pick by priority, not order.

---

## 14.1 — Bucket4j rate limiting on auth endpoints

### Goal

Cap requests-per-minute on `/api/v1/auth/me` and `/api/v1/users/me` (PATCH) to slow credential-stuffing and brute-force attempts.

### Setup

- Add `com.bucket4j:bucket4j-spring-boot-starter` to backend `pom.xml`
- Bucket per JWT `sub` (authenticated) OR per IP (anonymous endpoints)
- Filter or `@RateLimited` annotation in `modules/auth/ratelimit/`

### Acceptance

- 60 req/min on `/auth/me` per user; 61st returns `429 Too Many Requests`
- Limits configurable via `application.yml`

---

## 14.2 — Sentry (both sides)

### Backend

- Add `io.sentry:sentry-spring-boot-starter-jakarta`
- `application.yml`: `sentry.dsn=${SENTRY_DSN_BACKEND:}`
- Includes traceId from MDC (ticket 03) in events

### Frontend

- `pnpm --filter @app/frontend add @sentry/nextjs`
- Run `pnpm dlx @sentry/wizard@latest -i nextjs` to scaffold
- Source maps uploaded in CI via Sentry CLI on `main`

### Acceptance

- Forced backend 500 shows in Sentry with correct traceId
- Frontend unhandled error shows in Sentry with sourcemapped stack

---

## 14.3 — Playwright E2E

### Goal

End-to-end flow: login → create todo → see it → edit → delete.

### Setup

- `apps/frontend/e2e/` with `playwright.config.ts`
- `pnpm --filter @app/frontend add -D @playwright/test`
- Compose stack starts via Playwright `globalSetup` (re-uses `make dev` infra)
- Use a dedicated Keycloak test user with known credentials

### Test outline

```ts
test('auth + crud', async ({ page }) => {
  await page.goto('/app/todos');
  await page.getByRole('textbox', { name: 'Username' }).fill('tester');
  await page.getByRole('textbox', { name: 'Password' }).fill('password');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/app\/todos/);
  // create
  await page.getByRole('button', { name: 'New todo' }).click();
  await page.getByPlaceholder('Title').fill('Buy milk');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Buy milk')).toBeVisible();
});
```

### CI wiring

- Add `e2e` job after `frontend-test` in `.github/workflows/ci.yml`
- Run `docker compose -f infra/docker-compose.yml up -d` before tests
- Upload Playwright HTML report as artifact

### Acceptance

- Local: `pnpm --filter @app/frontend test:e2e` passes
- CI: e2e job green on PR

---

## 14.4 — Storybook for shadcn primitives + composed components

### Setup

- `pnpm dlx storybook@latest init` in `apps/frontend`
- Stories for `Button`, `Input`, `Select`, `TodoCard`, `TodoFormSheet`
- Theming addon for dark/light preview

### Acceptance

- `pnpm --filter @app/frontend storybook` opens at `:6006`
- Storybook builds in CI (no failures)

---

## 14.5 — `packages/ui` extraction

### Trigger

Only when a second frontend app appears in the monorepo. Premature extraction = pain.

### Plan

- New workspace `packages/ui` with shadcn components moved out of `apps/frontend/src/components/ui`
- `tsup` or `tsc -p . --noEmit false` to ship `.d.ts` + ESM
- Apps consume via `import { Button } from "@app/ui"`

### Acceptance

- Both apps render the same `<Button>` from `@app/ui`
- Removing a primitive from `@app/ui` breaks types in both apps (proof of single source)

---

## 14.6 — Redis cache for user lookups

### Goal

`UserService.findOrProvision` hits the DB on every authenticated request. Cache `externalId → User` in Redis with short TTL.

### Setup

- Add `spring-boot-starter-data-redis` + `redis` service in `infra/docker-compose.yml`
- `@Cacheable("users:byExternalId")` on lookup method
- TTL: 60s (short enough that role changes propagate; long enough to absorb burst traffic)

### Acceptance

- N consecutive `/auth/me` calls → 1 DB read, N-1 cache hits (observed via DB log or actuator metrics)
- Updating user invalidates cache entry

---

## 14.7 — Identity broker wiring (Google + GitHub)

### Already documented in ticket 13 README

This stretch goal is the actual implementation:

1. Create OAuth app in Google Cloud Console / GitHub Developer Settings
2. Get client ID + secret; put in `.env` (NOT committed)
3. Update `infra/keycloak/realm-export.json` `identityProviders` entry (template in ticket 13)
4. `make reset && make dev` — Keycloak login page shows "Sign in with Google / GitHub"
5. Document the OAuth-app redirect URI in your README under each provider

### Acceptance

- User clicks "Sign in with Google" → Google consent → returns logged in
- JIT provisioning (ticket 05) creates a `users` row from Google-issued JWT claims
- No frontend or backend code change required

---

## Notes for executor

- These are mutually independent; do not block one on another
- Each adds operational/maintenance cost — pick based on actual product need, not template completeness
- Sentry + rate limiting are the highest-value pair for any deployment that takes real traffic
- E2E + Storybook are highest value for any deployment with a team larger than one
- Redis cache: skip unless metrics show user-lookup is a bottleneck
