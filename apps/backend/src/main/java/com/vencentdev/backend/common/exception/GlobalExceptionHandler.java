package com.vencentdev.backend.common.exception;

import jakarta.validation.ConstraintViolationException;
import java.time.Instant;
import java.util.List;
import org.slf4j.MDC;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class GlobalExceptionHandler {
  private final Environment environment;

  public GlobalExceptionHandler(Environment environment) {
    this.environment = environment;
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException exception) {
    List<ApiError.FieldError> errors =
        exception.getBindingResult().getFieldErrors().stream()
            .map(error -> new ApiError.FieldError(error.getField(), error.getDefaultMessage()))
            .toList();
    return error(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Validation failed", errors);
  }

  @ExceptionHandler(ConstraintViolationException.class)
  ResponseEntity<ApiError> handleConstraintViolation(ConstraintViolationException exception) {
    List<ApiError.FieldError> errors =
        exception.getConstraintViolations().stream()
            .map(
                violation ->
                    new ApiError.FieldError(
                        violation.getPropertyPath().toString(), violation.getMessage()))
            .toList();
    return error(HttpStatus.BAD_REQUEST, "CONSTRAINT_VIOLATION", "Validation failed", errors);
  }

  @ExceptionHandler(ResourceNotFoundException.class)
  ResponseEntity<ApiError> handleNotFound(ResourceNotFoundException exception) {
    return error(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", exception.getMessage(), List.of());
  }

  @ExceptionHandler(NoResourceFoundException.class)
  ResponseEntity<ApiError> handleNoResourceFound(NoResourceFoundException exception) {
    return error(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", exception.getMessage(), List.of());
  }

  @ExceptionHandler(BadRequestException.class)
  ResponseEntity<ApiError> handleBadRequest(BadRequestException exception) {
    return error(HttpStatus.BAD_REQUEST, "BAD_REQUEST", exception.getMessage(), List.of());
  }

  @ExceptionHandler(ForbiddenException.class)
  ResponseEntity<ApiError> handleForbidden(ForbiddenException exception) {
    return error(HttpStatus.FORBIDDEN, "FORBIDDEN", exception.getMessage(), List.of());
  }

  @ExceptionHandler(ConflictException.class)
  ResponseEntity<ApiError> handleConflict(ConflictException exception) {
    return error(HttpStatus.CONFLICT, "CONFLICT", exception.getMessage(), List.of());
  }

  @ExceptionHandler(AccessDeniedException.class)
  ResponseEntity<ApiError> handleAccessDenied(AccessDeniedException exception) {
    return error(HttpStatus.FORBIDDEN, "ACCESS_DENIED", "Access denied", List.of());
  }

  @ExceptionHandler(AuthenticationException.class)
  ResponseEntity<ApiError> handleAuthentication(AuthenticationException exception) {
    return error(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication required", List.of());
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<ApiError> handleException(Exception exception) {
    String message =
        environment.acceptsProfiles(Profiles.of("prod"))
            ? "Internal server error"
            : exception.getMessage();
    return error(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", message, List.of());
  }

  private ResponseEntity<ApiError> error(
      HttpStatus status, String code, String message, List<ApiError.FieldError> errors) {
    ApiError body =
        new ApiError(status.value(), code, message, MDC.get("traceId"), Instant.now(), errors);
    return ResponseEntity.status(status).body(body);
  }
}
