import { apiClient } from '../client';
import {
  LinkRecord,
  CreateLinkRequest,
  UpdateLinkRequest,
  LinksListResponse,
  PaginationParams,
} from '../types';

export const linksApi = {
  create: async (payload: CreateLinkRequest): Promise<LinkRecord> => {
    return apiClient.request<LinkRecord>('/api/v1/links', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  list: async (params?: PaginationParams): Promise<LinksListResponse> => {
    const query = new URLSearchParams();
    if (params?.limit !== undefined) query.set('limit', params.limit.toString());
    if (params?.offset !== undefined) query.set('offset', params.offset.toString());
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return apiClient.request<LinksListResponse>(`/api/v1/links${queryString}`);
  },

  update: async (code: string, payload: UpdateLinkRequest): Promise<LinkRecord> => {
    return apiClient.request<LinkRecord>(`/api/v1/links/${code}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  delete: async (code: string): Promise<{ message: string }> => {
    return apiClient.request<{ message: string }>(`/api/v1/links/${code}`, {
      method: 'DELETE',
    });
  },
};
