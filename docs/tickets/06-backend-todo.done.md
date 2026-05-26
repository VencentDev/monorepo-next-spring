# 06 — Backend Todo Module (`modules/todo`) — Smoke Test

**Phase:** 4
**Depends on:** 03 (core), 04 (auth), 05 (user — FK reference)
**Unblocks:** 11 (frontend todo UI)

## Scope

Vertical slice exercising the full stack: Lombok entity, MapStruct mappers, record DTOs (PATCH with `JsonNullable`), ownership-scoped queries, paginated controller, cross-user isolation tests.

Purpose: prove the template's auth + persistence + DTO conventions work end-to-end.

---

## T4.1 — Module scaffold

### Files

- `modules/todo/entity/Todo.java`
- `modules/todo/entity/TodoStatus.java` (enum: `TODO`, `IN_PROGRESS`, `DONE`)
- `src/main/resources/db/migration/V2__todo.sql`

### Todo entity (Lombok)

```java
@Entity
@Table(name = "todos")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
@EqualsAndHashCode(callSuper = false, onlyExplicitlyIncluded = true)
public class Todo extends AuditableEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.UUID)
  @EqualsAndHashCode.Include
  private UUID id;

  @Column(name = "owner_id", nullable = false)
  private UUID ownerId;

  @Column(nullable = false, length = 200)
  private String title;

  @Column(columnDefinition = "TEXT")
  private String description;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private TodoStatus status;

  @Column(name = "due_date")
  private LocalDate dueDate;
}
```

### V2\_\_todo.sql

```sql
CREATE TABLE todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  status VARCHAR(32) NOT NULL,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by VARCHAR(255),
  updated_by VARCHAR(255)
);

CREATE INDEX idx_todos_owner_id ON todos(owner_id);
CREATE INDEX idx_todos_owner_status ON todos(owner_id, status);
```

---

## T4.2 — Repository + service

### Files

- `modules/todo/repository/TodoRepository.java`
- `modules/todo/service/TodoService.java`
- `modules/todo/service/TodoServiceImpl.java`

### Repository — every query scoped by ownerId

```java
public interface TodoRepository extends JpaRepository<Todo, UUID> {
  Page<Todo> findByOwnerId(UUID ownerId, Pageable pageable);
  Page<Todo> findByOwnerIdAndStatus(UUID ownerId, TodoStatus status, Pageable pageable);
  Optional<Todo> findByIdAndOwnerId(UUID id, UUID ownerId);
}
```

### Service — ownership enforced on every mutating op

```java
@Service
@RequiredArgsConstructor
@Transactional
public class TodoServiceImpl implements TodoService {
  private final TodoRepository repo;
  private final TodoMapper mapper;
  private final UserService users;

  public TodoResponse update(AuthenticatedUser principal, UUID id, TodoUpdateRequest req) {
    UUID ownerId = users.resolveInternalId(principal);
    Todo todo = repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("todo"));
    if (!todo.getOwnerId().equals(ownerId)) throw new ForbiddenException("not your todo");
    mapper.applyUpdate(req, todo);
    return mapper.toResponse(todo);
  }
  // ... same pattern for delete
}
```

**Rule:** server-side ownership only. NEVER read `ownerId` from request body.

---

## T4.3 — Controller + DTOs

### DTOs — records

```java
public record TodoResponse(
  UUID id, String title, String description,
  TodoStatus status, LocalDate dueDate,
  Instant createdAt, Instant updatedAt
) {}

public record TodoCreateRequest(
  @NotBlank @Size(max = 200) String title,
  @Size(max = 5000) String description,
  @NotNull TodoStatus status,
  LocalDate dueDate
) {}

public record TodoUpdateRequest(
  @Size(max = 200) JsonNullable<String> title,
  @Size(max = 5000) JsonNullable<String> description,
  JsonNullable<TodoStatus> status,
  JsonNullable<LocalDate> dueDate
) {}

public record PageResponse<T>(
  List<T> content,
  int page, int size, long totalElements, int totalPages
) {
  public static <T> PageResponse<T> from(Page<T> p) {
    return new PageResponse<>(p.getContent(), p.getNumber(), p.getSize(), p.getTotalElements(), p.getTotalPages());
  }
}
```

