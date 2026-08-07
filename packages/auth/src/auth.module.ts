import { AuditLogService } from '@appspine/audit-log';
import { Global, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AUTH_AUDIT_LOG } from './auth-audit-log';
import { AdminGuard } from './guards/admin.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtVerifierService } from './jwt-verifier.service';
import { OidcStrategy } from './strategies/oidc.strategy';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';

@Global()
@Module({
  imports: [PassportModule],
  controllers: [AuthController, UsersController],
  providers: [
    UsersService,
    { provide: AUTH_AUDIT_LOG, useExisting: AuditLogService },
    JwtVerifierService,
    OidcStrategy,
    JwtAuthGuard,
    AdminGuard,
  ],
  exports: [UsersService, JwtVerifierService, JwtAuthGuard, AdminGuard],
})
export class AuthModule {}
