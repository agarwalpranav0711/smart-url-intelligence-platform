import { apiClient } from '../client';

export interface CreateSessionResponse {
  user_id: string;
  csrf_token: string;
  expires_at: string;
}

export interface GetSessionResponse {
  authenticated: boolean;
  user_id?: string;
  csrf_token?: string;
}

export interface DeleteSessionResponse {
  message: string;
}

export const sessionApi = {
  createSession(apiKey: string): Promise<CreateSessionResponse> {
    return apiClient.request<CreateSessionResponse>('/api/v1/auth/session', {
      method: 'POST',
      body: JSON.stringify({ api_key: apiKey }),
    });
  },

  getSession(): Promise<GetSessionResponse> {
    return apiClient.request<GetSessionResponse>('/api/v1/auth/session', {
      method: 'GET',
    });
  },

  deleteSession(): Promise<DeleteSessionResponse> {
    return apiClient.request<DeleteSessionResponse>('/api/v1/auth/session', {
      method: 'DELETE',
    });
  },
};
