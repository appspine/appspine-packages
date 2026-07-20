export interface AuditMeta {
  actingApiKeyId: string | null;
  isAiOperation?: boolean;
  mcpTool?: string | null;
  workflowId?: string | null;
}

export type AuditActor = {
  sub: string;
  email?: string | null;
  isApiKey?: boolean;
};

export function buildAuditMeta(user: AuditActor): AuditMeta {
  return {
    actingApiKeyId: user.isApiKey === true ? user.sub : null,
  };
}
