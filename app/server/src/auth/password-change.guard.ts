import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ExtractJwt } from 'passport-jwt';
import type { Request } from 'express';

const ALLOW_WHEN_PASSWORD_CHANGE_REQUIRED = 'allowWhenPasswordChangeRequired';

/** Opts a route out of the global `PasswordChangeGuard` below. */
export const AllowWhenPasswordChangeRequired = () =>
  SetMetadata(ALLOW_WHEN_PASSWORD_CHANGE_REQUIRED, true);

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  mustChangePassword?: boolean;
}

/**
 * Global guard: once a token's `mustChangePassword` claim is true, every
 * route 403s with `{ code: "PASSWORD_CHANGE_REQUIRED" }` except ones marked
 * `@AllowWhenPasswordChangeRequired()` — currently `POST /auth/login`,
 * `PATCH /auth/password`, and `POST /auth/refresh`.
 *
 * Registered via `APP_GUARD`, which Nest runs *before* any controller-level
 * guard — including the `AuthGuard('jwt')` that populates `req.user`. So this
 * decodes the bearer token itself rather than reading `req.user`, and treats
 * a missing/invalid/expired token as "not my problem": it lets the request
 * through and leaves that rejection to `AuthGuard('jwt')` downstream. It only
 * ever blocks a request whose token is valid and unexpired.
 */
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_WHEN_PASSWORD_CHANGE_REQUIRED,
      [context.getHandler(), context.getClass()],
    );
    if (allowed) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
    if (!token) return true;

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      return true;
    }

    if (payload.mustChangePassword) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Change your password before continuing.',
      });
    }

    return true;
  }
}
