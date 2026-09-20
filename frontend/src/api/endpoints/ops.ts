import { apiClient } from '../client';
import { HealthCheckResponse, ReadinessCheckResponse, OperationalMetricsResponse } from '../types';

export const opsApi = {
  health: async (): Promise<HealthCheckResponse> => {
    return apiClient.request<HealthCheckResponse>('/health');
  },

  readiness: async (): Promise<ReadinessCheckResponse> => {
    return apiClient.request<ReadinessCheckResponse>('/ready');
  },

  metrics: async (): Promise<OperationalMetricsResponse> => {
    return apiClient.request<OperationalMetricsResponse>('/metrics');
  },
};
