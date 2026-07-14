#!/usr/bin/env node
// Builds the golden valid/invalid fixtures under fixtures/<schema>/{valid,invalid}/*.json.
// Fixtures are checked into git as the actual test input; this script exists
// only so the many UUID/hash/timestamp constants stay consistent across
// fixtures instead of being hand-typed 40+ times. Re-run after a schema
// change and review the diff like any other generated-but-committed file.
//
// Fixture instances intentionally do NOT carry a `$comment`/`_description`
// property: every schema here sets `additionalProperties: false` at the
// object level being tested, so any extra property — including a would-be
// documentation field — makes the fixture invalid for the wrong reason and
// masks whether the *intended* violation actually triggers. Explanations
// live in the comments/names below instead.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, '..', 'fixtures');

const uuid = (n) => `${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
const sha256 = (n) => n.repeat(64);
const TEST_DOMAIN = 'https://chat.internal.example';

const RUN_ID = uuid('1');
const REQUEST_ID = uuid('2');
const DEPLOYMENT_ID = uuid('3');
const BOT_ID = uuid('4');
const CHANNEL_ID = uuid('5');
const THREAD_ID = uuid('6');
const ROOT_MESSAGE_ID = uuid('7');
const MESSAGE_ID = uuid('8');
const MESSAGE_REVISION_ID = uuid('9');
const ACTOR_ID = uuid('a');
const USER_ID = uuid('b');
const ATTACHMENT_ID = uuid('c');
const ACTION_ID = uuid('d');
const ACTION_EVENT_ID = uuid('e');
const EXECUTION_ID = 'exec-0001';
const TIME_1 = '2026-07-13T12:00:00.000Z';
const TIME_2 = '2026-07-13T12:10:00.000Z';
const CAPABILITY_CLAIM = 'claim-cap-0123456789abcdef';
const CAPABILITY_COMPLETION = 'completion-cap-0123456789abcdef';

const validContextManifest = {
  schemaVersion: '1.0.0',
  threadId: THREAD_ID,
  rootMessageId: ROOT_MESSAGE_ID,
  cutoffMessageId: MESSAGE_ID,
  messageRefs: [
    { messageId: ROOT_MESSAGE_ID, revisionId: uuid('f'), sequence: 0 },
    { messageId: MESSAGE_ID, revisionId: MESSAGE_REVISION_ID, sequence: 1 },
  ],
  summaryRevision: null,
  summarizedThroughMessageId: null,
  attachmentRefs: [],
  locale: 'zh-TW',
  timezone: 'Asia/Taipei',
  generatedAt: TIME_1,
  manifestHash: sha256('a'),
};

const validAttachmentManifest = {
  schemaVersion: '1.0.0',
  attachmentId: ATTACHMENT_ID,
  runId: RUN_ID,
  direction: 'INPUT',
  status: 'READY',
  mimeType: 'image/png',
  sizeBytes: 1024,
  checksumSha256: sha256('b'),
  capability: 'attachment-cap-0123456789abcdef',
  expiresAt: TIME_2,
  fileName: 'screenshot.png',
};

const validDeployment = {
  deploymentId: DEPLOYMENT_ID,
  workflowKey: 'wf-support-bot',
  workflowRevision: 'rev-7',
  wrapperRevision: 'wrapper-3',
  contractVersion: '1.0.0',
  declaredModelProvider: 'anthropic',
  declaredModel: 'claude-sonnet-5',
};

const fixtures = {
  'ingress-request': {
    valid: {
      basic: {
        schemaVersion: '1.0.0',
        requestId: REQUEST_ID,
        runId: RUN_ID,
        deployment: validDeployment,
        botId: BOT_ID,
        channelId: CHANNEL_ID,
        threadId: THREAD_ID,
        rootMessageId: ROOT_MESSAGE_ID,
        trigger: { kind: 'MESSAGE', messageId: MESSAGE_ID, messageRevisionId: MESSAGE_REVISION_ID },
        source: { actorId: ACTOR_ID, userId: USER_ID, origin: 'USER_UI' },
        requestTime: TIME_1,
        timezone: 'Asia/Taipei',
        locale: 'zh-TW',
        contextManifest: validContextManifest,
        contextHash: sha256('a'),
        attachments: [validAttachmentManifest],
        capabilities: { claim: CAPABILITY_CLAIM, completion: CAPABILITY_COMPLETION },
        deadlineAt: TIME_2,
      },
      'action-trigger': {
        schemaVersion: '1.0.0',
        requestId: REQUEST_ID,
        runId: RUN_ID,
        deployment: validDeployment,
        botId: BOT_ID,
        channelId: CHANNEL_ID,
        threadId: THREAD_ID,
        rootMessageId: ROOT_MESSAGE_ID,
        trigger: { kind: 'ACTION', actionEventId: ACTION_EVENT_ID, actionId: ACTION_ID },
        source: { actorId: ACTOR_ID, userId: USER_ID, origin: 'USER_UI' },
        requestTime: TIME_1,
        timezone: 'UTC',
        locale: 'en',
        contextManifest: validContextManifest,
        contextHash: sha256('a'),
        capabilities: { claim: CAPABILITY_CLAIM, completion: CAPABILITY_COMPLETION },
        deadlineAt: TIME_2,
      },
    },
    invalid: {
      // origin must be exactly USER_UI; CHAT_BOT can never be a trigger origin
      'machine-origin-rejected': {
        schemaVersion: '1.0.0',
        requestId: REQUEST_ID,
        runId: RUN_ID,
        deployment: validDeployment,
        botId: BOT_ID,
        channelId: CHANNEL_ID,
        threadId: THREAD_ID,
        rootMessageId: ROOT_MESSAGE_ID,
        trigger: { kind: 'MESSAGE', messageId: MESSAGE_ID, messageRevisionId: MESSAGE_REVISION_ID },
        source: { actorId: ACTOR_ID, userId: USER_ID, origin: 'CHAT_BOT' },
        requestTime: TIME_1,
        timezone: 'Asia/Taipei',
        locale: 'zh-TW',
        contextManifest: validContextManifest,
        contextHash: sha256('a'),
        capabilities: { claim: CAPABILITY_CLAIM, completion: CAPABILITY_COMPLETION },
        deadlineAt: TIME_2,
      },
      // MCP origin must never trigger a bot
      'mcp-origin-rejected': {
        schemaVersion: '1.0.0',
        requestId: REQUEST_ID,
        runId: RUN_ID,
        deployment: validDeployment,
        botId: BOT_ID,
        channelId: CHANNEL_ID,
        threadId: THREAD_ID,
        rootMessageId: ROOT_MESSAGE_ID,
        trigger: { kind: 'MESSAGE', messageId: MESSAGE_ID, messageRevisionId: MESSAGE_REVISION_ID },
        source: { actorId: ACTOR_ID, userId: USER_ID, origin: 'MCP' },
        requestTime: TIME_1,
        timezone: 'Asia/Taipei',
        locale: 'zh-TW',
        contextManifest: validContextManifest,
        contextHash: sha256('a'),
        capabilities: { claim: CAPABILITY_CLAIM, completion: CAPABILITY_COMPLETION },
        deadlineAt: TIME_2,
      },
      'unknown-additional-property': {
        schemaVersion: '1.0.0',
        requestId: REQUEST_ID,
        runId: RUN_ID,
        deployment: validDeployment,
        botId: BOT_ID,
        channelId: CHANNEL_ID,
        threadId: THREAD_ID,
        rootMessageId: ROOT_MESSAGE_ID,
        trigger: { kind: 'MESSAGE', messageId: MESSAGE_ID, messageRevisionId: MESSAGE_REVISION_ID },
        source: { actorId: ACTOR_ID, userId: USER_ID, origin: 'USER_UI' },
        requestTime: TIME_1,
        timezone: 'Asia/Taipei',
        locale: 'zh-TW',
        contextManifest: validContextManifest,
        contextHash: sha256('a'),
        capabilities: { claim: CAPABILITY_CLAIM, completion: CAPABILITY_COMPLETION },
        deadlineAt: TIME_2,
        rawPrompt: 'this field does not exist in the schema',
      },
      'missing-required-context-hash': {
        schemaVersion: '1.0.0',
        requestId: REQUEST_ID,
        runId: RUN_ID,
        deployment: validDeployment,
        botId: BOT_ID,
        channelId: CHANNEL_ID,
        threadId: THREAD_ID,
        rootMessageId: ROOT_MESSAGE_ID,
        trigger: { kind: 'MESSAGE', messageId: MESSAGE_ID, messageRevisionId: MESSAGE_REVISION_ID },
        source: { actorId: ACTOR_ID, userId: USER_ID, origin: 'USER_UI' },
        requestTime: TIME_1,
        timezone: 'Asia/Taipei',
        locale: 'zh-TW',
        contextManifest: validContextManifest,
        capabilities: { claim: CAPABILITY_CLAIM, completion: CAPABILITY_COMPLETION },
        deadlineAt: TIME_2,
      },
      'bad-hash-format': {
        schemaVersion: '1.0.0',
        requestId: REQUEST_ID,
        runId: RUN_ID,
        deployment: validDeployment,
        botId: BOT_ID,
        channelId: CHANNEL_ID,
        threadId: THREAD_ID,
        rootMessageId: ROOT_MESSAGE_ID,
        trigger: { kind: 'MESSAGE', messageId: MESSAGE_ID, messageRevisionId: MESSAGE_REVISION_ID },
        source: { actorId: ACTOR_ID, userId: USER_ID, origin: 'USER_UI' },
        requestTime: TIME_1,
        timezone: 'Asia/Taipei',
        locale: 'zh-TW',
        contextManifest: validContextManifest,
        contextHash: 'not-a-sha256-hash',
        capabilities: { claim: CAPABILITY_CLAIM, completion: CAPABILITY_COMPLETION },
        deadlineAt: TIME_2,
      },
    },
  },

  'ingress-acceptance': {
    valid: {
      accepted: { schemaVersion: '1.0.0', requestId: REQUEST_ID, runId: RUN_ID, accepted: true },
      rejected: {
        schemaVersion: '1.0.0',
        requestId: REQUEST_ID,
        runId: RUN_ID,
        accepted: false,
        rejectionReason: 'contractVersion 2.0.0 is not supported by this deployment',
      },
    },
    invalid: {
      'rejected-missing-reason': {
        schemaVersion: '1.0.0',
        requestId: REQUEST_ID,
        runId: RUN_ID,
        accepted: false,
      },
      'unknown-property': {
        schemaVersion: '1.0.0',
        requestId: REQUEST_ID,
        runId: RUN_ID,
        accepted: true,
        executionId: 'should-not-be-here',
      },
    },
  },

  'claim-request': {
    valid: {
      basic: {
        schemaVersion: '1.0.0',
        requestId: REQUEST_ID,
        runId: RUN_ID,
        executionId: EXECUTION_ID,
        deploymentId: DEPLOYMENT_ID,
        claimedAt: TIME_1,
      },
    },
    invalid: {
      'missing-execution-id': {
        schemaVersion: '1.0.0',
        requestId: REQUEST_ID,
        runId: RUN_ID,
        deploymentId: DEPLOYMENT_ID,
        claimedAt: TIME_1,
      },
      'bad-run-id-uuid': {
        schemaVersion: '1.0.0',
        requestId: REQUEST_ID,
        runId: 'not-a-uuid',
        executionId: EXECUTION_ID,
        deploymentId: DEPLOYMENT_ID,
        claimedAt: TIME_1,
      },
    },
  },

  'claim-response': {
    valid: {
      claimed: { schemaVersion: '1.0.0', runId: RUN_ID, status: 'CLAIMED', deadlineAt: TIME_2 },
      'already-claimed': {
        schemaVersion: '1.0.0',
        runId: RUN_ID,
        status: 'ALREADY_CLAIMED',
        deadlineAt: TIME_2,
        reason: 'a prior execution already claimed this run',
      },
    },
    invalid: {
      'not-claimed-missing-reason': {
        schemaVersion: '1.0.0',
        runId: RUN_ID,
        status: 'EXPIRED',
        deadlineAt: TIME_2,
      },
      'unknown-status-enum-value': {
        schemaVersion: '1.0.0',
        runId: RUN_ID,
        status: 'MAYBE',
        deadlineAt: TIME_2,
        reason: 'x',
      },
    },
  },

  completion: {
    valid: {
      succeeded: {
        schemaVersion: '1.0.0',
        requestId: REQUEST_ID,
        runId: RUN_ID,
        deploymentId: DEPLOYMENT_ID,
        executionId: EXECUTION_ID,
        status: 'SUCCEEDED',
        replyText: 'Here is the answer.',
        contentParts: {
          schemaVersion: '1.0.0',
          parts: [{ type: 'text', text: 'Here is the answer.' }],
        },
        attachmentIds: [ATTACHMENT_ID],
        summaryUpdate: {
          revision: 2,
          summarizedThroughMessageId: MESSAGE_ID,
          text: 'Summary so far.',
        },
        usage: { toolCallCount: 1, modelCallCount: 1, promptTokens: 500, completionTokens: 120 },
        digest: sha256('d'),
        completedAt: TIME_2,
      },
      failed: {
        schemaVersion: '1.0.0',
        requestId: REQUEST_ID,
        runId: RUN_ID,
        deploymentId: DEPLOYMENT_ID,
        executionId: EXECUTION_ID,
        status: 'FAILED',
        replyText: 'The bot could not complete this request.',
        error: {
          schemaVersion: '1.0.0',
          code: 'WORKFLOW_OR_MODEL_FAILURE',
          message: 'The model provider returned a 500 error.',
          retryable: true,
        },
        digest: sha256('e'),
        completedAt: TIME_2,
      },
    },
    invalid: {
      // oneOf(succeeded, failed) rejects mixing `error` into a SUCCEEDED result
      'succeeded-with-error-field': {
        schemaVersion: '1.0.0',
        requestId: REQUEST_ID,
        runId: RUN_ID,
        deploymentId: DEPLOYMENT_ID,
        executionId: EXECUTION_ID,
        status: 'SUCCEEDED',
        replyText: 'ok',
        error: {
          schemaVersion: '1.0.0',
          code: 'WORKFLOW_OR_MODEL_FAILURE',
          message: 'should not be allowed alongside SUCCEEDED',
          retryable: false,
        },
        digest: sha256('d'),
        completedAt: TIME_2,
      },
      'failed-missing-error': {
        schemaVersion: '1.0.0',
        requestId: REQUEST_ID,
        runId: RUN_ID,
        deploymentId: DEPLOYMENT_ID,
        executionId: EXECUTION_ID,
        status: 'FAILED',
        replyText: 'failed with no structured error',
        digest: sha256('e'),
        completedAt: TIME_2,
      },
      'unknown-error-code': {
        schemaVersion: '1.0.0',
        requestId: REQUEST_ID,
        runId: RUN_ID,
        deploymentId: DEPLOYMENT_ID,
        executionId: EXECUTION_ID,
        status: 'FAILED',
        replyText: 'x',
        error: {
          schemaVersion: '1.0.0',
          code: 'SOMETHING_MADE_UP',
          message: 'x',
          retryable: false,
        },
        digest: sha256('e'),
        completedAt: TIME_2,
      },
    },
  },

  'context-manifest': {
    valid: {
      basic: validContextManifest,
      'with-summary': {
        ...validContextManifest,
        summaryRevision: 3,
        summarizedThroughMessageId: MESSAGE_ID,
      },
    },
    invalid: {
      'empty-message-refs': {
        ...validContextManifest,
        messageRefs: [],
      },
      'bad-manifest-hash': {
        ...validContextManifest,
        manifestHash: 'ZZZZ-not-hex',
      },
    },
  },

  'attachment-manifest': {
    valid: {
      basic: validAttachmentManifest,
    },
    invalid: {
      'bad-mime-type': { ...validAttachmentManifest, mimeType: 'not a mime type' },
      oversize: { ...validAttachmentManifest, sizeBytes: 999999999999 },
      'unknown-status': { ...validAttachmentManifest, status: 'UPLOADING' },
    },
  },

  'content-parts': {
    valid: {
      'text-and-link': {
        schemaVersion: '1.0.0',
        parts: [
          { type: 'text', text: 'See the link below.' },
          { type: 'link', url: `${TEST_DOMAIN}/docs/report`, label: 'Report' },
        ],
      },
      'action-and-card': {
        schemaVersion: '1.0.0',
        parts: [
          {
            type: 'tool_result_card',
            title: 'Calendar event created',
            fields: [{ label: 'Title', value: 'Team sync' }],
          },
          { type: 'action', actionId: ACTION_ID, label: 'Undo', style: 'DESTRUCTIVE' },
        ],
      },
    },
    invalid: {
      // type must be one of the allowlisted discriminators; html is not one of them
      'raw-html-not-representable': {
        schemaVersion: '1.0.0',
        parts: [{ type: 'html', markup: '<script>alert(1)</script>' }],
      },
      'non-https-link': {
        schemaVersion: '1.0.0',
        parts: [{ type: 'link', url: 'http://chat.internal.example/insecure', label: 'x' }],
      },
      'empty-parts': {
        schemaVersion: '1.0.0',
        parts: [],
      },
    },
  },

  'typed-action': {
    valid: {
      confirm: {
        schemaVersion: '1.0.0',
        actionEventId: ACTION_EVENT_ID,
        actionId: ACTION_ID,
        actionType: 'CONFIRM',
        threadId: THREAD_ID,
        botId: BOT_ID,
        actorId: ACTOR_ID,
        clientNonce: 'nonce-0001',
        payload: {},
        createdAt: TIME_1,
      },
      'form-submit': {
        schemaVersion: '1.0.0',
        actionEventId: ACTION_EVENT_ID,
        actionId: ACTION_ID,
        actionType: 'FORM_SUBMIT',
        threadId: THREAD_ID,
        botId: BOT_ID,
        actorId: ACTOR_ID,
        clientNonce: 'nonce-0002',
        payload: { fields: { title: 'Team sync', allDay: false, attendees: 3 } },
        createdAt: TIME_1,
      },
    },
    invalid: {
      'unknown-action-type': {
        schemaVersion: '1.0.0',
        actionEventId: ACTION_EVENT_ID,
        actionId: ACTION_ID,
        actionType: 'DELETE_EVERYTHING',
        threadId: THREAD_ID,
        botId: BOT_ID,
        actorId: ACTOR_ID,
        clientNonce: 'nonce-0003',
        payload: {},
        createdAt: TIME_1,
      },
      // actionType CONFIRM's variant only allows an empty payload, not a `fields` object
      'payload-does-not-match-action-type': {
        schemaVersion: '1.0.0',
        actionEventId: ACTION_EVENT_ID,
        actionId: ACTION_ID,
        actionType: 'CONFIRM',
        threadId: THREAD_ID,
        botId: BOT_ID,
        actorId: ACTOR_ID,
        clientNonce: 'nonce-0004',
        payload: { fields: { x: 1 } },
        createdAt: TIME_1,
      },
    },
  },

  'structured-error': {
    valid: {
      basic: {
        schemaVersion: '1.0.0',
        code: 'MCP_IDEMPOTENCY_CONFLICT',
        message: 'A different request hash was seen for this operationId.',
        retryable: false,
        details: { toolName: 'calendar.createEvent', operationId: 'op-123' },
      },
    },
    invalid: {
      'unknown-error-code': {
        schemaVersion: '1.0.0',
        code: 'NOT_A_REAL_CODE',
        message: 'x',
        retryable: false,
      },
      // details values must be scalar, never a nested raw payload object
      'raw-payload-in-details': {
        schemaVersion: '1.0.0',
        code: 'MCP_DOMAIN_ERROR',
        message: 'x',
        retryable: false,
        details: { rawToolResult: { nested: 'object not allowed here' } },
      },
    },
  },

  'callback-challenge': {
    valid: {
      basic: {
        schemaVersion: '1.0.0',
        deploymentId: DEPLOYMENT_ID,
        challengeToken: 'challenge-cap-0123456789abcdef',
        issuedAt: TIME_1,
        expiresAt: TIME_2,
      },
    },
    invalid: {
      'missing-expiry': {
        schemaVersion: '1.0.0',
        deploymentId: DEPLOYMENT_ID,
        challengeToken: 'challenge-cap-0123456789abcdef',
        issuedAt: TIME_1,
      },
      'token-too-short': {
        schemaVersion: '1.0.0',
        deploymentId: DEPLOYMENT_ID,
        challengeToken: 'short',
        issuedAt: TIME_1,
        expiresAt: TIME_2,
      },
    },
  },
};

rmSync(fixturesDir, { recursive: true, force: true });
for (const [schemaName, groups] of Object.entries(fixtures)) {
  for (const [group, files] of Object.entries(groups)) {
    const dir = path.join(fixturesDir, schemaName, group);
    mkdirSync(dir, { recursive: true });
    for (const [fileName, content] of Object.entries(files)) {
      writeFileSync(path.join(dir, `${fileName}.json`), `${JSON.stringify(content, null, 2)}\n`);
    }
  }
}

console.log(`fixtures written under ${path.relative(process.cwd(), fixturesDir)}`);
