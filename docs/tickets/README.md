# Tickets Index

Component-split execution plan for [implementation-plan.md](../../implementation-plan.md). Each file is self-contained and executable by any AI agent.

## Locked stack (read first)

- **Monorepo:** pnpm workspaces + Turborepo
- **Backend:** Spring Boot 4.0.6, Java 21, Maven, package `com.backend.backend`, Spring Security 7 (OAuth2 Resource Server), PostgreSQL, Flyway, MapStruct, springdoc-openapi 3.0.x (Boot 4 line — NOT 2.x), Testcontainers, Jackson 3, `jackson-databind-nullable`
- **Frontend:** Next.js 14 App Router, TypeScript, Tailwind + shadcn/ui, Auth.js v5, TanStack Query, Zustand
- **IdP:** Keycloak in docker-compose
- **Shared:** `packages/api-types` (generated from OpenAPI)

## Conventions

- Backend layout: modular — `modules/{auth,user,todo}/{controller,service,repository,entity,dto,mapper}`
- Entities: Lombok, mutable, ID-based `equals/hashCode` via `@EqualsAndHashCode(onlyExplicitlyIncluded = true)`, `@NoArgsConstructor(access = AccessLevel.PROTECTED)`
- DTOs: Java records
- PATCH DTOs: records with `JsonNullable<T>` fields
- Frontend state: server → TanStack Query; auth → Auth.js; UI → Zustand. No overlap.

## Execution order

Recommended path: `01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13 → 14`. High-risk path first: `01 → 03 (T1.1, T1.2) → 04 (T2.1)` validates Keycloak JWT flow end-to-end.

## Files

| # | File | Phase | Scope |
|---|------|-------|-------|
| 01 | [01-monorepo-foundation.md](01-monorepo-foundation.md) | 0 | pnpm workspaces, Turborepo, tooling |
| 02 | [02-infrastructure.md](02-infrastructure.md) | 0, 10 | Docker compose, Postgres, Keycloak realm |
| 03 | [03-backend-core.md](03-backend-core.md) | 1 | Maven deps, config, exceptions, Flyway, logging |
| 04 | [04-backend-auth.md](04-backend-auth.md) | 2 | Resource Server, `@CurrentUser`, method security |
| 05 | [05-backend-user.md](05-backend-user.md) | 3 | User entity, JIT provisioning, PATCH with `JsonNullable` |
| 06 | [06-backend-todo.md](06-backend-todo.md) | 4 | Todo module, ownership isolation, smoke test |
| 07 | [07-shared-api-types.md](07-shared-api-types.md) | 5 | `packages/api-types` from OpenAPI |
| 08 | [08-frontend-core.md](08-frontend-core.md) | 6 | Next.js bootstrap, shadcn/ui, theming |
| 09 | [09-frontend-auth.md](09-frontend-auth.md) | 7 | Auth.js v5 Keycloak provider, refresh, middleware |
| 10 | [10-frontend-api-client.md](10-frontend-api-client.md) | 8 | typed fetch, TanStack Query, Zustand |
| 11 | [11-frontend-todo.md](11-frontend-todo.md) | 9 | Todo UI smoke test |
| 12 | [12-ci-cd.md](12-ci-cd.md) | 10 | GitHub Actions, Dockerfiles, Makefile |
| 13 | [13-docs-adrs.md](13-docs-adrs.md) | 10 | README, ADR-001..005 |
| 14 | [14-post-mvp-polish.md](14-post-mvp-polish.md) | 11 | Rate limiting, Sentry, Playwright, Redis, brokers |

## Acceptance gates

### "Auth works"
1. `docker compose up` brings Postgres + Keycloak up with realm imported
2. `pnpm dev` starts backend (`:8080`) and frontend (`:3000`)
3. `localhost:3000/app/todos` redirects to Keycloak login
4. After login, `GET /api/v1/auth/me` returns the user
5. One row in `users` after first login; no duplicates on repeat
6. Access token refresh works silently

### "Todo smoke test"
1. Authenticated user CRUDs own todos via UI
2. Two Keycloak users see disjoint lists
3. Forging another user's todo id in PATCH returns 403
4. Backend integration test asserts cross-user isolation
5. PATCH with `dueDate` absent → untouched; PATCH with `dueDate: null` → cleared
6. Frontend optimistic update rolls back on forced 500