### TodoController

```java
@RestController
@RequestMapping("/api/v1/todos")
@RequiredArgsConstructor
public class TodoController {
  private final TodoService todos;

  @GetMapping
  public PageResponse<TodoResponse> list(
      @CurrentUser AuthenticatedUser u,
      @RequestParam(required = false) TodoStatus status,
      @PageableDefault(size = 20, sort = "dueDate") Pageable pageable) {
    return todos.list(u, status, pageable);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public TodoResponse create(@CurrentUser AuthenticatedUser u, @Valid @RequestBody TodoCreateRequest req) {
    return todos.create(u, req);
  }

  @GetMapping("/{id}")
  public TodoResponse get(@CurrentUser AuthenticatedUser u, @PathVariable UUID id) {
    return todos.get(u, id);
  }

  @PatchMapping("/{id}")
  public TodoResponse update(@CurrentUser AuthenticatedUser u, @PathVariable UUID id,
                             @Valid @RequestBody TodoUpdateRequest req) {
    return todos.update(u, id, req);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@CurrentUser AuthenticatedUser u, @PathVariable UUID id) {
    todos.delete(u, id);
  }
}
```

### Mapper

```java
@Mapper(componentModel = "spring")
public abstract class TodoMapper {
  public abstract TodoResponse toResponse(Todo todo);

  @Mapping(target = "id", ignore = true)
  @Mapping(target = "ownerId", ignore = true)
  public abstract Todo fromCreate(TodoCreateRequest req);

  public void applyUpdate(TodoUpdateRequest req, Todo target) {
    if (req.title() != null && req.title().isPresent()) target.setTitle(req.title().get());
    if (req.description() != null && req.description().isPresent()) target.setDescription(req.description().get());
    if (req.status() != null && req.status().isPresent()) target.setStatus(req.status().get());
    if (req.dueDate() != null && req.dueDate().isPresent()) target.setDueDate(req.dueDate().get());
  }
}
```

---

## T4.4 — Integration tests

### File

`modules/todo/controller/TodoControllerIntegrationTest.java`

### Required cases

1. **CRUD happy path** for one user
2. **Cross-user isolation:**
   - Seed user A and user B (each gets a row via JIT or test setup)
   - User A creates todo T
   - User B `GET /todos` → T not in list
   - User B `GET /todos/{T.id}` → 404 OR 403
   - User B `PATCH /todos/{T.id}` → 403
   - User B `DELETE /todos/{T.id}` → 403
3. **Forged ownerId in body** ignored (since DTO does not include it — verify it's actually absent)
4. **PATCH `JsonNullable` semantics (CRITICAL):**
   - Body `{}` → no field changed
   - Body `{"dueDate": null}` → due_date cleared in DB
   - Body without `dueDate` key → due_date untouched
   - Body `{"dueDate": "2027-01-15"}` → due_date set
5. **Pagination:** seed 25 todos, `?page=0&size=10` → 10 items, totalPages=3

### Test sketch

```java
@Test
void userBCannotPatchUserATodo() throws Exception {
  UUID todoId = createTodoAs("user-a");
  mockMvc.perform(patch("/api/v1/todos/{id}", todoId)
      .with(jwt().jwt(j -> j.subject("user-b").claim("email", "b@x")))
      .contentType(MediaType.APPLICATION_JSON)
      .content("""{"title":"hacked"}"""))
    .andExpect(status().isForbidden());
}
```

### Done when

- All cases green
- Coverage proves: A cannot see, read, modify, or delete B's todos

---

## Notes for executor

- DO NOT add `ownerId` to any request DTO
- DO NOT use `findById` then trust the returned row; always check `ownerId` OR use `findByIdAndOwnerId`
- `@PageableDefault` sort key must match a record/entity field — `dueDate` here
- `PageResponse` wrapper standardizes pagination shape for OpenAPI generation (ticket 07)
