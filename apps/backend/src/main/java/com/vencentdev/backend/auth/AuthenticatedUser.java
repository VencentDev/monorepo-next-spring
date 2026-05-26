package com.vencentdev.backend.auth;

import java.util.Set;

public record AuthenticatedUser(String subject, String email, Set<String> roles) {}
