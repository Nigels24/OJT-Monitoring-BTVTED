import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

interface SessionUser {
  id: string;
  email: string;
  username: string | null;
  name: string;
  role: string;
  mustChangePassword: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * Signs a token and shapes the `user` object shared by `login`, `refresh`,
   * and `changePassword`'s responses. `mustChangePassword` is carried both as
   * a JWT claim (read by the global `PasswordChangeGuard`, without a DB
   * round-trip on every request) and on the returned `user` (read by the
   * client to route to /change-password).
   */
  private async issueSession(user: SessionUser) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  /**
   * `identifier` is a username or an email address.
   *
   * Coordinators issue usernames to students and supervisors, but accounts
   * created before usernames existed only have an email, so both are accepted.
   * Usernames are barred from containing "@" (see CreateStudentDto), which is
   * what stops one account's username from shadowing another's email.
   */
  async login(identifier: string, password: string) {
    const user = await this.prisma.client.user.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }],
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid username or password');
    }

    return this.issueSession(user);
  }

  /**
   * Issues a fresh 30-minute token for the caller's own account — the
   * sliding-window half of the inactivity timeout (`SESSION_IDLE_MINUTES`).
   * `AuthGuard('jwt')` already rejects an expired token before this runs, so
   * reaching here means the caller held a still-valid session; there is no
   * refresh-token table, this just re-signs.
   *
   * Re-reads the user row (rather than trusting the old token's claims) so a
   * password reset or role change made while the tab was idle is reflected in
   * the new token instead of being carried forward stale.
   */
  async refresh(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new UnauthorizedException('Account not found');
    }
    return this.issueSession(user);
  }

  /**
   * Changes the signed-in user's own password — both the voluntary flow (the
   * Sidebar's Change Password dialog) and the forced first-login flow (the
   * standalone /change-password page), which is why this always clears
   * `mustChangePassword` rather than only doing so conditionally: whichever
   * flow it came from, the password is no longer the coordinator-issued
   * temporary one once this succeeds.
   *
   * Requires the current password even though the caller already holds a valid
   * JWT: the token proves the session, not that the person at the keyboard is
   * the account owner. Without this check, an unattended logged-in browser is
   * enough to lock the real owner out.
   *
   * Returns a fresh token/user, matching `login`'s shape: the old token's
   * `mustChangePassword` claim is now stale, and the forced-change page needs
   * a token that passes `PasswordChangeGuard` to reach the role's dashboard
   * without a full re-login.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new UnauthorizedException('Account not found');
    }

    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (await bcrypt.compare(newPassword, user.password)) {
      throw new BadRequestException(
        'New password must be different from the current one',
      );
    }

    const updated = await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        password: await bcrypt.hash(newPassword, 10),
        mustChangePassword: false,
      },
    });

    return this.issueSession(updated);
  }
}
