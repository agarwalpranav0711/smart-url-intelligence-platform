import { apiClient } from '../client';
import { ApiKey, ApiKeysListResponse, CreateApiKeyRequest, RevokeApiKeyResponse } from '../types';

export const apiKeysApi = {
  list: async (): Promise<ApiKeysListResponse> => {
    return apiClient.request<ApiKeysListResponse>('/api/v1/api-keys');
  },

  create: async (payload: CreateApiKeyRequest): Promise<ApiKey> => {
    return apiClient.request<ApiKey>('/api/v1/api-keys', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  revoke: async (id: string): Promise<RevokeApiKeyResponse> => {
    return apiClient.request<RevokeApiKeyResponse>(`/api/v1/api-keys/${id}`, {
      method: 'DELETE',
    });
  },
};
