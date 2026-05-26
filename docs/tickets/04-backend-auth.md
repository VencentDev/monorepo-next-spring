# 04 — Backend Auth Module (`modules/auth`)

**Phase:** 2
**Depends on:** 02 (Keycloak running), 03 (backend core)
**Unblocks:** 05, 06

## Scope

OAuth2 Resource Server, JWT → roles mapping, `@CurrentUser` resolver, method security, `AuthController` with integration tests.

⚠️ **Verify ALL Spring Security APIs against Spring Security 7 docs (Boot 4 line) — NOT 6.x blog posts.** Builder methods renamed.

---

## T2.1 — Resource Server security config

### Files

- `modules/auth/config/SecurityConfig.java`
- `modules/auth/config/JwtAuthConverter.java`

### SecurityConfig

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

  @Bean
  SecurityFilterChain api(HttpSecurity http, JwtAuthConverter conv) throws Exception {
    http
      .csrf(csrf -> csrf.disable())
      .cors(Customizer.withDefaults())
      .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
      .authorizeHttpRequests(a -> a
        .requestMatchers("/actuator/health", "/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
        .anyRequest().authenticated())
      .oauth2ResourceServer(o -> o.jwt(j -> j.jwtAuthenticationConverter(conv)));
    return http.build();
  }
}
```

### JwtAuthConverter

Maps `realm_access.roles` → `ROLE_*`:

```java
@Component
public class JwtAuthConverter implements Converter<Jwt, AbstractAuthenticationToken> {
  @Override
  public AbstractAuthenticationToken convert(Jwt jwt) {
    Map<String, Object> realmAccess = jwt.getClaim("realm_access");
    Collection<GrantedAuthority> authorities = realmAccess == null ? List.of() :
      ((List<String>) realmAccess.getOrDefault("roles", List.of())).stream()
        .map(r -> new SimpleGrantedAuthority("ROLE_" + r))
        .collect(Collectors.toList());
    return new JwtAuthenticationToken(jwt, authorities, jwt.getSubject());
  }
}
```

### Done when

- Unauthenticated request → 401
- Request with Keycloak-issued token → 200 (on `/api/v1/auth/me`)

---

## T2.2 — Current-user plumbing

### Files

- `modules/auth/CurrentUser.java` — annotation
- `modules/auth/AuthenticatedUser.java` — **record**
- `modules/auth/CurrentUserArgumentResolver.java`
- Register in `WebMvcConfig` (from ticket 03)

### Definitions

```java
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface CurrentUser {}

public record AuthenticatedUser(String subject, String email, Set<String> roles) {}
```

### Resolver

```java
@Component
public class CurrentUserArgumentResolver implements HandlerMethodArgumentResolver {
  @Override
  public boolean supportsParameter(MethodParameter p) {
    return p.hasParameterAnnotation(CurrentUser.class)
      && p.getParameterType().equals(AuthenticatedUser.class);
  }
  @Override
  public Object resolveArgument(MethodParameter p, ModelAndViewContainer m,
                                NativeWebRequest req, WebDataBinderFactory f) {
    var auth = SecurityContextHolder.getContext().getAuthentication();
    if (!(auth instanceof JwtAuthenticationToken t)) return null;
    Jwt jwt = t.getToken();
    Set<String> roles = t.getAuthorities().stream()
      .map(GrantedAuthority::getAuthority)
      .map(s -> s.startsWith("ROLE_") ? s.substring(5) : s)
      .collect(Collectors.toSet());
    return new AuthenticatedUser(jwt.getSubject(), jwt.getClaimAsString("email"), roles);
  }
}
```

### WebMvcConfig update

```java
@Override
public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
  resolvers.add(currentUserArgumentResolver);
}
```

### Done when

- Controller method `me(@CurrentUser AuthenticatedUser u)` returns JWT `sub`

---

## T2.3 — Method security

### Setup

Add `@EnableMethodSecurity` to `SecurityConfig`.

Example admin endpoint (placeholder — real one in user module):

```java
@GetMapping("/api/v1/admin/ping")
@PreAuthorize("hasRole('ADMIN')")
public String adminPing() { return "ok"; }
```

### Done when

- USER-role token → 403 on `/api/v1/admin/ping`
- ADMIN-role token → 200

---

## T2.4 — Auth controller + tests

### Files

- `modules/auth/controller/AuthController.java`
- `src/test/java/.../AuthControllerIntegrationTest.java`
- `src/test/java/.../IntegrationTestBase.java` (Testcontainers Postgres)

### AuthController

```java
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {
  private final UserService users; // ticket 05

  @GetMapping("/me")
  public UserResponse me(@CurrentUser AuthenticatedUser u) {
    return users.findOrProvision(u); // JIT — ticket 05
  }
}
```

NOTE: depends on `UserService.findOrProvision` from ticket 05. If executing in strict order, scaffold returns a stub until 05 lands.

### IntegrationTestBase

```java
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@ActiveProfiles("test")
public abstract class IntegrationTestBase {
  @Container
  static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

  @DynamicPropertySource
  static void props(DynamicPropertyRegistry r) {
    r.add("spring.datasource.url", pg::getJdbcUrl);
    r.add("spring.datasource.username", pg::getUsername);
    r.add("spring.datasource.password", pg::getPassword);
  }
}
```

### Auth test

Use Spring Security test `jwt()` post-processor:

```java
mockMvc.perform(get("/api/v1/auth/me")
    .with(jwt().jwt(j -> j.subject("user-1").claim("email", "u@example.com"))))
  .andExpect(status().isOk())
  .andExpect(jsonPath("$.email").value("u@example.com"));
```

### Done when

- Tests green
- Hitting `/api/v1/auth/me` with real Keycloak token returns the user

---

## Notes for executor

- Verify against **Spring Security 7** — `authorizeHttpRequests`, `requestMatchers` (NOT `antMatchers`)
- CORS: allowed origins come from `app.cors.allowed-origins` env (ticket 03)
- Cross-reference T3.4: JIT provisioning must run BEFORE returning from `/auth/me`
