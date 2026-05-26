# 12 — CI/CD (GitHub Actions)

**Phase:** 10 (T10.3)
**Depends on:** 02 (Dockerfiles), 03 (backend tests), 06 (todo tests), 10 (frontend lint/typecheck/test)
**Unblocks:** automated quality gate, GHCR image publish

## Scope

Three jobs: `backend-test`, `frontend-test`, `build-images` (only on `main`). Cache pnpm and Maven.

---

## T10.3 — GitHub Actions

### File: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  backend-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "21"
          cache: maven
      - name: Run tests
        working-directory: apps/backend
        run: ./mvnw -B verify

  frontend-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Generate API types (from committed openapi.json)
        run: pnpm --filter @app/api-types generate:types
      - run: pnpm --filter @app/frontend lint
      - run: pnpm --filter @app/frontend typecheck
      - run: pnpm --filter @app/frontend test --if-present

  build-images:
    needs: [backend-test, frontend-test]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build & push backend
        uses: docker/build-push-action@v5
        with:
          context: ./apps/backend
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/backend:latest
            ghcr.io/${{ github.repository }}/backend:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build & push frontend
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./apps/frontend/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/frontend:latest
            ghcr.io/${{ github.repository }}/frontend:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### Backend test job notes

- Testcontainers picks up Docker from `ubuntu-latest` automatically (Docker preinstalled on GitHub-hosted runners)
- `./mvnw verify` runs unit + integration tests
- Maven cache via `actions/setup-java@v4` `cache: maven` (keyed on `pom.xml`)

### Frontend test job notes

- `pnpm/action-setup@v4` reads pnpm version from `package.json` `packageManager` field — set it
- Cache pnpm store via `actions/setup-node@v4` `cache: pnpm`
- `generate:types` from committed `openapi.json` (live backend not available in CI)
- `test --if-present` so the job passes when no Jest/Vitest suite is wired yet

### Build-images job notes

- Frontend Dockerfile context is repo root (it copies the workspace lockfile)
- Backend Dockerfile context is `apps/backend` (self-contained Maven build)
- GHCR auth via `GITHUB_TOKEN` (no PAT needed)
- Cache via GHA buildx cache (`type=gha`)

### Required repo settings

- Settings → Actions → General → Workflow permissions: **Read and write** (so `build-images` can push to GHCR)
- Settings → Packages → make the image public if anonymous pull is needed for compose

### Done when

- PR opens → both test jobs run
- Push to `main` → tests run + images push to GHCR
- `pnpm install --frozen-lockfile` works (committed `pnpm-lock.yaml`)

---

## OpenAPI spec freshness check (optional, recommended)

If `packages/api-types/openapi.json` is committed, add a check to fail CI when it's stale:

```yaml
  openapi-fresh:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: postgres }
        ports: ["5432:5432"]
        options: --health-cmd "pg_isready" --health-interval 5s --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: "21", cache: maven }
      - name: Start backend
        working-directory: apps/backend
        env:
          SPRING_PROFILES_ACTIVE: dev
          SPRING_DATASOURCE_URL: jdbc:postgresql://localhost:5432/postgres
        run: ./mvnw spring-boot:start
      - run: curl -sf http://localhost:8080/v3/api-docs > /tmp/current.json
      - run: diff <(jq -S . packages/api-types/openapi.json) <(jq -S . /tmp/current.json)
```

---

## Notes for executor

- DO NOT add deploy steps without explicit instruction
- Pin major versions of all actions (`@v4`, not `@latest`)
- Maven cache key auto-derived from `apps/backend/pom.xml` — no manual key needed
- Frontend Docker build needs lockfile at repo root → that's why context is `.` not `./apps/frontend`
