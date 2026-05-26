# 07 — Shared API Types (`packages/api-types`)

**Phase:** 5
**Depends on:** 03, 04, 05, 06 (backend endpoints + OpenAPI spec available)
**Unblocks:** 10 (frontend API client)

## Scope

TypeScript types generated from backend OpenAPI spec, consumed by frontend via workspace import.

---

## T5.1 — Package setup

### Files

- `packages/api-types/package.json`
- `packages/api-types/tsconfig.json`
- `packages/api-types/scripts/generate.ts` (or shell script — see below)
- `packages/api-types/openapi.json` (committed fallback, see Failure modes)
- `packages/api-types/src/index.ts` (re-export)
- `packages/api-types/dist/index.d.ts` (generated, gitignored)

### package.json

```json
{
  "name": "@app/api-types",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.d.ts",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "generate:types": "openapi-typescript ./openapi.json --output ./dist/index.d.ts",
    "fetch:spec": "curl -sf http://localhost:8080/v3/api-docs -o ./openapi.json"
  },
  "devDependencies": {
    "openapi-typescript": "^7"
  }
}
```

### Generation strategy

**Primary (live):**

```bash
pnpm --filter @app/api-types fetch:spec   # backend must be running
pnpm --filter @app/api-types generate:types
```

**Fallback (committed spec):**

If springdoc 3.0.x has Boot 4 hiccups (e.g. discriminator issues, missing schemas), commit `openapi.json` to the repo and generate from file. Document refresh procedure in ticket 13 README.

### Wire into Turborepo

Already declared in `turbo.json` (ticket 01). The `generate:types` task outputs `dist/**`. Frontend `typecheck` depends on it, so Turbo runs generation first.

### src/index.ts

```ts
export type { paths, components, operations } from "../dist/index";
```

(So consumers import from `@app/api-types`, not `@app/api-types/dist`.)

### Frontend consumption sample

```ts
import type { paths } from "@app/api-types";

type TodoResponse =
  paths["/api/v1/todos/{id}"]["get"]["responses"]["200"]["content"]["application/json"];
```

### Done when

- `import type { paths } from "@app/api-types"` resolves in `apps/frontend`
- `turbo run typecheck --filter=@app/frontend` regenerates types first
- Frontend `tsc` sees `TodoResponse`, `UserResponse`, paginated wrappers

---

## Notes for executor

- Use openapi-typescript v7 (not v6 — different API)
- `JsonNullable<T>` from `jackson-databind-nullable` produces an OpenAPI schema with `nullable: true` — openapi-typescript v7 maps that to `T | null` in TS. PATCH "absent" maps to optional key (`?:`)
- Do NOT generate runtime clients (no `openapi-fetch` runtime here) — frontend uses its own `apiFetch` wrapper (ticket 10)
- If you switch to committed spec mode, add CI step to fail when `openapi.json` is stale vs the running backend (ticket 12)
