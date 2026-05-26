# 13 — README + ADRs

**Phase:** 10 (T10.4)
**Depends on:** everything; written last
**Unblocks:** onboarding next contributor

## Scope

Top-level README (prereqs, one-command start, architecture, extension guides) + five starter ADRs in `docs/adr/`.

---

## T10.4 — Top-level README

### File

`README.md` at repo root (overwrites placeholder from ticket 01).

### Required sections

1. **Project overview** — one paragraph
2. **Prerequisites** — Node 20, pnpm 9, Java 21, Docker
3. **One-command start**
   ```bash
   make dev
   # Postgres :5432, Keycloak :8081, backend :8080, frontend :3000
   # log in as tester / password
   ```
4. **Architecture diagram** — ASCII or Mermaid:
   ```
   Browser ──> Next.js (3000) ──> Spring Boot (8080)
                  │                      │
                  └──> Keycloak (8081) <─┘ (JWT validation)
                                          │
                                         Postgres (5432)
   ```
5. **Repo layout** — tree summary of `apps/`, `packages/`, `infra/`, `docs/`
6. **State layering convention** — table from ticket 10
7. **How to add a backend module**
   - Create `modules/<name>/{controller,service,repository,entity,dto,mapper}`
   - Lombok entity, record DTOs, MapStruct mapper
   - Flyway migration `V<n>__<name>.sql`
   - Tests: `@DataJpaTest` + `IntegrationTestBase`
8. **How to add a frontend feature**
   - Page under `src/app/app/<feature>/page.tsx`
   - Hook `src/hooks/use<Feature>.ts` (TanStack Query, typed via `@app/api-types`)
   - Zustand store only for UI state
9. **How to add Google/GitHub as Keycloak identity brokers** — see below
10. **Testing** — `make backend-test`, `pnpm --filter @app/frontend test`
11. **CI** — link to `.github/workflows/ci.yml`, GHCR image references
12. **ADRs** — link to `docs/adr/`

### Identity broker section (verbatim purpose, code-zero)

> **The whole point of the Keycloak-as-IdP choice:** adding Google or GitHub as a login option does NOT change any frontend or backend code.
>
> **Option A — Realm export JSON (`infra/keycloak/realm-export.json`):**
> Add an entry under `identityProviders`:
> ```json
> {
>   "identityProviders": [
>     {
>       "alias": "google",
>       "providerId": "google",
>       "enabled": true,
>       "config": {
>         "clientId": "${GOOGLE_CLIENT_ID}",
>         "clientSecret": "${GOOGLE_CLIENT_SECRET}"
>       }
>     }
>   ]
> }
> ```
> Set env vars in `infra/docker-compose.yml` for the `keycloak` service. Same shape for GitHub (`"providerId": "github"`).
>
> **Option B — Keycloak admin console:**
> `http://localhost:8081` → admin login → realm `app` → Identity Providers → Add provider → Google/GitHub → paste client ID & secret from the OAuth app you created in the respective console.
>
> Add redirect URI to the OAuth app: `http://localhost:8081/realms/app/broker/<alias>/endpoint`.
>
> Done. The Keycloak login page will now show "Sign in with Google" alongside the username/password form.

---

## ADRs

### Folder

`docs/adr/` (already created in ticket 01).

### File naming

`NNNN-short-slug.md` — sequential, never renumber.

### Template (each ADR follows this shape)

```markdown
# ADR-<NNN>: <Title>

- **Status:** Accepted
- **Date:** YYYY-MM-DD

## Context
<What problem are we deciding about?>

## Decision
<What did we pick?>

## Consequences
<What follows? Trade-offs, what we lose, what we gain.>

## Alternatives considered
<Other options + why we passed.>
```

### ADR-001 — Why Keycloak as default IdP

**Decision:** Use Keycloak in docker-compose with realm import.

**Alternatives considered:**
- Auth.js handling OAuth directly against Google/GitHub
- Spring Authorization Server

**Key points:**
- Future identity brokers (Google, GitHub, SAML) added in Keycloak with zero app code change
- Single JWT issuer simplifies backend Resource Server config
- Self-hosted = portable; same setup local/staging/prod
- Cost: extra container to run, realm export to maintain

### ADR-002 — Why modular backend layout (`modules/{user,todo,auth}`) over flat layered

**Decision:** Each feature is a vertical slice: `modules/<name>/{controller,service,repository,entity,dto,mapper}`.

**Alternatives considered:**
- Flat layered: `controller/`, `service/`, `repository/` at top level
- Hexagonal/clean-architecture with adapters

**Key points:**
- Slices stay cohesive when the team grows
- Easy to lift a module into a separate service later
- Drawback: cross-module references look longer (`modules.user.entity.User`)

### ADR-003 — Why Spring Boot 4.0 (and the springdoc 3.x line)

**Decision:** Spring Boot 4.0.6 + Spring Security 7 + springdoc-openapi 3.0.x.

**Alternatives considered:**
- Stay on Boot 3.x LTS
- Boot 4 with springdoc 2.x (incompatible)

**Key points:**
- Boot 4 GA aligns with Jackson 3 and Java 21+ idioms
- Spring Security 7 has minor API renames vs 6.x — pin docs
- springdoc 2.x does NOT support Boot 4 — must use 3.0.x line
- Drawback: smaller community/blog ecosystem; verify against official docs not blog posts

### ADR-004 — Why Maven (not Gradle)

**Decision:** Maven (`pom.xml`, `mvnw`).

**Reasoning (capture the actual one — template default below):**
- Initializr default; less moving parts than Groovy/Kotlin DSL
- `pnpm` script wrapper hides Maven from frontend devs
- Annotation processor ordering is explicit in `pom.xml` (critical for Lombok+MapStruct)
- Drawback: more verbose than Gradle for advanced cases

### ADR-005 — Lombok for entities, records for DTOs (and `JsonNullable` PATCH convention)

**Decision:**
- Entities: Lombok-based, mutable, ID-only `equals/hashCode`
- DTOs: Java records
- PATCH DTOs: records with `JsonNullable<T>` fields

**Alternatives considered:**
- Records for entities — fails because JPA needs mutable + no-arg constructor
- DTOs with Lombok — works but no value, more annotations
- PATCH via plain `T` fields with sentinel values — ambiguous between "absent" and "set to null"

**Key points:**
- Entity `equals/hashCode` ID-only avoids Hibernate proxy pitfalls
- Records integrate with Jackson/Bean Validation/MapStruct natively
- `JsonNullable<T>` is the only correct way to express PATCH semantics in a typed DTO
- Annotation processor ordering: Lombok → MapStruct → `lombok-mapstruct-binding`
- Drawback: developers must remember the convention; `JsonNullable` adds verbosity

---

## Done when

- README exists at repo root with all 12 sections
- `docs/adr/0001-keycloak-as-idp.md` through `docs/adr/0005-lombok-entities-record-dtos.md` exist
- Identity broker section copyable into Keycloak admin config without changes
- New contributor can run `make dev` and reach `localhost:3000/app/todos` using only the README

---

## Notes for executor

- ADRs are append-only — superseded ADRs get `Status: Superseded by ADR-NNN` and stay in place
- Do NOT add ADR-006+ here; future architectural choices get their own ADRs in later work
- Architecture diagram: Mermaid renders on GitHub; ASCII is the fallback. Either works
