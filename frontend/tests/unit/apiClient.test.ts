import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiClient, ApiError, setClientApiKey } from '../../src/api/client';

describe('ApiClient Unit Tests', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient();
    setClientApiKey(null);
    vi.restoreAllMocks();
  });

  it('normalizes HTTP errors into ApiError instances with status and correlation ID', async () => {
    const mockErrorResponse = {
      error: {
        code: 'LINK_NOT_FOUND',
        message: 'Link shortcode does not exist',
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({
        'content-type': 'application/json',
        'x-request-id': 'req-test-123',
      }),
      json: async () => mockErrorResponse,
    } as Response);

    try {
      await client.request('/links/nonexistent');
      expect.fail('Should have thrown ApiError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(404);
      expect(err.code).toBe('LINK_NOT_FOUND');
      expect(err.message).toBe('Link shortcode does not exist');
      expect(err.requestId).toBe('req-test-123');
    }
  });

  it('injects Authorization Bearer header when API key is set in memory', async () => {
    setClientApiKey('test_key_abc123');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true }),
    } as Response);

    await client.request('/links');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [, options] = (globalThis.fetch as any).mock.calls[0];
    expect(options.headers.get('Authorization')).toBe('Bearer test_key_abc123');
  });
});
