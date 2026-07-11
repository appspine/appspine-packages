import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { McpToolRegistry } from './mcp-tool.registry';

/**
 * Opt-in, best-effort push of this app's tool catalog to the 023 discovery service
 * (dev_docs 023 §2.1, T-9700). Only apps with `DISCOVERY_PUSH_URL` + `DISCOVERY_PUSH_TOKEN`
 * set push anything — every other app is unaffected. Push happens once, at boot: a deploy
 * already restarts the process, so "push at deploy time" (the cadence 023 §2.1 calls for)
 * falls out of `OnApplicationBootstrap` without needing a scheduler dependency. A failed
 * push is logged and swallowed — the discovery catalog is a convenience directory, not a
 * dependency this app's own requests should ever fail on.
 */
@Injectable()
export class DiscoveryPushService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DiscoveryPushService.name);

  constructor(private readonly registry: McpToolRegistry) {}

  async onApplicationBootstrap(): Promise<void> {
    const pushUrl = process.env.DISCOVERY_PUSH_URL;
    const pushToken = process.env.DISCOVERY_PUSH_TOKEN;
    if (!pushUrl || !pushToken) return;

    const publicBaseUrl = process.env.PUBLIC_BASE_URL;
    const body: Record<string, unknown> = {
      toolCatalogSnapshot: this.registry.getCatalogSnapshot(),
    };
    if (publicBaseUrl) {
      body.mcpEndpointUrl = `${publicBaseUrl}/mcp`;
      body.metadataEndpointUrl = `${publicBaseUrl}/metadata/schema`;
    }

    try {
      const res = await fetch(`${pushUrl.replace(/\/$/, '')}/discovery/push`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-discovery-push-token': pushToken },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        this.logger.warn(`Discovery catalog push failed: HTTP ${res.status}`);
        return;
      }
      this.logger.log('Discovery catalog push succeeded');
    } catch (e: unknown) {
      this.logger.warn(`Discovery catalog push failed: ${String(e)}`);
    }
  }
}
