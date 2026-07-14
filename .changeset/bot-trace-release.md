---
"@appspine/chatbot-contracts": patch
"@appspine/mcp-server": minor
"@appspine/audit-log": minor
---

Release the 024 shared bot integration packages together.

- Add `@appspine/chatbot-contracts` schemas, generated TypeScript types, validators, and golden fixtures for Chat/n8n ingress, claim, completion, content, attachment, typed action, structured error, and callback contracts.
- Add MCP operation metadata parsing, write-tool fail-closed behavior, scoped idempotency primitives, and the copyable Prisma idempotency fragment export to `@appspine/mcp-server`.
- Add distributed trace audit fields, trace normalization, and the updated copyable Prisma fragment to `@appspine/audit-log`.
