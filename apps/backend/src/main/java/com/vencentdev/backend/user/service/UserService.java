package com.vencentdev.backend.user.service;

import com.vencentdev.backend.auth.AuthenticatedUser;
import com.vencentdev.backend.user.dto.UserResponse;
import com.vencentdev.backend.user.dto.UserUpdateRequest;

public interface UserService {

  UserResponse findOrProvision(AuthenticatedUser principal);

  UserResponse getMe(AuthenticatedUser principal);

  UserResponse updateMe(AuthenticatedUser principal, UserUpdateRequest request);
}
