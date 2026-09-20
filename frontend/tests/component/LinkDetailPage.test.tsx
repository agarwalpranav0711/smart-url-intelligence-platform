import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LinkDetailPage } from '../../src/pages/LinkDetailPage';
import { linksApi } from '../../src/api/endpoints/links';
import { analyticsApi } from '../../src/api/endpoints/analytics';
import { useAuth } from '../../src/context/AuthContext';

vi.mock('../../src/api/endpoints/links');
vi.mock('../../src/api/endpoints/analytics');
vi.mock('../../src/context/AuthContext');

describe('LinkDetailPage Component Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    (useAuth as any).mockReturnValue({ isAuthenticated: true });
  });

  const renderLinkDetailPage = (code = 'demo-link') => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/links/${code}`]}>
          <Routes>
            <Route path="/links/:code" element={<LinkDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('renders unauthenticated warning when user has no API key', () => {
    (useAuth as any).mockReturnValue({ isAuthenticated: false });
    renderLinkDetailPage();
    expect(screen.getByText(/Authentication Required/i)).toBeInTheDocument();
  });

  it('renders link metadata and routing summary correctly', async () => {
    const mockLinksResponse = {
      links: [
        {
          short_code: 'demo-link',
          target_url: 'https://example.com/target-dest',
          click_count: 100,
          is_active: true,
          created_at: '2026-09-20T10:00:00.000Z',
          expires_at: null,
          routing_config: null,
        },
      ],
      limit: 100,
      offset: 0,
    };
    const mockAnalyticsResponse = {
      short_code: 'demo-link',
      total_clicks: 100,
      traffic_series: [],
      routing_breakdown: [],
    };

    (linksApi.list as any).mockResolvedValue(mockLinksResponse);
    (analyticsApi.getLinkAnalytics as any).mockResolvedValue(mockAnalyticsResponse);

    renderLinkDetailPage();

    await waitFor(() => {
      expect(screen.getAllByText('demo-link').length).toBeGreaterThan(0);
      expect(screen.getAllByText('https://example.com/target-dest').length).toBeGreaterThan(0);
      expect(screen.getByText('ACTIVE')).toBeInTheDocument();
      expect(screen.getByText('Traffic Routing Pipeline')).toBeInTheDocument();
    });
  });

  it('renders routing rules summary when routing_config has device rules', async () => {
    const mockLinksResponse = {
      links: [
        {
          short_code: 'demo-link',
          target_url: 'https://example.com/target-dest',
          click_count: 50,
          is_active: true,
          created_at: '2026-09-20T10:00:00.000Z',
          expires_at: null,
          routing_config: {
            rules: [
              { type: 'device', devices: ['mobile'], target_url: 'https://m.example.com' },
            ],
          },
        },
      ],
      limit: 100,
      offset: 0,
    };
    (linksApi.list as any).mockResolvedValue(mockLinksResponse);
    (analyticsApi.getLinkAnalytics as any).mockResolvedValue({ short_code: 'demo-link', total_clicks: 50 });

    renderLinkDetailPage();

    await waitFor(() => {
      expect(screen.getByText('1 Device Rule')).toBeInTheDocument();
      expect(screen.getByText('Advanced Engine')).toBeInTheDocument();
    });
  });
});
