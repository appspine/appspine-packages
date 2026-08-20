---
type: decision
scope: cross-repo
status: active
supersedes: null
superseded_by: null
created: 2026-08-20
updated: 2026-08-20
---

# 051 PL5-13 Deprecation Telemetry & Fleet Consumer Scan Report

> Generated at: 2026-08-20T05:04:43.133Z
> Total legacy usages found across fleet: **389**

## 1. Fleet Summary by Application

| Application | Total Usages | @appspine/auth | frontend-shell UI | m2m-api-key legacy |
|---|---|---|---|---|
| **template** | 8 | 7 | 0 | 1 |
| **wiki** | 51 | 33 | 12 | 6 |
| **calendar** | 27 | 13 | 12 | 2 |
| **chat** | 73 | 51 | 12 | 10 |
| **drive** | 50 | 33 | 12 | 5 |
| **projects** | 61 | 45 | 7 | 9 |
| **approve** | 45 | 27 | 12 | 6 |
| **master-data** | 32 | 20 | 8 | 4 |
| **mcp-gateway** | 42 | 28 | 8 | 6 |

## 2. Legacy Export Breakdown & Recommended Replacements

| Legacy Export | Category | Occurrences | Consumers (Apps) | Recommended Replacement |
|---|---|---|---|---|
| `@appspine/auth -> JwtUser` | `AUTH_PACKAGE` | 52 | approve, calendar, chat, drive, master-data, mcp-gateway, projects, template, wiki | `@appspine/plugin-host-nest` |
| `@appspine/auth -> ApiKeyUser` | `AUTH_PACKAGE` | 51 | approve, calendar, chat, drive, master-data, mcp-gateway, projects, template, wiki | `@appspine/plugin-host-nest` |
| `@appspine/m2m-api-key -> JwtOrApiKeyGuard` | `M2M_DEPRECATED_EXPORT` | 49 | approve, calendar, chat, drive, master-data, mcp-gateway, projects, template, wiki | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| `@appspine/auth -> CurrentUser` | `AUTH_PACKAGE` | 48 | approve, calendar, chat, drive, master-data, mcp-gateway, projects, template, wiki | `@appspine/plugin-host-nest` |
| `@appspine/auth -> resolveActingUserId` | `AUTH_PACKAGE` | 43 | approve, calendar, chat, drive, master-data, mcp-gateway, projects, template, wiki | `@appspine/plugin-host-nest` |
| `@appspine/auth -> SYSTEM_ADMIN_ROLE` | `AUTH_PACKAGE` | 37 | approve, calendar, chat, drive, master-data, mcp-gateway, projects, template, wiki | `@appspine/identity-core` |
| `@appspine/auth -> AuthModule` | `AUTH_PACKAGE` | 10 | approve, calendar, chat, drive, master-data, mcp-gateway, projects, template, wiki | `@appspine/preset-standard (plugin mode) or @appspine/identity-core + @appspine/oidc-auth` |
| `@appspine/auth -> SYSTEM_USER_ROLE` | `AUTH_PACKAGE` | 9 | approve, calendar, chat, drive, master-data, mcp-gateway, projects, template, wiki | `@appspine/identity-core` |
| `@appspine/frontend-shell -> LoginButton` | `FRONTEND_SHELL_CAPABILITY_UI` | 8 | approve, calendar, chat, drive, master-data, mcp-gateway, projects, wiki | `@appspine/oidc-auth/frontend` |
| `@appspine/frontend-shell -> mapAuthErrorKey` | `FRONTEND_SHELL_CAPABILITY_UI` | 8 | approve, calendar, chat, drive, master-data, mcp-gateway, projects, wiki | `@appspine/oidc-auth/frontend` |
| `@appspine/frontend-shell -> ApiKeysTable` | `FRONTEND_SHELL_CAPABILITY_UI` | 8 | approve, calendar, chat, drive, master-data, mcp-gateway, projects, wiki | `@appspine/m2m-api-key/frontend` |
| `@appspine/frontend-shell -> CreateApiKeyDialog` | `FRONTEND_SHELL_CAPABILITY_UI` | 8 | approve, calendar, chat, drive, master-data, mcp-gateway, projects, wiki | `@appspine/m2m-api-key/frontend` |
| `@appspine/frontend-shell -> CreateRoleDialog` | `FRONTEND_SHELL_CAPABILITY_UI` | 8 | approve, calendar, chat, drive, master-data, mcp-gateway, projects, wiki | `@appspine/rbac/frontend` |
| `@appspine/frontend-shell -> RolesTable` | `FRONTEND_SHELL_CAPABILITY_UI` | 8 | approve, calendar, chat, drive, master-data, mcp-gateway, projects, wiki | `@appspine/rbac/frontend` |
| `@appspine/frontend-shell -> UsersTable` | `FRONTEND_SHELL_CAPABILITY_UI` | 8 | approve, calendar, chat, drive, master-data, mcp-gateway, projects, wiki | `@appspine/identity-core/frontend` |
| `@appspine/frontend-shell -> CreateUserDialog` | `FRONTEND_SHELL_CAPABILITY_UI` | 7 | approve, calendar, chat, drive, master-data, mcp-gateway, wiki | `@appspine/identity-core/frontend` |
| `@appspine/auth -> AdminGuard` | `AUTH_PACKAGE` | 6 | master-data, mcp-gateway | `@appspine/identity-core` |
| `@appspine/frontend-shell -> DomainEventDeliveriesPanel` | `FRONTEND_SHELL_CAPABILITY_UI` | 5 | approve, calendar, chat, drive, wiki | `@appspine/domain-events/frontend` |
| `@appspine/frontend-shell -> DomainEventDetailPanel` | `FRONTEND_SHELL_CAPABILITY_UI` | 5 | approve, calendar, chat, drive, wiki | `@appspine/domain-events/frontend` |
| `@appspine/frontend-shell -> DomainEventCatalogTable` | `FRONTEND_SHELL_CAPABILITY_UI` | 5 | approve, calendar, chat, drive, wiki | `@appspine/domain-events/frontend` |
| `@appspine/frontend-shell -> DomainEventsTable` | `FRONTEND_SHELL_CAPABILITY_UI` | 5 | approve, calendar, chat, drive, wiki | `@appspine/domain-events/frontend` |
| `@appspine/auth -> JwtVerifierService` | `AUTH_PACKAGE` | 1 | chat | `@appspine/oidc-auth` |

