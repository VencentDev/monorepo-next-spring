# 03 — Backend Core (`apps/backend`)

**Phase:** 1
**Depends on:** 01 (monorepo), 02 (Postgres running)
**Unblocks:** 04, 05, 06

## Scope

Verify Initializr scaffold; add missing Maven deps; YAML config + profiles; common exception handling; Flyway baseline + auditing; request-id MDC + structured logging.

Stack reminder: Spring Boot 4.0.6, Java 21, Maven, package `com.backend.backend`. Initializr already produced base scaffold — this ticket completes it.

---

## T1.1 — Verify scaffold + add missing deps

### Verify

- `apps/backend/mvnw`, `mvnw.cmd`, `.mvn/wrapper/` committed
- `pom.xml` `<properties>` includes `<java.version>21</java.version>`

### pom.xml additions

```xml
<dependencies>
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-oauth2-resource-server</artifactId>
  </dependency>
  <dependency>
    <groupId>org.springdoc</groupId>
    <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
    <version>3.0.x</version> <!-- pin to latest 3.0.x, NOT 2.x -->
  </dependency>
  <dependency>
    <groupId>org.mapstruct</groupId>
    <artifactId>mapstruct</artifactId>
    <version>${mapstruct.version}</version>
  </dependency>
  <dependency>
    <groupId>org.flywaydb</groupId>
    <artifactId>flyway-core</artifactId>
  </dependency>
  <dependency>
    <groupId>org.flywaydb</groupId>
    <artifactId>flyway-database-postgresql</artifactId>
  </dependency>
  <dependency>
    <groupId>org.openapitools</groupId>
    <artifactId>jackson-databind-nullable</artifactId>
    <version>0.2.6</version>
  </dependency>

  <!-- test scope -->
  <dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>postgresql</artifactId>
    <scope>test</scope>
  </dependency>
  <dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>junit-jupiter</artifactId>
    <scope>test</scope>
  </dependency>
</dependencies>

<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>org.testcontainers</groupId>
      <artifactId>testcontainers-bom</artifactId>
      <version>${testcontainers.version}</version>
      <type>pom</type>
      <scope>import</scope>
    </dependency>
  </dependencies>
</dependencyManagement>
```

### Annotation processor ordering — CRITICAL

```xml
<plugin>
  <artifactId>maven-compiler-plugin</artifactId>
  <configuration>
    <annotationProcessorPaths>
      <path>
        <groupId>org.projectlombok</groupId>
        <artifactId>lombok</artifactId>
        <version>${lombok.version}</version>
      </path>
      <path>
        <groupId>org.mapstruct</groupId>
        <artifactId>mapstruct-processor</artifactId>
        <version>${mapstruct.version}</version>
      </path>
      <path>
        <groupId>org.projectlombok</groupId>
        <artifactId>lombok-mapstruct-binding</artifactId>
        <version>0.2.0</version>
      </path>
    </annotationProcessorPaths>
  </configuration>
</plugin>
```

Lombok BEFORE MapStruct. `lombok-mapstruct-binding` makes MapStruct read Lombok-generated getters on entities. DTO records need no Lombok.

### Done when

- `./mvnw spring-boot:run` starts
- `GET /actuator/health` → `{"status":"UP"}`

---

## T1.2 — Config & profiles

### Files

- `src/main/resources/application.yml` (rename from `.properties`)
- `src/main/resources/application-dev.yml`
- `src/main/resources/application-test.yml`
- `src/main/resources/application-prod.yml`

### application.yml

```yaml
spring:
  application:
    name: backend
  datasource:
    url: ${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost:5432/app}
    username: ${SPRING_DATASOURCE_USERNAME:postgres}
    password: ${SPRING_DATASOURCE_PASSWORD:postgres}
  jpa:
    hibernate:
      ddl-auto: validate
    open-in-view: false
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: ${SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI:http://localhost:8081/realms/app}

app:
  cors:
    allowed-origins: ${APP_CORS_ALLOWED_ORIGINS:http://localhost:3000}

management:
  endpoints:
    web:
      exposure:
        include: health,info
```

### Config classes (`com.backend.backend.config`)

