import { Controller, Post, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, IsNotEmpty, Matches, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { AuthedRequest } from './authed-request';
import { AllowWhenPasswordChangeRequired } from './password-change.guard';

class LoginDto {
  /** Username or email address — see AuthService.login. */
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  // Same floor the coordinator's account-creation forms enforce, plus a
  // letter+digit mix so a forced first change can't just be "12345678".
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'newPassword must contain at least one letter and one number',
  })
  newPassword!: string;
}

// No class-level guard: /auth/login must stay public. The guard goes on the
// individual handler that needs it.
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @AllowWhenPasswordChangeRequired()
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.identifier, dto.password);
  }

  /**
   * Any signed-in user, any role, changing their own password — including a
   * coordinator-issued temporary one on first login, which is why this is
   * exempt from the global `PasswordChangeGuard`: it's the one route that
   * guard's own rejection can never be resolved without.
   */
  @Patch('password')
  @UseGuards(AuthGuard('jwt'))
  @AllowWhenPasswordChangeRequired()
  async changePassword(
    @Req() req: AuthedRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      req.user.userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  /**
   * The sliding-window half of the 30-minute inactivity timeout: the client
   * calls this on real user activity to trade a still-valid token for a fresh
   * 30-minute one (see `AuthService.refresh`). Exempt from
   * `PasswordChangeGuard` so the idle timer that's running on the standalone
   * /change-password page itself doesn't get stuck unable to refresh.
   */
  @Post('refresh')
  @UseGuards(AuthGuard('jwt'))
  @AllowWhenPasswordChangeRequired()
  async refresh(@Req() req: AuthedRequest) {
    return this.authService.refresh(req.user.userId);
  }
}