## 3. Detailed Consumer Evidence Matrix

| App | File | Line | Export | Replacement |
|---|---|---|---|---|
| approve | `backend/prisma/seed.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| approve | `backend/prisma/seed.ts` | L1 | `SYSTEM_USER_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| approve | `backend/src/app.module.ts` | L2 | `AuthModule` (`@appspine/auth`) | `@appspine/preset-standard (plugin mode) or @appspine/identity-core + @appspine/oidc-auth` |
| approve | `backend/src/approval/approval-instances/approval-instances.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/approval/approval-instances/approval-instances.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/approval/approval-instances/approval-instances.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/approval/approval-instances/approval-instances.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/approval/approval-instances/approval-instances.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| approve | `backend/src/domain-events/webhook-subscriptions.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/domain-events/webhook-subscriptions.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/domain-events/webhook-subscriptions.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/domain-events/webhook-subscriptions.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/domain-events/webhook-subscriptions.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| approve | `backend/src/expense-claims/expense-claims.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/expense-claims/expense-claims.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/expense-claims/expense-claims.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/expense-claims/expense-claims.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/expense-claims/expense-claims.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| approve | `backend/src/leave-requests/leave-requests.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/leave-requests/leave-requests.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/leave-requests/leave-requests.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/leave-requests/leave-requests.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/leave-requests/leave-requests.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| approve | `backend/src/notifications/notifications.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/notifications/notifications.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/notifications/notifications.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/notifications/notifications.controller.ts` | L1 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/notifications/notifications.controller.ts` | L3 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| approve | `backend/src/user-delegations/user-delegations.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/user-delegations/user-delegations.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/user-delegations/user-delegations.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/user-delegations/user-delegations.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| approve | `backend/src/user-delegations/user-delegations.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| approve | `frontend/src/app/(external)/login/page.tsx` | L1 | `LoginButton` (`@appspine/frontend-shell`) | `@appspine/oidc-auth/frontend` |
| approve | `frontend/src/app/(external)/login/page.tsx` | L1 | `mapAuthErrorKey` (`@appspine/frontend-shell`) | `@appspine/oidc-auth/frontend` |
| approve | `frontend/src/app/(main)/dashboard/(admin)/api-keys/page.tsx` | L4 | `ApiKeysTable` (`@appspine/frontend-shell`) | `@appspine/m2m-api-key/frontend` |
| approve | `frontend/src/app/(main)/dashboard/(admin)/api-keys/page.tsx` | L4 | `CreateApiKeyDialog` (`@appspine/frontend-shell`) | `@appspine/m2m-api-key/frontend` |
| approve | `frontend/src/app/(main)/dashboard/(admin)/domain-events/[id]/page.tsx` | L3 | `DomainEventDeliveriesPanel` (`@appspine/frontend-shell`) | `@appspine/domain-events/frontend` |
| approve | `frontend/src/app/(main)/dashboard/(admin)/domain-events/[id]/page.tsx` | L3 | `DomainEventDetailPanel` (`@appspine/frontend-shell`) | `@appspine/domain-events/frontend` |
| approve | `frontend/src/app/(main)/dashboard/(admin)/domain-events/catalog/page.tsx` | L1 | `DomainEventCatalogTable` (`@appspine/frontend-shell`) | `@appspine/domain-events/frontend` |
| approve | `frontend/src/app/(main)/dashboard/(admin)/domain-events/page.tsx` | L3 | `DomainEventsTable` (`@appspine/frontend-shell`) | `@appspine/domain-events/frontend` |
| approve | `frontend/src/app/(main)/dashboard/(admin)/roles/page.tsx` | L4 | `CreateRoleDialog` (`@appspine/frontend-shell`) | `@appspine/rbac/frontend` |
| approve | `frontend/src/app/(main)/dashboard/(admin)/roles/page.tsx` | L4 | `RolesTable` (`@appspine/frontend-shell`) | `@appspine/rbac/frontend` |
| approve | `frontend/src/app/(main)/dashboard/(admin)/users/page.tsx` | L4 | `CreateUserDialog` (`@appspine/frontend-shell`) | `@appspine/identity-core/frontend` |
| approve | `frontend/src/app/(main)/dashboard/(admin)/users/page.tsx` | L4 | `UsersTable` (`@appspine/frontend-shell`) | `@appspine/identity-core/frontend` |
| calendar | `backend/prisma/seed.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| calendar | `backend/prisma/seed.ts` | L1 | `SYSTEM_USER_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| calendar | `backend/src/app.module.ts` | L2 | `AuthModule` (`@appspine/auth`) | `@appspine/preset-standard (plugin mode) or @appspine/identity-core + @appspine/oidc-auth` |
| calendar | `backend/src/calendars/calendars.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| calendar | `backend/src/calendars/calendars.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| calendar | `backend/src/calendars/calendars.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| calendar | `backend/src/calendars/calendars.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| calendar | `backend/src/calendars/calendars.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| calendar | `backend/src/calendars/calendars.service.ts` | L3 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| calendar | `backend/src/events/events.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| calendar | `backend/src/events/events.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| calendar | `backend/src/events/events.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| calendar | `backend/src/events/events.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| calendar | `backend/src/events/events.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| calendar | `backend/src/events/events.service.ts` | L3 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| calendar | `frontend/src/app/(external)/login/page.tsx` | L1 | `LoginButton` (`@appspine/frontend-shell`) | `@appspine/oidc-auth/frontend` |
| calendar | `frontend/src/app/(external)/login/page.tsx` | L1 | `mapAuthErrorKey` (`@appspine/frontend-shell`) | `@appspine/oidc-auth/frontend` |
| calendar | `frontend/src/app/(main)/dashboard/(admin)/api-keys/page.tsx` | L4 | `ApiKeysTable` (`@appspine/frontend-shell`) | `@appspine/m2m-api-key/frontend` |
| calendar | `frontend/src/app/(main)/dashboard/(admin)/api-keys/page.tsx` | L4 | `CreateApiKeyDialog` (`@appspine/frontend-shell`) | `@appspine/m2m-api-key/frontend` |
| calendar | `frontend/src/app/(main)/dashboard/(admin)/domain-events/[id]/page.tsx` | L3 | `DomainEventDeliveriesPanel` (`@appspine/frontend-shell`) | `@appspine/domain-events/frontend` |
| calendar | `frontend/src/app/(main)/dashboard/(admin)/domain-events/[id]/page.tsx` | L3 | `DomainEventDetailPanel` (`@appspine/frontend-shell`) | `@appspine/domain-events/frontend` |
| calendar | `frontend/src/app/(main)/dashboard/(admin)/domain-events/catalog/page.tsx` | L1 | `DomainEventCatalogTable` (`@appspine/frontend-shell`) | `@appspine/domain-events/frontend` |
| calendar | `frontend/src/app/(main)/dashboard/(admin)/domain-events/page.tsx` | L3 | `DomainEventsTable` (`@appspine/frontend-shell`) | `@appspine/domain-events/frontend` |
| calendar | `frontend/src/app/(main)/dashboard/(admin)/roles/page.tsx` | L4 | `CreateRoleDialog` (`@appspine/frontend-shell`) | `@appspine/rbac/frontend` |
| calendar | `frontend/src/app/(main)/dashboard/(admin)/roles/page.tsx` | L4 | `RolesTable` (`@appspine/frontend-shell`) | `@appspine/rbac/frontend` |
| calendar | `frontend/src/app/(main)/dashboard/(admin)/users/page.tsx` | L4 | `CreateUserDialog` (`@appspine/frontend-shell`) | `@appspine/identity-core/frontend` |
| calendar | `frontend/src/app/(main)/dashboard/(admin)/users/page.tsx` | L4 | `UsersTable` (`@appspine/frontend-shell`) | `@appspine/identity-core/frontend` |
| chat | `backend/prisma/seed.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| chat | `backend/prisma/seed.ts` | L1 | `SYSTEM_USER_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| chat | `backend/src/app.module.ts` | L2 | `AuthModule` (`@appspine/auth`) | `@appspine/preset-standard (plugin mode) or @appspine/identity-core + @appspine/oidc-auth` |
| chat | `backend/src/chat/attachments/attachments.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/attachments/attachments.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/attachments/attachments.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/attachments/attachments.controller.ts` | L1 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/attachments/attachments.controller.ts` | L2 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| chat | `backend/src/chat/attachments/attachments.service.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| chat | `backend/src/chat/channels/channel-members.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/channels/channel-members.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/channels/channel-members.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/channels/channel-members.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/channels/channel-members.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| chat | `backend/src/chat/channels/channel-members.service.ts` | L3 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| chat | `backend/src/chat/channels/channels.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/channels/channels.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/channels/channels.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/channels/channels.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/channels/channels.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| chat | `backend/src/chat/channels/channels.service.ts` | L3 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| chat | `backend/src/chat/chat.gateway.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/chat.gateway.ts` | L1 | `JwtVerifierService` (`@appspine/auth`) | `@appspine/oidc-auth` |
| chat | `backend/src/chat/chat.gateway.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| chat | `backend/src/chat/chat.module.ts` | L1 | `AuthModule` (`@appspine/auth`) | `@appspine/preset-standard (plugin mode) or @appspine/identity-core + @appspine/oidc-auth` |
| chat | `backend/src/chat/dms/dms.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/dms/dms.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/dms/dms.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/dms/dms.controller.ts` | L1 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/dms/dms.controller.ts` | L3 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| chat | `backend/src/chat/messages/messages.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/messages/messages.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/messages/messages.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/messages/messages.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/messages/messages.controller.ts` | L2 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| chat | `backend/src/chat/messages/messages.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| chat | `backend/src/chat/reactions/reactions.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/reactions/reactions.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/reactions/reactions.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/reactions/reactions.controller.ts` | L1 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/reactions/reactions.controller.ts` | L3 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| chat | `backend/src/chat/read-state/read-state.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/read-state/read-state.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/read-state/read-state.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/read-state/read-state.controller.ts` | L1 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/read-state/read-state.controller.ts` | L3 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| chat | `backend/src/chat/webhooks/webhooks.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/webhooks/webhooks.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/webhooks/webhooks.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/webhooks/webhooks.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/chat/webhooks/webhooks.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| chat | `backend/src/push/push.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/push/push.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/push/push.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/push/push.controller.ts` | L1 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/push/push.controller.ts` | L3 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| chat | `backend/src/users/user-directory.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/users/user-directory.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/users/user-directory.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/users/user-directory.controller.ts` | L1 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| chat | `backend/src/users/user-directory.controller.ts` | L2 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| chat | `frontend/src/app/(external)/login/page.tsx` | L1 | `LoginButton` (`@appspine/frontend-shell`) | `@appspine/oidc-auth/frontend` |
| chat | `frontend/src/app/(external)/login/page.tsx` | L1 | `mapAuthErrorKey` (`@appspine/frontend-shell`) | `@appspine/oidc-auth/frontend` |
| chat | `frontend/src/app/(main)/dashboard/(admin)/api-keys/page.tsx` | L4 | `ApiKeysTable` (`@appspine/frontend-shell`) | `@appspine/m2m-api-key/frontend` |
| chat | `frontend/src/app/(main)/dashboard/(admin)/api-keys/page.tsx` | L4 | `CreateApiKeyDialog` (`@appspine/frontend-shell`) | `@appspine/m2m-api-key/frontend` |
| chat | `frontend/src/app/(main)/dashboard/(admin)/domain-events/[id]/page.tsx` | L3 | `DomainEventDeliveriesPanel` (`@appspine/frontend-shell`) | `@appspine/domain-events/frontend` |
| chat | `frontend/src/app/(main)/dashboard/(admin)/domain-events/[id]/page.tsx` | L3 | `DomainEventDetailPanel` (`@appspine/frontend-shell`) | `@appspine/domain-events/frontend` |
| chat | `frontend/src/app/(main)/dashboard/(admin)/domain-events/catalog/page.tsx` | L1 | `DomainEventCatalogTable` (`@appspine/frontend-shell`) | `@appspine/domain-events/frontend` |
| chat | `frontend/src/app/(main)/dashboard/(admin)/domain-events/page.tsx` | L3 | `DomainEventsTable` (`@appspine/frontend-shell`) | `@appspine/domain-events/frontend` |
| chat | `frontend/src/app/(main)/dashboard/(admin)/roles/page.tsx` | L4 | `CreateRoleDialog` (`@appspine/frontend-shell`) | `@appspine/rbac/frontend` |
| chat | `frontend/src/app/(main)/dashboard/(admin)/roles/page.tsx` | L4 | `RolesTable` (`@appspine/frontend-shell`) | `@appspine/rbac/frontend` |
| chat | `frontend/src/app/(main)/dashboard/(admin)/users/page.tsx` | L4 | `CreateUserDialog` (`@appspine/frontend-shell`) | `@appspine/identity-core/frontend` |
| chat | `frontend/src/app/(main)/dashboard/(admin)/users/page.tsx` | L4 | `UsersTable` (`@appspine/frontend-shell`) | `@appspine/identity-core/frontend` |
| drive | `backend/prisma/seed.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| drive | `backend/prisma/seed.ts` | L1 | `SYSTEM_USER_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| drive | `backend/src/app.module.ts` | L2 | `AuthModule` (`@appspine/auth`) | `@appspine/preset-standard (plugin mode) or @appspine/identity-core + @appspine/oidc-auth` |
| drive | `backend/src/drive/files/files.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/drive/files/files.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/drive/files/files.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/drive/files/files.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/drive/files/files.controller.ts` | L2 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| drive | `backend/src/drive/files/files.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| drive | `backend/src/drive/files/files.mcp.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| drive | `backend/src/drive/folders/folders.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/drive/folders/folders.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/drive/folders/folders.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/drive/folders/folders.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/drive/folders/folders.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| drive | `backend/src/drive/folders/folders.mcp.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| drive | `backend/src/drive/shares/shares.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/drive/shares/shares.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/drive/shares/shares.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/drive/shares/shares.controller.ts` | L1 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/drive/shares/shares.controller.ts` | L3 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| drive | `backend/src/spaces/guards/space-member.guard.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/spaces/guards/space-member.guard.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/spaces/guards/space-member.guard.ts` | L1 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/spaces/guards/space-member.guard.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| drive | `backend/src/spaces/spaces.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/spaces/spaces.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/spaces/spaces.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/spaces/spaces.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/spaces/spaces.controller.ts` | L2 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| drive | `backend/src/spaces/spaces.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| drive | `backend/src/spaces/spaces.mcp.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| drive | `backend/src/wopi/wopi.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/wopi/wopi.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/wopi/wopi.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/wopi/wopi.controller.ts` | L1 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| drive | `backend/src/wopi/wopi.controller.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| drive | `backend/src/wopi/wopi.controller.ts` | L3 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| drive | `frontend/src/app/(external)/login/page.tsx` | L1 | `LoginButton` (`@appspine/frontend-shell`) | `@appspine/oidc-auth/frontend` |
| drive | `frontend/src/app/(external)/login/page.tsx` | L1 | `mapAuthErrorKey` (`@appspine/frontend-shell`) | `@appspine/oidc-auth/frontend` |
| drive | `frontend/src/app/(main)/dashboard/(admin)/api-keys/page.tsx` | L4 | `ApiKeysTable` (`@appspine/frontend-shell`) | `@appspine/m2m-api-key/frontend` |
| drive | `frontend/src/app/(main)/dashboard/(admin)/api-keys/page.tsx` | L4 | `CreateApiKeyDialog` (`@appspine/frontend-shell`) | `@appspine/m2m-api-key/frontend` |
| drive | `frontend/src/app/(main)/dashboard/(admin)/domain-events/[id]/page.tsx` | L3 | `DomainEventDeliveriesPanel` (`@appspine/frontend-shell`) | `@appspine/domain-events/frontend` |
| drive | `frontend/src/app/(main)/dashboard/(admin)/domain-events/[id]/page.tsx` | L3 | `DomainEventDetailPanel` (`@appspine/frontend-shell`) | `@appspine/domain-events/frontend` |
| drive | `frontend/src/app/(main)/dashboard/(admin)/domain-events/catalog/page.tsx` | L1 | `DomainEventCatalogTable` (`@appspine/frontend-shell`) | `@appspine/domain-events/frontend` |
| drive | `frontend/src/app/(main)/dashboard/(admin)/domain-events/page.tsx` | L3 | `DomainEventsTable` (`@appspine/frontend-shell`) | `@appspine/domain-events/frontend` |
| drive | `frontend/src/app/(main)/dashboard/(admin)/roles/page.tsx` | L4 | `CreateRoleDialog` (`@appspine/frontend-shell`) | `@appspine/rbac/frontend` |
| drive | `frontend/src/app/(main)/dashboard/(admin)/roles/page.tsx` | L4 | `RolesTable` (`@appspine/frontend-shell`) | `@appspine/rbac/frontend` |
| drive | `frontend/src/app/(main)/dashboard/(admin)/users/page.tsx` | L4 | `CreateUserDialog` (`@appspine/frontend-shell`) | `@appspine/identity-core/frontend` |
| drive | `frontend/src/app/(main)/dashboard/(admin)/users/page.tsx` | L4 | `UsersTable` (`@appspine/frontend-shell`) | `@appspine/identity-core/frontend` |
| master-data | `backend/prisma/seed.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| master-data | `backend/prisma/seed.ts` | L1 | `SYSTEM_USER_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| master-data | `backend/src/app.module.ts` | L2 | `AuthModule` (`@appspine/auth`) | `@appspine/preset-standard (plugin mode) or @appspine/identity-core + @appspine/oidc-auth` |
| master-data | `backend/src/delegations/delegations.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| master-data | `backend/src/delegations/delegations.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| master-data | `backend/src/delegations/delegations.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| master-data | `backend/src/delegations/delegations.controller.ts` | L1 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| master-data | `backend/src/delegations/delegations.controller.ts` | L3 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| master-data | `backend/src/domain-events/webhook-subscriptions.controller.ts` | L2 | `AdminGuard` (`@appspine/auth`) | `@appspine/identity-core` |
| master-data | `backend/src/domain-events/webhook-subscriptions.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| master-data | `backend/src/domain-events/webhook-subscriptions.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| master-data | `backend/src/domain-events/webhook-subscriptions.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| master-data | `backend/src/domain-events/webhook-subscriptions.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| master-data | `backend/src/domain-events/webhook-subscriptions.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| master-data | `backend/src/org-units/org-units.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| master-data | `backend/src/org-units/org-units.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| master-data | `backend/src/org-units/org-units.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| master-data | `backend/src/org-units/org-units.controller.ts` | L1 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| master-data | `backend/src/org-units/org-units.controller.ts` | L3 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| master-data | `backend/src/user-profiles/user-profiles.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| master-data | `backend/src/user-profiles/user-profiles.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| master-data | `backend/src/user-profiles/user-profiles.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| master-data | `backend/src/user-profiles/user-profiles.controller.ts` | L1 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| master-data | `backend/src/user-profiles/user-profiles.controller.ts` | L3 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| master-data | `frontend/src/app/(external)/login/page.tsx` | L1 | `LoginButton` (`@appspine/frontend-shell`) | `@appspine/oidc-auth/frontend` |
| master-data | `frontend/src/app/(external)/login/page.tsx` | L1 | `mapAuthErrorKey` (`@appspine/frontend-shell`) | `@appspine/oidc-auth/frontend` |
| master-data | `frontend/src/app/(main)/dashboard/(admin)/api-keys/page.tsx` | L4 | `ApiKeysTable` (`@appspine/frontend-shell`) | `@appspine/m2m-api-key/frontend` |
| master-data | `frontend/src/app/(main)/dashboard/(admin)/api-keys/page.tsx` | L4 | `CreateApiKeyDialog` (`@appspine/frontend-shell`) | `@appspine/m2m-api-key/frontend` |
| master-data | `frontend/src/app/(main)/dashboard/(admin)/roles/page.tsx` | L4 | `CreateRoleDialog` (`@appspine/frontend-shell`) | `@appspine/rbac/frontend` |
| master-data | `frontend/src/app/(main)/dashboard/(admin)/roles/page.tsx` | L4 | `RolesTable` (`@appspine/frontend-shell`) | `@appspine/rbac/frontend` |
| master-data | `frontend/src/app/(main)/dashboard/(admin)/users/page.tsx` | L4 | `CreateUserDialog` (`@appspine/frontend-shell`) | `@appspine/identity-core/frontend` |
| master-data | `frontend/src/app/(main)/dashboard/(admin)/users/page.tsx` | L4 | `UsersTable` (`@appspine/frontend-shell`) | `@appspine/identity-core/frontend` |
| mcp-gateway | `backend/prisma/seed.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| mcp-gateway | `backend/prisma/seed.ts` | L1 | `SYSTEM_USER_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| mcp-gateway | `backend/src/app.module.ts` | L2 | `AuthModule` (`@appspine/auth`) | `@appspine/preset-standard (plugin mode) or @appspine/identity-core + @appspine/oidc-auth` |
| mcp-gateway | `backend/src/discovery/discovery.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| mcp-gateway | `backend/src/discovery/discovery.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| mcp-gateway | `backend/src/discovery/discovery.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| mcp-gateway | `backend/src/discovery/discovery.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| mcp-gateway | `backend/src/discovery/discovery.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| mcp-gateway | `backend/src/dlp/dlp-rule.controller.ts` | L2 | `AdminGuard` (`@appspine/auth`) | `@appspine/identity-core` |
| mcp-gateway | `backend/src/dlp/dlp-rule.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| mcp-gateway | `backend/src/dlp/dlp-rule.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| mcp-gateway | `backend/src/dlp/dlp-rule.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| mcp-gateway | `backend/src/dlp/dlp-rule.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| mcp-gateway | `backend/src/dlp/dlp-rule.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| mcp-gateway | `backend/src/gateway-profile/gateway-profile-api-key.controller.ts` | L2 | `AdminGuard` (`@appspine/auth`) | `@appspine/identity-core` |
| mcp-gateway | `backend/src/gateway-profile/gateway-profile-api-key.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| mcp-gateway | `backend/src/gateway-profile/gateway-profile-api-key.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| mcp-gateway | `backend/src/gateway-profile/gateway-profile-api-key.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| mcp-gateway | `backend/src/gateway-profile/gateway-profile-api-key.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| mcp-gateway | `backend/src/gateway-profile/gateway-profile-api-key.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| mcp-gateway | `backend/src/gateway-profile/gateway-profile.controller.ts` | L2 | `AdminGuard` (`@appspine/auth`) | `@appspine/identity-core` |
| mcp-gateway | `backend/src/gateway-profile/gateway-profile.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| mcp-gateway | `backend/src/gateway-profile/gateway-profile.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| mcp-gateway | `backend/src/gateway-profile/gateway-profile.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| mcp-gateway | `backend/src/gateway-profile/gateway-profile.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| mcp-gateway | `backend/src/gateway-profile/gateway-profile.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| mcp-gateway | `backend/src/gateway/gateway-audit-log.controller.ts` | L1 | `AdminGuard` (`@appspine/auth`) | `@appspine/identity-core` |
| mcp-gateway | `backend/src/gateway/gateway-audit-log.controller.ts` | L3 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| mcp-gateway | `backend/src/vault/vaulted-app-key.controller.ts` | L2 | `AdminGuard` (`@appspine/auth`) | `@appspine/identity-core` |
| mcp-gateway | `backend/src/vault/vaulted-app-key.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| mcp-gateway | `backend/src/vault/vaulted-app-key.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| mcp-gateway | `backend/src/vault/vaulted-app-key.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| mcp-gateway | `backend/src/vault/vaulted-app-key.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| mcp-gateway | `backend/src/vault/vaulted-app-key.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| mcp-gateway | `frontend/src/app/(external)/login/page.tsx` | L1 | `LoginButton` (`@appspine/frontend-shell`) | `@appspine/oidc-auth/frontend` |
| mcp-gateway | `frontend/src/app/(external)/login/page.tsx` | L1 | `mapAuthErrorKey` (`@appspine/frontend-shell`) | `@appspine/oidc-auth/frontend` |
| mcp-gateway | `frontend/src/app/(main)/dashboard/(admin)/api-keys/page-content.tsx` | L6 | `ApiKeysTable` (`@appspine/frontend-shell`) | `@appspine/m2m-api-key/frontend` |
| mcp-gateway | `frontend/src/app/(main)/dashboard/(admin)/api-keys/page-content.tsx` | L6 | `CreateApiKeyDialog` (`@appspine/frontend-shell`) | `@appspine/m2m-api-key/frontend` |
| mcp-gateway | `frontend/src/app/(main)/dashboard/(admin)/roles/page-content.tsx` | L6 | `CreateRoleDialog` (`@appspine/frontend-shell`) | `@appspine/rbac/frontend` |
| mcp-gateway | `frontend/src/app/(main)/dashboard/(admin)/roles/page-content.tsx` | L6 | `RolesTable` (`@appspine/frontend-shell`) | `@appspine/rbac/frontend` |
| mcp-gateway | `frontend/src/app/(main)/dashboard/(admin)/users/page-content.tsx` | L6 | `CreateUserDialog` (`@appspine/frontend-shell`) | `@appspine/identity-core/frontend` |
| mcp-gateway | `frontend/src/app/(main)/dashboard/(admin)/users/page-content.tsx` | L6 | `UsersTable` (`@appspine/frontend-shell`) | `@appspine/identity-core/frontend` |
| projects | `backend/prisma/seed.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| projects | `backend/prisma/seed.ts` | L1 | `SYSTEM_USER_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| projects | `backend/src/app.module.ts` | L2 | `AuthModule` (`@appspine/auth`) | `@appspine/preset-standard (plugin mode) or @appspine/identity-core + @appspine/oidc-auth` |
| projects | `backend/src/notifications/notifications.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/notifications/notifications.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/notifications/notifications.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/notifications/notifications.controller.ts` | L1 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/notifications/notifications.controller.ts` | L3 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| projects | `backend/src/preferences/preferences.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/preferences/preferences.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/preferences/preferences.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/preferences/preferences.controller.ts` | L1 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/preferences/preferences.controller.ts` | L3 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| projects | `backend/src/projects/access/project-access.guard.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/access/project-access.guard.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/access/project-access.service.ts` | L1 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/access/project-access.service.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| projects | `backend/src/projects/board/project-board.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/board/project-board.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/board/project-board.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/board/project-board.controller.ts` | L3 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| projects | `backend/src/projects/board/project-board.service.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| projects | `backend/src/projects/comments/project-comments.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/comments/project-comments.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/comments/project-comments.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/comments/project-comments.controller.ts` | L3 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| projects | `backend/src/projects/comments/project-comments.service.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| projects | `backend/src/projects/common/projects-permission.guard.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| projects | `backend/src/projects/labels/project-label.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/labels/project-label.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/labels/project-label.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/labels/project-label.controller.ts` | L3 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| projects | `backend/src/projects/labels/project-label.service.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| projects | `backend/src/projects/members/project-members.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/members/project-members.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/members/project-members.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/members/project-members.controller.ts` | L3 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| projects | `backend/src/projects/members/project-members.service.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| projects | `backend/src/projects/projects/projects.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/projects/projects.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/projects/projects.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/projects/projects.controller.ts` | L3 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| projects | `backend/src/projects/projects/projects.service.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/projects/projects.service.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/projects/projects.service.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| projects | `backend/src/projects/tasks/project-tasks.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/tasks/project-tasks.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/tasks/project-tasks.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/tasks/project-tasks.controller.ts` | L3 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| projects | `backend/src/projects/tasks/project-tasks.service.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| projects | `backend/src/projects/tasks/tasks.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/tasks/tasks.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/tasks/tasks.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| projects | `backend/src/projects/tasks/tasks.controller.ts` | L3 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| projects | `frontend/src/app/(external)/login/page.tsx` | L1 | `LoginButton` (`@appspine/frontend-shell`) | `@appspine/oidc-auth/frontend` |
| projects | `frontend/src/app/(external)/login/page.tsx` | L1 | `mapAuthErrorKey` (`@appspine/frontend-shell`) | `@appspine/oidc-auth/frontend` |
| projects | `frontend/src/app/(main)/dashboard/(admin)/api-keys/page.tsx` | L4 | `ApiKeysTable` (`@appspine/frontend-shell`) | `@appspine/m2m-api-key/frontend` |
| projects | `frontend/src/app/(main)/dashboard/(admin)/api-keys/page.tsx` | L4 | `CreateApiKeyDialog` (`@appspine/frontend-shell`) | `@appspine/m2m-api-key/frontend` |
| projects | `frontend/src/app/(main)/dashboard/(admin)/roles/page.tsx` | L4 | `CreateRoleDialog` (`@appspine/frontend-shell`) | `@appspine/rbac/frontend` |
| projects | `frontend/src/app/(main)/dashboard/(admin)/roles/page.tsx` | L4 | `RolesTable` (`@appspine/frontend-shell`) | `@appspine/rbac/frontend` |
| projects | `frontend/src/app/(main)/dashboard/(admin)/users/page.tsx` | L4 | `UsersTable` (`@appspine/frontend-shell`) | `@appspine/identity-core/frontend` |
| template | `backend/prisma/seed.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| template | `backend/prisma/seed.ts` | L1 | `SYSTEM_USER_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| template | `backend/src/app.module.ts` | L2 | `AuthModule` (`@appspine/auth`) | `@appspine/preset-standard (plugin mode) or @appspine/identity-core + @appspine/oidc-auth` |
| template | `backend/src/notifications/notifications.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| template | `backend/src/notifications/notifications.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| template | `backend/src/notifications/notifications.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| template | `backend/src/notifications/notifications.controller.ts` | L1 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| template | `backend/src/notifications/notifications.controller.ts` | L3 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| wiki | `backend/prisma/seed.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| wiki | `backend/prisma/seed.ts` | L1 | `SYSTEM_USER_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| wiki | `backend/src/app.module.ts` | L2 | `AuthModule` (`@appspine/auth`) | `@appspine/preset-standard (plugin mode) or @appspine/identity-core + @appspine/oidc-auth` |
| wiki | `backend/src/attachments/attachments.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/attachments/attachments.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/attachments/attachments.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/attachments/attachments.controller.ts` | L1 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/attachments/attachments.controller.ts` | L2 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| wiki | `backend/src/attachments/attachments.service.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| wiki | `backend/src/pages/pages.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/pages/pages.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/pages/pages.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/pages/pages.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/pages/pages.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| wiki | `backend/src/pages/pages.service.ts` | L3 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| wiki | `backend/src/pages/trash.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/pages/trash.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/pages/trash.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/pages/trash.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/pages/trash.controller.ts` | L2 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| wiki | `backend/src/pages/trash.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| wiki | `backend/src/search/search.controller.ts` | L1 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/search/search.controller.ts` | L1 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/search/search.controller.ts` | L1 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/search/search.controller.ts` | L1 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/search/search.controller.ts` | L2 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| wiki | `backend/src/search/search.service.ts` | L1 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| wiki | `backend/src/spaces/space-members.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/spaces/space-members.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/spaces/space-members.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/spaces/space-members.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/spaces/space-members.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| wiki | `backend/src/spaces/space-members.service.ts` | L3 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| wiki | `backend/src/spaces/spaces.controller.ts` | L2 | `ApiKeyUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/spaces/spaces.controller.ts` | L2 | `CurrentUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/spaces/spaces.controller.ts` | L2 | `JwtUser` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/spaces/spaces.controller.ts` | L2 | `resolveActingUserId` (`@appspine/auth`) | `@appspine/plugin-host-nest` |
| wiki | `backend/src/spaces/spaces.controller.ts` | L4 | `JwtOrApiKeyGuard` (`@appspine/m2m-api-key`) | `@appspine/plugin-host-nest's AppspineAuthGuard` |
| wiki | `backend/src/spaces/spaces.service.ts` | L3 | `SYSTEM_ADMIN_ROLE` (`@appspine/auth`) | `@appspine/identity-core` |
| wiki | `frontend/src/app/(external)/login/page.tsx` | L1 | `LoginButton` (`@appspine/frontend-shell`) | `@appspine/oidc-auth/frontend` |
| wiki | `frontend/src/app/(external)/login/page.tsx` | L1 | `mapAuthErrorKey` (`@appspine/frontend-shell`) | `@appspine/oidc-auth/frontend` |
| wiki | `frontend/src/app/(main)/dashboard/(admin)/api-keys/page.tsx` | L4 | `ApiKeysTable` (`@appspine/frontend-shell`) | `@appspine/m2m-api-key/frontend` |
| wiki | `frontend/src/app/(main)/dashboard/(admin)/api-keys/page.tsx` | L4 | `CreateApiKeyDialog` (`@appspine/frontend-shell`) | `@appspine/m2m-api-key/frontend` |
| wiki | `frontend/src/app/(main)/dashboard/(admin)/domain-events/[id]/page.tsx` | L3 | `DomainEventDeliveriesPanel` (`@appspine/frontend-shell`) | `@appspine/domain-events/frontend` |
| wiki | `frontend/src/app/(main)/dashboard/(admin)/domain-events/[id]/page.tsx` | L3 | `DomainEventDetailPanel` (`@appspine/frontend-shell`) | `@appspine/domain-events/frontend` |
| wiki | `frontend/src/app/(main)/dashboard/(admin)/domain-events/catalog/page.tsx` | L1 | `DomainEventCatalogTable` (`@appspine/frontend-shell`) | `@appspine/domain-events/frontend` |
| wiki | `frontend/src/app/(main)/dashboard/(admin)/domain-events/page.tsx` | L3 | `DomainEventsTable` (`@appspine/frontend-shell`) | `@appspine/domain-events/frontend` |
| wiki | `frontend/src/app/(main)/dashboard/(admin)/roles/page.tsx` | L4 | `CreateRoleDialog` (`@appspine/frontend-shell`) | `@appspine/rbac/frontend` |
| wiki | `frontend/src/app/(main)/dashboard/(admin)/roles/page.tsx` | L4 | `RolesTable` (`@appspine/frontend-shell`) | `@appspine/rbac/frontend` |
| wiki | `frontend/src/app/(main)/dashboard/(admin)/users/page.tsx` | L4 | `CreateUserDialog` (`@appspine/frontend-shell`) | `@appspine/identity-core/frontend` |
| wiki | `frontend/src/app/(main)/dashboard/(admin)/users/page.tsx` | L4 | `UsersTable` (`@appspine/frontend-shell`) | `@appspine/identity-core/frontend` |
