import { Global, Module } from '@nestjs/common';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AdminGuard } from './guards/admin.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalStrategy } from './strategies/local.strategy';
import { OidcStrategy } from './strategies/oidc.strategy';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';

/**
 * Both strategies are always registered; JwtAuthGuard picks the one matching
 * AUTH_MODE, so only that one is ever actually invoked at request time.
 */
@Global()
@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-secret',
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as JwtSignOptions['expiresIn'],
      },
    }),
  ],
  controllers: [AuthController, UsersController],
  providers: [UsersService, LocalStrategy, OidcStrategy, JwtAuthGuard, AdminGuard],
  exports: [UsersService, JwtAuthGuard, AdminGuard],
})
export class AuthModule {}
