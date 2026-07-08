import type { CreateApiKeyResponse } from './types.js';

export type ApiFetchLike = <T>(path: string, init?: RequestInit) => Promise<T>;

export interface ActionResult {
  error?: string;
}

export interface CreateApiKeyResult extends ActionResult {
  created?: CreateApiKeyResponse;
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
  try {
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
  } catch (err) {
    return { error: isApiError(err) ? err.message : 'Failed to create user' };
  }
  return {};
}

export async function setUserServiceAccountRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  id: string,
  isServiceAccount: boolean,
): Promise<ActionResult> {
  try {
    await apiFetch(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isServiceAccount }),
    });
  } catch (err) {
    return { error: isApiError(err) ? err.message : 'Failed to update user' };
  }
  return {};
}

export async function setUserActiveRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  try {
    await apiFetch(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    });
  } catch (err) {
    return { error: isApiError(err) ? err.message : 'Failed to update user' };
  }
  return {};
}

export async function updateUserRolesRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const roleIds = formData.getAll('roleIds').map(String);
  try {
    await apiFetch(`/users/${id}/roles`, {
      method: 'PUT',
      body: JSON.stringify({ roleIds }),
    });
  } catch (err) {
    return { error: isApiError(err) ? err.message : 'Failed to update roles' };
  }
  return {};
}

export async function deleteUserRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  id: string,
): Promise<ActionResult> {
  try {
    await apiFetch(`/users/${id}`, { method: 'DELETE' });
  } catch (err) {
    return { error: isApiError(err) ? err.message : 'Failed to delete user' };
  }
  return {};
}

// ==========================================
// Roles Actions
// ==========================================

export async function createRoleRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  formData: FormData,
): Promise<ActionResult> {
  try {
    await apiFetch('/roles', {
      method: 'POST',
      body: JSON.stringify({
        name: formData.get('name'),
        displayName: formData.get('displayName'),
        permissionPolicy: formData.get('permissionPolicy'),
        permissions: formData.getAll('permissions').map(String),
      }),
    });
  } catch (err) {
    return { error: isApiError(err) ? err.message : 'Failed to create role' };
  }
  return {};
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
  try {
    await apiFetch(`/roles/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  } catch (err) {
    return { error: isApiError(err) ? err.message : 'Failed to update role' };
  }
  return {};
}

export async function deleteRoleRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  id: string,
): Promise<ActionResult> {
  try {
    await apiFetch(`/roles/${id}`, { method: 'DELETE' });
  } catch (err) {
    return { error: isApiError(err) ? err.message : 'Failed to delete role' };
  }
  return {};
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

  try {
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
  } catch (err) {
    return { error: isApiError(err) ? err.message : 'Failed to create API key' };
  }
}

export async function updateApiKeyActingUserRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  id: string,
  actingUserId: string | null,
): Promise<ActionResult> {
  try {
    await apiFetch(`/api-keys/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ actingUserId }),
    });
  } catch (err) {
    return { error: isApiError(err) ? err.message : 'Failed to update acting user' };
  }
  return {};
}

export async function setApiKeyActiveRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  try {
    await apiFetch(`/api-keys/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) });
  } catch (err) {
    return { error: isApiError(err) ? err.message : 'Failed to update API key' };
  }
  return {};
}

export async function deleteApiKeyRequest(
  apiFetch: ApiFetchLike,
  isApiError: (e: unknown) => e is { message: string },
  id: string,
): Promise<ActionResult> {
  try {
    await apiFetch(`/api-keys/${id}`, { method: 'DELETE' });
  } catch (err) {
    return { error: isApiError(err) ? err.message : 'Failed to delete API key' };
  }
  return {};
}
