import { describe, it, expect, beforeEach, vi } from 'vitest';
import { linksApi } from '../../src/api/endpoints/links';
import { setClientApiKey, ApiError } from '../../src/api/client';

describe('Phase 24C.1 Link Management Workflow Tests', () => {
  beforeEach(() => {
    setClientApiKey('test_bearer_token');
    vi.restoreAllMocks();
  });

  it('successfully creates short link with target URL, custom alias, and expiration', async () => {
    const mockCreatedLink = {
      short_code: 'my-custom-alias',
      target_url: 'https://example.com/target-path',
      created_at: '2026-09-20T12:00:00.000Z',
      expires_at: '2026-12-31T23:59:59.000Z',
      routing_config: null,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockCreatedLink,
    } as Response);

    const result = await linksApi.create({
      target_url: 'https://example.com/target-path',
      alias: 'my-custom-alias',
      expires_at: '2026-12-31T23:59:59.000Z',
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/links',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          target_url: 'https://example.com/target-path',
          alias: 'my-custom-alias',
          expires_at: '2026-12-31T23:59:59.000Z',
        }),
      })
    );
    expect(result.short_code).toBe('my-custom-alias');
  });

  it('handles HTTP 409 ALIAS_ALREADY_EXISTS gracefully as an ApiError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        error: {
          code: 'ALIAS_ALREADY_EXISTS',
          message: 'The requested alias is already in use',
        },
      }),
    } as Response);

    try {
      await linksApi.create({
        target_url: 'https://example.com',
        alias: 'duplicate-alias',
      });
      expect.fail('Should have thrown ApiError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(409);
      expect(err.code).toBe('ALIAS_ALREADY_EXISTS');
    }
  });

  it('handles HTTP 429 RATE_LIMIT_EXCEEDED gracefully as an ApiError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many link creation requests',
        },
      }),
    } as Response);

    try {
      await linksApi.create({
        target_url: 'https://example.com',
      });
      expect.fail('Should have thrown ApiError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(429);
      expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
    }
  });

  it('deactivates shortcode using DELETE /api/v1/links/:code', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ message: 'Link deactivated' }),
    } as Response);

    const res = await linksApi.delete('demo-code');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/links/demo-code',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(res.message).toBe('Link deactivated');
  });
});
