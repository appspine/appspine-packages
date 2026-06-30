import { ZodValidationPipe } from '@appspine/common';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Post,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { type LoginDto, loginSchema, type RegisterDto, registerSchema } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { buildUserContext, type RoleWithPermissions } from './user-context.util';
import { UsersService } from './users/users.service';

function buildTokenPayload(user: {
  id: string;
  email: string;
  name?: string | null;
  userRoles: { role: RoleWithPermissions }[];
}) {
  const roles = user.userRoles.map((ur) => ur.role);
  const { roleNames, permissionPolicy, permissions } = buildUserContext(roles);
  const roleName = roleNames.includes('ADMIN') ? 'ADMIN' : roleNames[0] || '';

  return {
    sub: user.id,
    email: user.email,
    name: user.name,
    roleName,
    roleNames,
    permissionPolicy,
    permissions,
  };
}

// register/login only apply under AUTH_MODE=local — under AUTH_MODE=oidc there is no
// local password to check, identity comes from the external IdP (dev_docs 001).
@Controller('auth')
export class AuthController {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('register')
  async register(@Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto) {
    if (process.env.AUTH_MODE === 'oidc') throw new NotFoundException();
    const hashed = await bcrypt.hash(dto.password, 12);
    await this.usersService.create({ email: dto.email, password: hashed, name: dto.name });
    // Reload with role+permissions for JWT signing
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Registration failed');
    const payload = buildTokenPayload(user);
    const token = this.jwtService.sign(payload);
    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, roleNames: payload.roleNames },
    };
  }

  @Post('login')
  async login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto) {
    if (process.env.AUTH_MODE === 'oidc') throw new NotFoundException();
    const user = await this.usersService.findByEmail(dto.email);
    if (!user?.password || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isActive) throw new ForbiddenException('Account is disabled');
    const payload = buildTokenPayload(user);
    const token = this.jwtService.sign(payload);
    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, roleNames: payload.roleNames },
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Request() req: { user: { sub: string; email: string; roleName: string } }) {
    return req.user;
  }
}