- `CorsConfig` — reads `app.cors.allowed-origins`
- `JpaAuditingConfig` — `@EnableJpaAuditing`
- `OpenApiConfig` — registers bearer auth scheme so Swagger UI "Authorize" works:

```java
@Configuration
public class OpenApiConfig {
  @Bean
  public OpenAPI api() {
    return new OpenAPI()
      .components(new Components().addSecuritySchemes("bearer",
        new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")))
      .addSecurityItem(new SecurityRequirement().addList("bearer"));
  }
}
```

- `WebMvcConfig` — registration point for `CurrentUserArgumentResolver` (ticket 04)

### Done when

- App reads config from env vars
- `GET /v3/api-docs` reachable (anonymous — security in ticket 04)

---

## T1.3 — Common exception handling

### Package

`com.backend.backend.common.exception`

### Files

- `ApiError.java` — **record**, RFC 7807-style

```java
public record ApiError(
  int status,
  String code,
  String message,
  String traceId,
  Instant timestamp,
  List<FieldError> errors
) {
  public record FieldError(String field, String message) {}
}
```

- `ResourceNotFoundException`, `BadRequestException`, `ForbiddenException`, `ConflictException` — extend `RuntimeException`
- `GlobalExceptionHandler` — `@RestControllerAdvice`

### GlobalExceptionHandler must handle

- `MethodArgumentNotValidException` → 400 with field errors
- `ConstraintViolationException` → 400
- `ResourceNotFoundException` → 404
- `BadRequestException` → 400
- `ForbiddenException` → 403
- `ConflictException` → 409
- `AccessDeniedException` → 403
- `AuthenticationException` → 401
- fallback `Exception` → 500 (do NOT leak message in prod profile)

Pull `traceId` from MDC (set by `RequestIdFilter`, T1.5).

### Done when

- `GET /api/v1/nonexistent` → JSON `ApiError` with `status`, `code`, `message`, `traceId`

---

## T1.4 — Database migrations & auditing

### Files

- `src/main/resources/db/migration/V1__init.sql`
- `com/backend/backend/common/persistence/AuditableEntity.java`

### V1\_\_init.sql

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(120),
  role VARCHAR(32) NOT NULL,
  user_type VARCHAR(32) NOT NULL,
  kyc_status VARCHAR(32) NOT NULL DEFAULT 'NONE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by VARCHAR(255),
  updated_by VARCHAR(255)
);

CREATE INDEX idx_users_external_id ON users(external_id);
```

### AuditableEntity (Lombok entity)

```java
@Getter
@Setter
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class AuditableEntity {
  @CreatedDate @Column(updatable = false) private Instant createdAt;
  @LastModifiedDate private Instant updatedAt;
  @CreatedBy @Column(updatable = false) private String createdBy;
  @LastModifiedBy private String updatedBy;
}
```

`@EnableJpaAuditing` already on `JpaAuditingConfig`. Provide an `AuditorAware<String>` bean returning JWT `sub` (or `"system"` when no security context).

### Done when

- `./mvnw spring-boot:run` runs migrations against compose Postgres
- `flyway_schema_history` has one row
- Inserting a row populates audit columns

---

## T1.5 — Request ID + structured logging

### Files

- `com/backend/backend/common/web/RequestIdFilter.java`
- `src/main/resources/logback-spring.xml`

### RequestIdFilter

- `OncePerRequestFilter`
- Reads `X-Request-Id` header; if absent, generates UUID
- Puts in MDC as `traceId`
- Echoes back as `X-Request-Id` response header
- Clears MDC in `finally`

Register early in filter chain (order before security).

### logback-spring.xml

- Default profile: pattern includes `%X{traceId}`
- Profiles `prod`, `staging`: `net.logstash.logback.encoder.LogstashEncoder` (add `logstash-logback-encoder` to `pom.xml`)

### Done when

- Every log line contains `traceId`
- Same id returned in error response body and `X-Request-Id` header

---

## Notes for executor

- DO NOT rename package `com.backend.backend` unless explicitly asked
- DO NOT add Gradle anywhere
- springdoc must be `3.0.x` line; `2.x` is Boot 3 only
- Verify Spring Security APIs against version **7.x** docs — `SecurityFilterChain` builder methods were renamed from 6.x
