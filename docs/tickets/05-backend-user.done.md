# 05 — Backend User Module (`modules/user`)

**Phase:** 3
**Depends on:** 03 (core, V1 migration with `users` table), 04 (auth)
**Unblocks:** 06 (todo FK references users)

## Scope

User entity (Lombok), repositories, MapStruct mappers, **DTO records with `JsonNullable<T>` for PATCH**, JIT provisioning service, `UserController`, custom validators, comprehensive tests.

---

## T3.1 — Entities + enums

### Files (Lombok entities — mutable, ID-based equals/hashCode)

- `modules/user/entity/User.java`
- `modules/user/entity/ContactInfo.java`
- `modules/user/entity/Role.java` (enum: `USER`, `ADMIN`)
- `modules/user/entity/UserType.java` (enum: `INDIVIDUAL`, `ORGANIZATION`)
- `modules/user/entity/KycStatus.java` (enum: `NONE`, `PENDING`, `VERIFIED`, `REJECTED`)

### User entity

```java
@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
@EqualsAndHashCode(callSuper = false, onlyExplicitlyIncluded = true)
public class User extends AuditableEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.UUID)
  @EqualsAndHashCode.Include
  private UUID id;

  @Column(name = "external_id", nullable = false, unique = true)
  private String externalId;

  @Column(nullable = false, unique = true)
  private String email;

  @Column(name = "display_name", length = 120)
  private String displayName;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private Role role;

  @Enumerated(EnumType.STRING)
  @Column(name = "user_type", nullable = false)
  private UserType userType;

  @Enumerated(EnumType.STRING)
  @Column(name = "kyc_status", nullable = false)
  private KycStatus kycStatus;
}
```

### ContactInfo

Embeddable or separate entity; OneToOne with `User`. Hold phone, address fields. Apply same Lombok pattern if standalone entity.

---

## T3.2 — Repositories

### File

`modules/user/repository/UserRepository.java`

```java
public interface UserRepository extends JpaRepository<User, UUID> {
  Optional<User> findByExternalId(String externalId);
  boolean existsByEmail(String email);
}
```

---

## T3.3 — Mappers + DTOs

### DTOs — Java records

- `modules/user/dto/UserResponse.java`
- `modules/user/dto/UserUpdateRequest.java` — **PATCH semantics via `JsonNullable<T>`**

```java
public record UserResponse(
  UUID id,
  String email,
  String displayName,
  Role role,
  UserType userType,
  KycStatus kycStatus,
  Instant createdAt,
  Instant updatedAt
) {}

public record UserUpdateRequest(
  @Email JsonNullable<String> email,
  @Size(max = 120) JsonNullable<String> displayName
) {}
```

Bean validation annotations sit directly on record components.

### Mappers — MapStruct (target records natively)

- `modules/user/mapper/UserMapper.java`
- `modules/user/mapper/ContactInfoMapper.java`

```java
@Mapper(componentModel = "spring", nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface UserMapper {
  UserResponse toResponse(User user);

  @BeanMapping(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
  void applyUpdate(UserUpdateRequest req, @MappingTarget User target);

  default String unwrapEmail(JsonNullable<String> v) {
    return v == null || !v.isPresent() ? null : v.get();
  }
}
```

PATCH mapper helper convention: only `isPresent()` values get applied. For "set to null" semantics, downstream service decides — record presence in custom mapper code.

Recommended: hand-write PATCH apply method that inspects `isPresent()` and assigns:

```java
@Mapper(componentModel = "spring")
public abstract class UserMapper {
  public abstract UserResponse toResponse(User user);

  public void applyUpdate(UserUpdateRequest req, User target) {
    if (req.email() != null && req.email().isPresent()) target.setEmail(req.email().get());
    if (req.displayName() != null && req.displayName().isPresent()) target.setDisplayName(req.displayName().get());
  }
}
```

---

## T3.4 — Service: JIT provisioning

### Files

- `modules/user/service/UserService.java`
- `modules/user/service/UserServiceImpl.java`

### Contract

```java
public interface UserService {
  UserResponse findOrProvision(AuthenticatedUser principal);
  UserResponse getMe(AuthenticatedUser principal);
  UserResponse updateMe(AuthenticatedUser principal, UserUpdateRequest req);
}
```

### findOrProvision logic

1. `repo.findByExternalId(principal.subject())` → if present, return mapped
2. Else build `User` from claims (email, displayName from JWT `name` claim, default role `USER`, userType `INDIVIDUAL`, kycStatus `NONE`)
3. Save, return mapped

Wire from `AuthController.me()` (ticket 04) — call on every authenticated request; idempotent after first.

### Done when

- New Keycloak user calls `/api/v1/auth/me` → exactly one row in `users`
- Second call by same user → no new row

---

## T3.5 — Controller + validation

### Files

- `modules/user/controller/UserController.java`
- `modules/user/validation/PhoneValidator.java` (`@Phone`)
- `modules/user/validation/UrlValidator.java` (`@Url`)
- `modules/user/validation/NotFutureYearValidator.java` (`@NotFutureYear`)
- `modules/user/validation/UserValidator.java` (cross-field)

### UserController

```java
@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {
  private final UserService users;

  @GetMapping("/me")
  public UserResponse me(@CurrentUser AuthenticatedUser u) {
    return users.getMe(u);
  }

  @PatchMapping("/me")
  public UserResponse updateMe(
      @CurrentUser AuthenticatedUser u,
      @Valid @RequestBody UserUpdateRequest req) {
    return users.updateMe(u, req);
  }
}
```

Register `JsonNullableModule` in Jackson config so `JsonNullable<T>` deserialization works:

```java
@Configuration
public class JacksonConfig {
  @Bean
  public Module jsonNullableModule() { return new JsonNullableModule(); }
}
```

---

## T3.6 — Tests

### Files

- `modules/user/repository/UserRepositoryTest.java` — `@DataJpaTest` + Testcontainers
- `modules/user/service/UserServiceTest.java` — unit, mocked repo
- `modules/user/controller/UserControllerIntegrationTest.java` — extends `IntegrationTestBase`

### Required test cases

**Repo:**

- `findByExternalId` returns row
- `existsByEmail` works on duplicates

**Service:**

- `findOrProvision` inserts on first call, returns existing on second
- `updateMe` applies present-only fields

**Controller — PATCH semantics (CRITICAL):**

- `{}` → no changes
- `{"email": null}` (i.e. `JsonNullable` set-to-null) → email cleared
- `{"email": "new@x"}` → email updated
- Body missing `displayName` key → displayName untouched
- Body `"displayName": null` → displayName cleared

### Done when

- All tests green against Testcontainers Postgres
- PATCH semantics verified for "absent vs null vs value"

---

## Notes for executor

- DTOs are records — DO NOT add Lombok to them
- Entity equals/hashCode must be ID-only via `@EqualsAndHashCode(onlyExplicitlyIncluded = true)` — Hibernate proxy safety
- `JsonNullableModule` registration is mandatory or Jackson 3 fails on `JsonNullable<T>` deserialization
- DO NOT trust any user-provided `id`/`externalId` from request bodies — those come from `@CurrentUser` only
