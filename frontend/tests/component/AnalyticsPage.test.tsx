import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnalyticsPage } from '../../src/pages/AnalyticsPage';
import { analyticsApi } from '../../src/api/endpoints/analytics';
import { linksApi } from '../../src/api/endpoints/links';
import { useAuth } from '../../src/context/AuthContext';

vi.mock('../../src/api/endpoints/analytics');
vi.mock('../../src/api/endpoints/links');
vi.mock('../../src/context/AuthContext');

describe('AnalyticsPage Component Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    (useAuth as any).mockReturnValue({ isAuthenticated: true });
  });

  const renderAnalyticsPage = (initialEntry = '/analytics') => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <AnalyticsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('renders auth warning when user is not authenticated', () => {
    (useAuth as any).mockReturnValue({ isAuthenticated: false });
    renderAnalyticsPage();
    expect(screen.getByText(/Authentication Required/i)).toBeInTheDocument();
  });

  it('renders summary statistics and top links leaderboard', async () => {
    const mockSummary = {
      total_clicks: 1250,
      active_links_count: 8,
      time_range: { from: '2026-08-21T00:00:00.000Z', to: '2026-09-20T00:00:00.000Z' },
      top_links: [
        { short_code: 'link-1', target_url: 'https://example.com/1', clicks: 800 },
        { short_code: 'link-2', target_url: 'https://example.com/2', clicks: 450 },
      ],
    };

    const mockLinksList = {
      links: [
        { short_code: 'link-1', target_url: 'https://example.com/1', created_at: '2026-09-01T00:00:00.000Z' },
        { short_code: 'link-2', target_url: 'https://example.com/2', created_at: '2026-09-02T00:00:00.000Z' },
      ],
      limit: 100,
      offset: 0,
    };

    const mockLinkAnalytics = {
      short_code: 'link-1',
      total_clicks: 800,
      time_range: { from: '2026-08-21T00:00:00.000Z', to: '2026-09-20T00:00:00.000Z', interval: 'day' },
      traffic_series: [{ timestamp: '2026-09-20T00:00:00.000Z', clicks: 800 }],
      routing_breakdown: [
        { route_type: 'default', route_key: 'default', destination_url: 'https://example.com/1', clicks: 800, percentage: 100 },
      ],
    };

    (analyticsApi.getSummary as any).mockResolvedValue(mockSummary);
    (linksApi.list as any).mockResolvedValue(mockLinksList);
    (analyticsApi.getLinkAnalytics as any).mockResolvedValue(mockLinkAnalytics);

    renderAnalyticsPage();

    await waitFor(() => {
      expect(screen.getByText('1,250')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();
      expect(screen.getByText('Top Links Leaderboard')).toBeInTheDocument();
      expect(screen.getAllByText('link-1').length).toBeGreaterThan(0);
      expect(screen.getByText('800 clicks')).toBeInTheDocument();
    });
  });

  it('handles range preset and interval button clicks', async () => {
    (analyticsApi.getSummary as any).mockResolvedValue({
      total_clicks: 100,
      active_links_count: 2,
      top_links: [],
    });
    (linksApi.list as any).mockResolvedValue({ links: [], limit: 100, offset: 0 });

    renderAnalyticsPage();

    await waitFor(() => {
      expect(screen.getByText('Last 24 Hours')).toBeInTheDocument();
    });

    const preset24hBtn = screen.getByText('Last 24 Hours');
    fireEvent.click(preset24hBtn);

    const hourlyBtn = screen.getByText('Hourly');
    fireEvent.click(hourlyBtn);

    expect(analyticsApi.getSummary).toHaveBeenCalled();
  });

  it('displays error state when summary API fails and allows retry', async () => {
    (analyticsApi.getSummary as any).mockRejectedValue(new Error('Network error loading analytics'));
    (linksApi.list as any).mockResolvedValue({ links: [], limit: 100, offset: 0 });

    renderAnalyticsPage();

    await waitFor(() => {
      expect(screen.getByText('Network error loading analytics')).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();
  });
});
