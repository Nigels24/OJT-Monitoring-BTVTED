import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { getJwtSecret, SESSION_IDLE_MINUTES } from './jwt.constants';
import { PasswordChangeGuard } from './password-change.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: getJwtSecret(),
        signOptions: { expiresIn: `${SESSION_IDLE_MINUTES}m` },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    // Global: runs on every request, ahead of every controller's own
    // AuthGuard('jwt')/RolesGuard — see PasswordChangeGuard's own comment for
    // why it decodes the token itself instead of reading req.user.
    { provide: APP_GUARD, useClass: PasswordChangeGuard },
  ],
})
export class AuthModule {}
