import { Global, Module } from '@nestjs/common';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AdminGuard } from './guards/admin.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { resolveJwtSecret } from './jwt-secret.util';
import { JwtVerifierService } from './jwt-verifier.service';
import { OidcStrategy } from './strategies/oidc.strategy';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';

// JwtModule/JWT_SECRET are local-auth-only infra now that OidcStrategy is the sole
// strategy (dev_docs/framework/035) — kept registered until T-12645 confirms no other
// consumer needs them (dev_docs/framework/035-task-breakdown.md T-12645).
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
  providers: [UsersService, JwtVerifierService, OidcStrategy, JwtAuthGuard, AdminGuard],
  exports: [UsersService, JwtVerifierService, JwtAuthGuard, AdminGuard],
})
export class AuthModule {}
