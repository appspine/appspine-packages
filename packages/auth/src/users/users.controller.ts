import { type PaginationQuery, paginationQuerySchema, ZodValidationPipe } from '@appspine/common';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AdminGuard } from '../guards/admin.guard';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import {
  type CreateUserDto,
  createUserSchema,
  type UpdateRolesDto,
  type UpdateUserDto,
  updateRolesSchema,
  updateUserSchema,
} from './dto/user.dto';
import { UsersService } from './users.service';

// User management is ADMIN-only (AdminGuard).
// If custom roles should manage users in future, switch to PermissionGuard + @RequirePermissions
// (from @appspine/rbac).
@Controller('users')
@UseGuards(JwtAuthGuard, AdminGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async create(@Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserDto) {
    const hashed = await bcrypt.hash(dto.password, 12);
    return this.usersService.create({ ...dto, password: hashed });
  }

  @Get()
  findAll(@Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) dto: UpdateUserDto,
  ) {
    return this.usersService.update(id, dto);
  }

  @Put(':id/roles')
  updateRoles(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRolesSchema)) dto: UpdateRolesDto,
  ) {
    return this.usersService.updateRoles(id, dto.roleIds);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
