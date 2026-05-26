# Todo App Monorepo

## Project Overview

This repository is a full-stack todo application used as a production-shaped reference for a Next.js frontend, Spring Boot backend, Keycloak authentication, Postgres persistence, generated OpenAPI TypeScript types, and GitHub Actions image publishing.

## Prerequisites

- Node.js 20
- pnpm 10.12.1, via Corepack or a local install matching `packageManager`
- Java 21
- Docker with Docker Compose

## One-Command Start

```bash
make dev
# Postgres :5432, Keycloak :8081, backend :8080, frontend :3000
# log in as tester / password
```

Open `http://localhost:3000/app/todos`. The protected route redirects to Keycloak when you are not signed in.

## Architecture

```mermaid
flowchart LR
  Browser -->|HTTP| Next[Next.js frontend :3000]
  Next -->|API requests| Spring[Spring Boot backend :8080]
  Next -->|Auth.js OIDC| Keycloak[Keycloak :8081]
  Spring -->|JWT issuer/JWK validation| Keycloak
  Spring -->|JPA/Flyway| Postgres[(Postgres :5432)]
  Keycloak -->|realm data| Postgres
```

## Repo Layout

```text
apps/
  backend/       Spring Boot API, Flyway migrations, tests
  frontend/      Next.js app, Auth.js, TanStack Query, shadcn/ui
packages/
  api-types/     TypeScript types generated from OpenAPI
infra/
  docker-compose.yml
  keycloak/      Local realm export
  postgres/      Local database initialization
docs/
  adr/           Architecture decision records
  tickets/       Implementation tickets and completion history
```

## State Layering Convention

| State type         | Owner          |
| ------------------ | -------------- |
| Server state       | TanStack Query |
| Session/auth       | Auth.js        |
| Ephemeral UI state | Zustand        |

Keep these layers separate. Do not copy API entities into Zustand, and do not use TanStack Query for local UI controls.

## Add a Backend Module

1. Create a vertical slice for the feature under `apps/backend/src/main/java/com/vencentdev/backend/<name>/`, following the existing package style: `controller`, `service`, `repository`, `entity`, `dto`, and `mapper`.
2. Use Lombok for JPA entities, Java records for DTOs, and MapStruct for mapper boundaries.
3. Add a Flyway migration such as `apps/backend/src/main/resources/db/migration/V<n>__<name>.sql`.
4. Add repository tests with `@DataJpaTest` when persistence behavior matters.
5. Add API integration tests by extending `IntegrationTestBase`.
6. Keep security behavior explicit in controller integration tests.

## Add a Frontend Feature

1. Add the page under `apps/frontend/src/app/app/<feature>/page.tsx` for authenticated app routes.
2. Add a hook such as `apps/frontend/src/hooks/use<Feature>.ts`.
3. Type API inputs and responses through `@app/api-types`.
4. Use TanStack Query for server data and mutations.
5. Add a Zustand store only for ephemeral UI state such as filters, selected tabs, or drawer state.
6. Keep shared UI primitives in `apps/frontend/src/components/ui`.

## Add Google or GitHub Login

**The whole point of the Keycloak-as-IdP choice:** adding Google or GitHub as a login option does NOT change any frontend or backend code.

**Option A - Realm export JSON (`infra/keycloak/realm-export.json`):**
Add an entry under `identityProviders`:

```json
{
  "identityProviders": [
    {
      "alias": "google",
      "providerId": "google",
      "enabled": true,
      "config": {
        "clientId": "${GOOGLE_CLIENT_ID}",
        "clientSecret": "${GOOGLE_CLIENT_SECRET}"
      }
    }
  ]
}
```

Set env vars in `infra/docker-compose.yml` for the `keycloak` service. Same shape for GitHub (`"providerId": "github"`).

**Option B - Keycloak admin console:**
`http://localhost:8081` -> admin login -> realm `app` -> Identity Providers -> Add provider -> Google/GitHub -> paste client ID and secret from the OAuth app you created in the respective console.

Add redirect URI to the OAuth app: `http://localhost:8081/realms/app/broker/<alias>/endpoint`.

Done. The Keycloak login page will now show "Sign in with Google" alongside the username/password form.

## Testing

```bash
make backend-test
pnpm --filter @app/frontend lint
pnpm --filter @app/frontend typecheck
pnpm --filter @app/frontend test --if-present
```

The backend tests use Testcontainers for Postgres. The frontend test script is currently a placeholder until a Jest, Vitest, or Playwright suite is added.

## CI

GitHub Actions is defined in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

- Pull requests run backend and frontend test jobs.
- Pushes to `main` run tests and publish images to GHCR:
  - `ghcr.io/<owner>/<repo>/backend:latest`
  - `ghcr.io/<owner>/<repo>/backend:<sha>`
  - `ghcr.io/<owner>/<repo>/frontend:latest`
  - `ghcr.io/<owner>/<repo>/frontend:<sha>`

Repository settings must allow GitHub Actions read/write package permissions for GHCR publishing.

## ADRs

Architecture decisions live in [`docs/adr/`](docs/adr/). ADR files are append-only: do not renumber them, and supersede old decisions with a new ADR instead of editing history.
