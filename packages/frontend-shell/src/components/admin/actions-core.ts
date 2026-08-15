import type { CreateApiKeyResponse } from './types.js';

export type ApiFetchLike = <T>(path: string, init?: RequestInit) => Promise<T>;

export interface ActionResult {
  error?: string;
}

export interface CreateApiKeyResult extends ActionResult {
  created?: CreateApiKeyResponse;
}

/**
 * Every action below is a try/apiFetch/catch-with-a-fallback-message shape that differed only in
 * the request itself and the fallback text. Centralizing it here means a call site can't forget
 * the catch (as one previously did — see JwtVerifierService's swallowed-error fix earlier this
 * audit round) and keeps each action to just its request body.
 */
async function runAction<T extends ActionResult>(
  isApiError: (e: unknown) => e is { message: string },
  fallbackMessage: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // T is constrained to ActionResult; every concrete T used here only adds optional fields on
    // top of `error` (e.g. CreateApiKeyResult's `created?`), so an ActionResult-shaped object is
    // runtime-safe for all of them — TS can't prove that generically for an arbitrary T, hence
    // the cast.
    return { error: isApiError(err) ? err.message : fallbackMessage } as T;
  }
}

// ==========================================
// Users Actions
// ==========================================

export async function createUserRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  formData: FormData,
): Promise<ActionResult> {
  const roleIds = formData.getAll('roleIds').map(String);
  return runAction(isApiError, 'Failed to create user', async () => {
    await apiFetch('/users', {
      method: 'POST',
      body: JSON.stringify({
        email: formData.get('email'),
        password: formData.get('password'),
        name: formData.get('name') || undefined,
        isServiceAccount: formData.get('isServiceAccount') === 'on',
        roleIds: roleIds.length > 0 ? roleIds : undefined,
      }),
    });
    return {};
  });
}

export async function setUserServiceAccountRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  id: string,
  isServiceAccount: boolean,
): Promise<ActionResult> {
  return runAction(isApiError, 'Failed to update user', async () => {
    await apiFetch(`/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ isServiceAccount }),
    });
    return {};
  });
}

export async function setUserActiveRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  return runAction(isApiError, 'Failed to update user', async () => {
    await apiFetch(`/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    });
    return {};
  });
}

export async function updateUserRolesRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const roleIds = formData.getAll('roleIds').map(String);
  return runAction(isApiError, 'Failed to update roles', async () => {
    await apiFetch(`/users/${encodeURIComponent(id)}/roles`, {
      method: 'PUT',
      body: JSON.stringify({ roleIds }),
    });
    return {};
  });
}

export async function deleteUserRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  id: string,
): Promise<ActionResult> {
  return runAction(isApiError, 'Failed to delete user', async () => {
    await apiFetch(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return {};
  });
}

// ==========================================
// Roles Actions
// ==========================================

export async function createRoleRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  formData: FormData,
): Promise<ActionResult> {
  return runAction(isApiError, 'Failed to create role', async () => {
    await apiFetch('/roles', {
      method: 'POST',
      body: JSON.stringify({
        name: formData.get('name'),
        displayName: formData.get('displayName'),
        permissionPolicy: formData.get('permissionPolicy'),
        permissions: formData.getAll('permissions').map(String),
      }),
    });
    return {};
  });
}

export async function updateRoleRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    displayName: formData.get('displayName'),
    permissionPolicy: formData.get('permissionPolicy'),
  };
  if (formData.get('editablePermissions') === 'true') {
    body.permissions = formData.getAll('permissions').map(String);
  }
  return runAction(isApiError, 'Failed to update role', async () => {
    await apiFetch(`/roles/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return {};
  });
}

export async function deleteRoleRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  id: string,
): Promise<ActionResult> {
  return runAction(isApiError, 'Failed to delete role', async () => {
    await apiFetch(`/roles/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return {};
  });
}

// ==========================================
// API Keys Actions
// ==========================================

export async function createApiKeyRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  formData: FormData,
): Promise<CreateApiKeyResult> {
  const rateLimitRaw = formData.get('rateLimit');
  const expiresAtRaw = formData.get('expiresAt');
  const actingUserIdRaw = formData.get('actingUserId');
  const actingUserId =
    actingUserIdRaw && actingUserIdRaw !== '__none' ? String(actingUserIdRaw) : undefined;

  return runAction<CreateApiKeyResult>(isApiError, 'Failed to create API key', async () => {
    const created = await apiFetch<CreateApiKeyResponse>('/api-keys', {
      method: 'POST',
      body: JSON.stringify({
        name: formData.get('name'),
        roleId: formData.get('roleId'),
        scopes: formData.getAll('scopes').map(String),
        actingUserId,
        rateLimit: rateLimitRaw ? Number(rateLimitRaw) : undefined,
        expiresAt: expiresAtRaw ? new Date(String(expiresAtRaw)).toISOString() : undefined,
      }),
    });
    return { created };
  });
}

export async function updateApiKeyActingUserRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  id: string,
  actingUserId: string | null,
): Promise<ActionResult> {
  return runAction(isApiError, 'Failed to update acting user', async () => {
    await apiFetch(`/api-keys/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ actingUserId }),
    });
    return {};
  });
}

export async function setApiKeyActiveRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  return runAction(isApiError, 'Failed to update API key', async () => {
    await apiFetch(`/api-keys/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    });
    return {};
  });
}

export async function deleteApiKeyRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  id: string,
): Promise<ActionResult> {
  return runAction(isApiError, 'Failed to delete API key', async () => {
    await apiFetch(`/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return {};
  });
}

// ==========================================
// Domain Events Actions
// ==========================================

export async function retryDomainEventDeliveryRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  id: string,
): Promise<ActionResult> {
  return runAction(isApiError, 'Failed to retry delivery', async () => {
    await apiFetch(`/domain-events/deliveries/${encodeURIComponent(id)}/retry`, { method: 'POST' });
    return {};
  });
}

export async function ignoreDomainEventDeliveryRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  id: string,
): Promise<ActionResult> {
  return runAction(isApiError, 'Failed to ignore delivery', async () => {
    await apiFetch(`/domain-events/deliveries/${encodeURIComponent(id)}/ignore`, {
      method: 'POST',
    });
    return {};
  });
}
