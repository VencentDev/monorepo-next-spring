package com.vencentdev.backend.user.dto;

import java.time.Instant;
import java.util.UUID;

public record UserResponse(
    UUID id,
    String email,
    String displayName,
    String role,
    String userType,
    String kycStatus,
    Instant createdAt,
    Instant updatedAt) {}
