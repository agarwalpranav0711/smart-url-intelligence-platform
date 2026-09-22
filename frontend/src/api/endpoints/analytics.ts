import { apiClient } from '../client';
import {
  AnalyticsSummaryResponse,
  GetAnalyticsSummaryParams,
  GetLinkAnalyticsParams,
  LinkAnalyticsResponse,
} from '../types';

export const analyticsApi = {
  getSummary: async (params?: GetAnalyticsSummaryParams): Promise<AnalyticsSummaryResponse> => {
    const query = new URLSearchParams();
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.limit) query.set('limit', params.limit.toString());
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return apiClient.request<AnalyticsSummaryResponse>(`/api/v1/analytics/summary${queryString}`);
  },

  getLinkAnalytics: async (
    code: string,
    params?: GetLinkAnalyticsParams
  ): Promise<LinkAnalyticsResponse> => {
    const query = new URLSearchParams();
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.interval) query.set('interval', params.interval);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return apiClient.request<LinkAnalyticsResponse>(`/api/v1/links/${code}/analytics${queryString}`);
  },
};
