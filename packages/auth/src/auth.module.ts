import { Global, Module } from '@nestjs/common';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AdminGuard } from './guards/admin.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { resolveJwtSecret } from './jwt-secret.util';
import { JwtVerifierService } from './jwt-verifier.service';
import { LocalStrategy } from './strategies/local.strategy';
import { OidcStrategy } from './strategies/oidc.strategy';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';

// Only the strategy matching AUTH_MODE is registered. OidcStrategy's constructor
// eagerly validates OIDC_JWKS_URL (jwks-rsa throws synchronously if it's empty), so
// unconditionally registering both would crash app boot under AUTH_MODE=local
// whenever OIDC_JWKS_URL isn't set — the common case.
const ActiveStrategy = process.env.AUTH_MODE === 'oidc' ? OidcStrategy : LocalStrategy;

@Global()
@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as JwtSignOptions['expiresIn'],
      },
    }),
  ],
  controllers: [AuthController, UsersController],
  providers: [UsersService, JwtVerifierService, ActiveStrategy, JwtAuthGuard, AdminGuard],
  exports: [UsersService, JwtVerifierService, JwtAuthGuard, AdminGuard],
})
export class AuthModule {}
