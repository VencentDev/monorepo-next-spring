# 02 — Infrastructure (Docker, Compose, Make)

**Phase:** 0 (T0.3), 10 (T10.1, T10.2)
**Depends on:** 01
**Unblocks:** 03 (backend needs Postgres + Keycloak), 09 (frontend auth)

## Scope

Local infra via docker-compose: Postgres + Keycloak (dev mode, realm imported). Top-level compose adds backend + frontend services. Makefile orchestrates everything.

---

## T0.3 — Docker compose baseline

### Files

- `infra/docker-compose.yml`
- `infra/postgres/init.sql` — creates `app` and `keycloak` DBs
- `infra/keycloak/realm-export.json` — realm with `webapp` (public, PKCE) + `backend` (bearer-only) clients, one test user

### docker-compose.yml (infra services)

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: postgres
    volumes:
      - ./postgres/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
      - pgdata:/var/lib/postgresql/data
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 10

  keycloak:
    image: quay.io/keycloak/keycloak:25.0
    command: ["start-dev", "--import-realm"]
    environment:
      KC_BOOTSTRAP_ADMIN_USERNAME: admin
      KC_BOOTSTRAP_ADMIN_PASSWORD: admin
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: postgres
      KC_DB_PASSWORD: postgres
    volumes:
      - ./keycloak/realm-export.json:/opt/keycloak/data/import/realm.json:ro
    ports: ["8081:8080"]
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  pgdata:
```

### infra/postgres/init.sql

```sql
CREATE DATABASE app;
CREATE DATABASE keycloak;
```

### Realm export must include

- Realm name: `app`
- Client `webapp`: public, PKCE required, redirect URIs `http://localhost:3000/*`, web origins `http://localhost:3000`
- Client `backend`: bearer-only
- Roles: `USER`, `ADMIN`
- Test user: `tester / password`, role `USER`
- Reserve key `identityProviders: []` — placeholder for Google/GitHub broker config (ticket 13)

### Done when

- `docker compose -f infra/docker-compose.yml up` brings Keycloak up at `http://localhost:8081`
- Realm `app` loaded
- Login as `tester / password` works via account console

---

## T10.1 — Top-level docker-compose (full stack)

### File

`docker-compose.yml` at repo root (extends `infra/docker-compose.yml`) OR a separate `docker-compose.full.yml`.

Adds:
- `backend` service built from `apps/backend/Dockerfile`
- `frontend` service built from `apps/frontend/Dockerfile`

### apps/backend/Dockerfile (Maven multi-stage)

```dockerfile
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY .mvn/ .mvn/
COPY mvnw .
RUN ./mvnw dependency:go-offline -B
COPY src ./src
RUN ./mvnw clean package -DskipTests -B

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
ENTRYPOINT ["java","-jar","/app/app.jar"]
```

### Backend service block

```yaml
backend:
  build: ./apps/backend
  environment:
    SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/app
    SPRING_DATASOURCE_USERNAME: postgres
    SPRING_DATASOURCE_PASSWORD: postgres
    SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI: http://keycloak:8080/realms/app
    APP_CORS_ALLOWED_ORIGINS: http://localhost:3000
  ports: ["8080:8080"]
  depends_on:
    postgres:
      condition: service_healthy
    keycloak:
      condition: service_started
```

### Frontend Dockerfile

Standard Next.js multi-stage (`pnpm install --frozen-lockfile` → `pnpm build` → `node server.js`). Defer details to ticket 08.

---

## T10.2 — Makefile

### File

`Makefile` at repo root.

```makefile
.PHONY: dev infra seed reset backend-test backend-build down

dev:
	docker compose -f infra/docker-compose.yml up -d
	pnpm turbo run dev

infra:
	docker compose -f infra/docker-compose.yml up -d

seed:
	cd apps/backend && ./mvnw flyway:migrate

reset:
	docker compose -f infra/docker-compose.yml down -v

backend-test:
	cd apps/backend && ./mvnw test

backend-build:
	cd apps/backend && ./mvnw clean package

down:
	docker compose -f infra/docker-compose.yml down
```

### Done when

- `make dev` brings up Postgres + Keycloak, then runs both apps
- `make reset` wipes volumes cleanly

---

## Notes for executor

- Keycloak version pinned to 25.x (compatible with Spring Security 7 JWT validation)
- Realm export JSON: hand-craft or export from a running Keycloak instance; do NOT use Keycloak 21.x format
- Postgres init script only runs on empty volume — `make reset` required when schema-altering changes land
