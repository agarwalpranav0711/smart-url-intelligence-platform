import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LinksPage } from '../../src/pages/LinksPage';
import { linksApi } from '../../src/api/endpoints/links';
import { useAuth } from '../../src/context/AuthContext';

vi.mock('../../src/api/endpoints/links');
vi.mock('../../src/context/AuthContext');

describe('LinksPage Component Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    (useAuth as any).mockReturnValue({ isAuthenticated: true });
  });

  const renderLinksPage = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <LinksPage />
        </BrowserRouter>
      </QueryClientProvider>
    );
  };

  it('renders unauthenticated warning when user has no API key', () => {
    (useAuth as any).mockReturnValue({ isAuthenticated: false });
    renderLinksPage();
    expect(screen.getByText(/Authentication Required/i)).toBeInTheDocument();
  });

  it('renders empty state when API returns empty links list', async () => {
    (linksApi.list as any).mockResolvedValue({ links: [], limit: 20, offset: 0 });
    renderLinksPage();

    await waitFor(() => {
      expect(screen.getByText(/No Links Provisioned/i)).toBeInTheDocument();
    });
  });

  it('renders real API link records in table view', async () => {
    const mockLinksResponse = {
      links: [
        {
          short_code: 'demo-code-1',
          target_url: 'https://example.com/demo-1',
          click_count: 5,
          is_active: true,
          created_at: '2026-09-20T10:00:00.000Z',
          expires_at: null,
          routing_config: null,
        },
      ],
      limit: 20,
      offset: 0,
    };
    (linksApi.list as any).mockResolvedValue(mockLinksResponse);

    renderLinksPage();

    await waitFor(() => {
      expect(screen.getAllByText('demo-code-1').length).toBeGreaterThan(0);
      expect(screen.getAllByText('https://example.com/demo-1').length).toBeGreaterThan(0);
      expect(screen.getAllByText('ACTIVE').length).toBeGreaterThan(0);
    });
  });

  it('filters loaded links by search query input', async () => {
    const mockLinksResponse = {
      links: [
        { short_code: 'alpha-code', target_url: 'https://alpha.com', is_active: true, created_at: '2026-09-20' },
        { short_code: 'beta-code', target_url: 'https://beta.com', is_active: true, created_at: '2026-09-20' },
      ],
      limit: 20,
      offset: 0,
    };
    (linksApi.list as any).mockResolvedValue(mockLinksResponse);

    renderLinksPage();

    await waitFor(() => {
      expect(screen.getAllByText('alpha-code').length).toBeGreaterThan(0);
      expect(screen.getAllByText('beta-code').length).toBeGreaterThan(0);
    });

    const searchInput = screen.getByPlaceholderText(/Filter shortcode or URL/i);
    fireEvent.change(searchInput, { target: { value: 'alpha' } });

    expect(screen.getAllByText('alpha-code').length).toBeGreaterThan(0);
    expect(screen.queryByText('beta-code')).not.toBeInTheDocument();
  });
});
