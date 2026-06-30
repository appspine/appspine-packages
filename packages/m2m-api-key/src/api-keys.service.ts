import { createHash, randomBytes } from 'node:crypto';
import type { PaginatedResult, PaginationQuery } from '@appspine/common';
import { PrismaService, paginate, toPrismaOrderBy, toPrismaPage } from '@appspine/common';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateApiKeyDto, CreateApiKeyResponse, RoleRef, UpdateApiKeyDto } from './dto/api-key.dto';

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  roleId: string;
  role: RoleRef;
  scopes: string[];
  rateLimit: number | null;
  isActive: boolean;
  expiresAt: Date | null;
  createdBy: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const KEY_PREFIX = 'an_live_';
const PREFIX_DISPLAY_LENGTH = 16;
const ALLOWED_SORT_FIELDS = ['name', 'createdAt', 'lastUsedAt', 'expiresAt'] as const;

// resource:action, e.g. "users:read" — action is read/write/*, or the bare wildcard "*".
// This is a format-only check; cross-referencing against the app's real scope catalog
// is deferred until @appspine/metadata-schema exists (dev_docs/003).
const SCOPE_PATTERN = /^[a-z0-9_-]+:(read|write|\*)$/;

const API_KEY_SELECT = {
  id: true,
  name: true,
  prefix: true,
  roleId: true,
  role: { select: { id: true, name: true, displayName: true } },
  scopes: true,
  rateLimit: true,
  isActive: true,
  expiresAt: true,
  createdBy: true,
  lastUsedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateApiKeyDto, createdBy?: string): Promise<CreateApiKeyResponse> {
    this.validateScopes(dto.scopes);

    const raw = KEY_PREFIX + randomBytes(16).toString('hex');
    const hashedKey = createHash('sha256').update(raw).digest('hex');
    const prefix = raw.slice(0, KEY_PREFIX.length + PREFIX_DISPLAY_LENGTH);

    const apiKey = await this.prisma.apiKey.create({
      data: {
        name: dto.name,
        prefix,
        hashedKey,
        roleId: dto.roleId,
        scopes: dto.scopes,
        rateLimit: dto.rateLimit ?? null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdBy: createdBy ?? null,
      },
      select: API_KEY_SELECT,
    });

    return {
      id: apiKey.id,
      key: raw,
      prefix: apiKey.prefix,
      name: apiKey.name,
      roleId: apiKey.roleId,
      role: apiKey.role,
      scopes: apiKey.scopes,
      createdAt: apiKey.createdAt,
    };
  }

  async findAll(query: PaginationQuery): Promise<PaginatedResult<ApiKeyRecord>> {
    const where = query.search
      ? { name: { contains: query.search, mode: 'insensitive' as const } }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.apiKey.findMany({
        where,
        ...toPrismaPage(query),
        orderBy: toPrismaOrderBy(query, ALLOWED_SORT_FIELDS),
        select: API_KEY_SELECT,
      }),
      this.prisma.apiKey.count({ where }),
    ]);

    return paginate(data, total);
  }

  async findOne(id: string): Promise<ApiKeyRecord> {
    const apiKey = await this.prisma.apiKey.findUnique({ where: { id }, select: API_KEY_SELECT });
    if (!apiKey) throw new NotFoundException(`ApiKey ${id} not found`);
    return apiKey;
  }

  async update(id: string, dto: UpdateApiKeyDto): Promise<ApiKeyRecord> {
    await this.findOne(id);
    if (dto.scopes) this.validateScopes(dto.scopes);

    return this.prisma.apiKey.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.roleId !== undefined && { roleId: dto.roleId }),
        ...(dto.scopes !== undefined && { scopes: dto.scopes }),
        ...(dto.rateLimit !== undefined && { rateLimit: dto.rateLimit }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.expiresAt !== undefined && {
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        }),
      },
      select: API_KEY_SELECT,
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.apiKey.delete({ where: { id } });
  }

  private validateScopes(scopes: string[]): void {
    const invalid = scopes.filter((s) => s !== '*' && !SCOPE_PATTERN.test(s));
    if (invalid.length > 0) {
      throw new BadRequestException(`Invalid scopes: ${invalid.join(', ')}`);
    }
  }
}
