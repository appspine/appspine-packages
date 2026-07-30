import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

// Identity comes from the external IdP under OIDC-only auth (dev_docs/framework/035) —
// there is no local register/login path.
@Controller('auth')
export class AuthController {
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Request() req: { user: { sub: string; email: string; roleName: string } }) {
    return req.user;
  }
}
