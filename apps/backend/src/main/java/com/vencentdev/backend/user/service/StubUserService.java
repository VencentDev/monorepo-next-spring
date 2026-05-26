package com.vencentdev.backend.user.service;

import com.vencentdev.backend.auth.AuthenticatedUser;
import com.vencentdev.backend.user.dto.UserResponse;
import org.springframework.stereotype.Service;

@Service
public class StubUserService implements UserService {

  @Override
  public UserResponse findOrProvision(AuthenticatedUser principal) {
    return new UserResponse(
        null, principal.email(), null, "USER", "INDIVIDUAL", "NONE", null, null);
  }
}
