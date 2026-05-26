package com.vencentdev.backend.user.service;

import com.vencentdev.backend.auth.AuthenticatedUser;
import com.vencentdev.backend.user.dto.UserResponse;

public interface UserService {

  UserResponse findOrProvision(AuthenticatedUser principal);
}
