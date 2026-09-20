import { apiClient } from '../client';
import { RegisterUserRequest, RegisterUserResponse } from '../types';

export const authApi = {
  register: async (payload: RegisterUserRequest): Promise<RegisterUserResponse> => {
    return apiClient.request<RegisterUserResponse>('/api/v1/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
