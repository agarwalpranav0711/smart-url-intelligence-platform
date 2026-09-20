/// <reference types="vite/client" />

let currentApiKey: string | null = null;

export function setClientApiKey(key: string | null): void {
  currentApiKey = key;
}

export function getClientApiKey(): string | null {
  return currentApiKey;
}

export class ApiError extends Error {
  public status: number;
  public code: string;
  public requestId?: string;
  public details?: Record<string, unknown>;

  constructor(message: string, status: number, code: string, requestId?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || '';

/**
 * Centralized API Client Layer for Smart URL Intelligence Platform.
 * Uses native fetch with standard error normalization and request correlation ID.
 */
export class ApiClient {
  /**
   * Executes an HTTP request with JSON error normalization and auth header injection.
   */
  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {});

    // 1. Inject JSON Content-Type if payload present
    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    // 2. Inject Client Correlation ID
    const requestId = `client_${crypto.randomUUID()}`;
    if (!headers.has('X-Request-ID')) {
      headers.set('X-Request-ID', requestId);
    }

    // 3. Inject Bearer Auth Key if present in active memory context
    const activeKey = getClientApiKey();
    if (activeKey && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${activeKey}`);
    }

    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Handle 204 No Content
      if (response.status === 204) {
        return {} as T;
      }

      const isJson = response.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await response.json().catch(() => ({})) : {};

      if (!response.ok) {
        const errCode = data?.error?.code || this.mapStatusCodeToErrorCode(response.status);
        const errMessage = data?.error?.message || `HTTP Request failed with status ${response.status}`;
        const errDetails = data?.error?.details || undefined;
        const resRequestId = response.headers.get('x-request-id') || requestId;

        throw new ApiError(errMessage, response.status, errCode, resRequestId, errDetails);
      }

      return data as T;
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        throw err;
      }

      // Network / Fetch Exceptions
      throw new ApiError(
        (err as Error)?.message || 'Failed to connect to backend server',
        0,
        'NETWORK_ERROR',
        requestId
      );
    }
  }

  private mapStatusCodeToErrorCode(status: number): string {
    switch (status) {
      case 400: return 'INVALID_REQUEST';
      case 401: return 'UNAUTHORIZED';
      case 404: return 'NOT_FOUND';
      case 405: return 'METHOD_NOT_ALLOWED';
      case 409: return 'IDEMPOTENCY_CONFLICT';
      case 410: return 'LINK_INACTIVE';
      case 413: return 'PAYLOAD_TOO_LARGE';
      case 415: return 'UNSUPPORTED_MEDIA_TYPE';
      case 429: return 'RATE_LIMIT_EXCEEDED';
      case 503: return 'SERVICE_UNAVAILABLE';
      default: return 'INTERNAL_SERVER_ERROR';
    }
  }
}

export const apiClient = new ApiClient();
