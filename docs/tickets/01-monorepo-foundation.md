# 01 — Monorepo Foundation

**Phase:** 0
**Depends on:** none
**Unblocks:** every other ticket

## Scope

pnpm workspaces, Turborepo task graph, root tooling (Prettier, ESLint flat, Husky, lint-staged, commitlint, Spotless).

---

## T0.1 — Initialize monorepo skeleton

### Files to create

- `package.json` (root)
- `pnpm-workspace.yaml`
- `turbo.json`
- `.editorconfig`
- `.gitignore`
- `README.md` (placeholder; full version in ticket 13)
- `apps/backend/package.json` (Maven wrapper)
- `apps/frontend/` (created in ticket 08)
- `packages/api-types/` (created in ticket 07)
- `infra/` (created in ticket 02)
- `docs/adr/` (created in ticket 13)

### pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### turbo.json (exact tasks)

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": { "persistent": true, "cache": false },
    "build": {
      "dependsOn": ["^build", "generate:types"],
      "outputs": ["dist/**", ".next/**", "target/**"]
    },
    "lint": {},
    "typecheck": { "dependsOn": ["generate:types"] },
    "test": { "dependsOn": ["^build"] },
    "generate:types": { "outputs": ["dist/**"] }
  }
}
```

### apps/backend/package.json (Maven wrapper)

```json
{
  "name": "@app/backend",
  "private": true,
  "scripts": {
    "dev": "./mvnw spring-boot:run",
    "build": "./mvnw clean package -DskipTests",
    "test": "./mvnw test",
    "lint": "./mvnw spotless:check",
    "format": "./mvnw spotless:apply"
  }
}
```

### Done when

- `pnpm install` at root succeeds
- `turbo run build` discovers both apps
- `generate:types` → frontend `typecheck` dependency respected

---

## T0.2 — Shared tooling

### Setup

- **Prettier:** root `.prettierrc` + `.prettierignore`
- **ESLint flat config:** root `eslint.config.mjs` (TypeScript, Next.js plugin extending into `apps/frontend`)
- **Husky:** `pnpm dlx husky init`
- **lint-staged:** in root `package.json`
- **commitlint:** `@commitlint/cli` + `@commitlint/config-conventional`, hook `.husky/commit-msg`
- **Spotless (backend):** add `spotless-maven-plugin` to `apps/backend/pom.xml` with Google Java Format; lint-staged invokes `./mvnw spotless:check` on `*.java`

### lint-staged config

```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx,json,md,yml,yaml}": ["prettier --write"],
    "apps/backend/**/*.java": ["bash -c 'cd apps/backend && ./mvnw spotless:apply'"]
  }
}
```

### Done when

- Malformed commit (non-Conventional) rejected
- `pnpm format` rewrites both apps
- `./mvnw spotless:check` runs on staged Java files

---

## Notes for executor

- DO NOT add Gradle anywhere. Plan is locked to Maven.
- DO NOT bump Turborepo task list — match `turbo.json` schema above exactly.
- Frontend / backend / packages folders may be empty stubs at this stage; later tickets fill them.
