import { createHash, randomBytes } from 'node:crypto';
import type { PaginatedResult, PaginationQuery } from '@appspine/common';
import { PrismaService, paginate, toPrismaOrderBy, toPrismaPage } from '@appspine/common';
import { IDENTITY_STORE, type IdentityStorePort } from '@appspine/plugin-api';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { CreateApiKeyDto, CreateApiKeyResponse, RoleRef, UpdateApiKeyDto } from './dto/api-key.dto';

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  roleId: string;
  actingUserId: string | null;
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

// resource:action, e.g. "users:read" — action is read/write/call/*, or the bare wildcard
// "*". "call" was added for dev_docs 025's mcp-gateway aggregator (gateway:call, the
// call_tool meta-tool's requiredScopes) -- a forwarded tool invocation isn't itself a
// read or a write on the gateway's own resources, so neither existing action word fit.
// This is a format-only check; cross-referencing against the app's real scope catalog
// is deferred until @appspine/metadata-schema exists (dev_docs/003).
const SCOPE_PATTERN = /^[a-z0-9_-]+:(read|write|call|\*)$/;

const API_KEY_SELECT = {
  id: true,
  name: true,
  prefix: true,
  roleId: true,
  actingUserId: true,
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
  constructor(
    private readonly prisma: PrismaService,
    /**
     * PL0-04 §1 found this service reading `identity-core`'s `User` table directly to validate an
     * acting user — a cross-owner query the 051 split replaces with the
     * `appspine.identity-store` capability.
     *
     * In Phase 4 transition, this is @Optional() so ApiKeysModule can bootstrap when
     * identity providers are encapsulated in non-global host modules.
     */
    @Optional()
    @Inject(IDENTITY_STORE)
    private readonly identityStore?: IdentityStorePort,
  ) {}

  async create(dto: CreateApiKeyDto, createdBy?: string): Promise<CreateApiKeyResponse> {
    this.validateScopes(dto.scopes);
    if (dto.actingUserId) await this.assertActingUser(dto.actingUserId);

    const raw = KEY_PREFIX + randomBytes(16).toString('hex');
    const hashedKey = createHash('sha256').update(raw).digest('hex');
    const prefix = raw.slice(0, KEY_PREFIX.length + PREFIX_DISPLAY_LENGTH);

    const apiKey = await this.prisma.apiKey.create({
      data: {
        name: dto.name,
        prefix,
        hashedKey,
        roleId: dto.roleId,
        actingUserId: dto.actingUserId ?? null,
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
      actingUserId: apiKey.actingUserId,
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
    if (dto.actingUserId) await this.assertActingUser(dto.actingUserId);

    return this.prisma.apiKey.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.roleId !== undefined && { roleId: dto.roleId }),
        ...(dto.actingUserId !== undefined && { actingUserId: dto.actingUserId }),
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

  private async assertActingUser(actingUserId: string): Promise<void> {
    if (!this.identityStore) {
      throw new BadRequestException('Identity store provider is not available');
    }
    const user = await this.identityStore.findById(actingUserId);
    if (!user) throw new BadRequestException(`Acting user ${actingUserId} not found`);
    if (!user.isServiceAccount) {
      throw new BadRequestException(
        'This account is not marked as a service account and cannot be bound as an API key acting user.',
      );
    }
  }
}
