import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authApi } from '../../src/api/endpoints/auth';
import { apiKeysApi } from '../../src/api/endpoints/apiKeys';
import { linksApi } from '../../src/api/endpoints/links';
import { analyticsApi } from '../../src/api/endpoints/analytics';
import { opsApi } from '../../src/api/endpoints/ops';

describe('Frontend API Endpoint Contract Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('authApi.register calls POST /api/v1/users', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        user_id: 'usr-1',
        key_id: 'key-1',
        name: 'Test Key',
        api_key: 'sk_live_123',
        created_at: '2026-09-20T00:00:00.000Z',
      }),
    } as Response);

    const res = await authApi.register({ name: 'Test Key' });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/users',
      expect.objectContaining({ method: 'POST' })
    );
    expect(res.api_key).toBe('sk_live_123');
  });

  it('apiKeysApi.list calls GET /api/v1/api-keys and handles api_keys field', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        api_keys: [{ key_id: 'k1', name: 'Primary', created_at: '2026-09-20' }],
      }),
    } as Response);

    const res = await apiKeysApi.list();

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/api-keys', expect.anything());
    expect(res.api_keys).toHaveLength(1);
    expect(res.api_keys[0].key_id).toBe('k1');
  });

  it('analyticsApi.getLinkAnalytics calls GET /api/v1/links/:code/analytics', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        short_code: 'demo',
        total_clicks: 42,
      }),
    } as Response);

    const res = await analyticsApi.getLinkAnalytics('demo');

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/links/demo/analytics', expect.anything());
    expect(res.total_clicks).toBe(42);
  });

  it('opsApi calls /health, /ready, /metrics at root', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ status: 'ok', uptime: 100 }),
    } as Response);

    await opsApi.health();
    expect(globalThis.fetch).toHaveBeenCalledWith('/health', expect.anything());
  });
});
