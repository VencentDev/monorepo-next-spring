.PHONY: dev infra seed reset backend-dev spring-dev backend-test backend-build down

dev:
	docker compose -f infra/docker-compose.yml up -d
	pnpm turbo run dev

infra:
	docker compose -f infra/docker-compose.yml up -d

seed:
	cd apps/backend && set -a && [ ! -f .env ] || . ./.env && set +a && ./mvnw flyway:migrate

reset:
	docker compose -f infra/docker-compose.yml down -v

backend-dev:
	cd apps/backend && set -a && [ ! -f .env ] || . ./.env && set +a && ./mvnw spring-boot:run

spring-dev: backend-dev

backend-test:
	cd apps/backend && ./mvnw test

backend-build:
	cd apps/backend && ./mvnw clean package

down:
	docker compose -f infra/docker-compose.yml down
