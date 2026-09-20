import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoutingBuilderPage } from '../../src/pages/RoutingBuilderPage';
import { linksApi } from '../../src/api/endpoints/links';

vi.mock('../../src/api/endpoints/links');

describe('RoutingBuilderPage Component Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  const mockLinksResponse = {
    links: [
      {
        short_code: 'route-test-123',
        target_url: 'https://example.com/primary',
        click_count: 5,
        is_active: true,
        created_at: '2026-09-20T00:00:00.000Z',
        expires_at: null,
        routing_config: {
          default: 'https://fallback.example.com',
          rules: [
            {
              type: 'device',
              devices: ['mobile'],
              target_url: 'https://m.example.com',
            },
          ],
        },
      },
    ],
    limit: 20,
    offset: 0,
  };

  it('renders routing builder with existing link data and rules', async () => {
    (linksApi.list as any).mockResolvedValue(mockLinksResponse);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/links/route-test-123/routing']}>
          <Routes>
            <Route path="/links/:code/routing" element={<RoutingBuilderPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Visual Routing Builder/i)).toBeInTheDocument();
      expect(screen.getByText(/Device Rule/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue('https://fallback.example.com')).toBeInTheDocument();
    });
  });

  it('allows discarding changes back to initial state', async () => {
    (linksApi.list as any).mockResolvedValue(mockLinksResponse);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/links/route-test-123/routing']}>
          <Routes>
            <Route path="/links/:code/routing" element={<RoutingBuilderPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('https://fallback.example.com')).toBeInTheDocument();
    });

    const fallbackInput = screen.getByDisplayValue('https://fallback.example.com');
    fireEvent.change(fallbackInput, { target: { value: 'https://new-fallback.example.com' } });

    expect(screen.getByText(/Unsaved Changes/i)).toBeInTheDocument();

    const discardBtn = screen.getByText(/Discard Edits/i);
    fireEvent.click(discardBtn);

    expect(screen.queryByText(/Unsaved Changes/i)).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('https://fallback.example.com')).toBeInTheDocument();
  });

  it('dispatches PATCH request to linksApi.update on save', async () => {
    (linksApi.list as any).mockResolvedValue(mockLinksResponse);
    (linksApi.update as any).mockResolvedValue({
      ...mockLinksResponse.links[0],
      routing_config: {
        default: 'https://updated-fallback.example.com',
        rules: mockLinksResponse.links[0].routing_config.rules,
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/links/route-test-123/routing']}>
          <Routes>
            <Route path="/links/:code/routing" element={<RoutingBuilderPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('https://fallback.example.com')).toBeInTheDocument();
    });

    const fallbackInput = screen.getByDisplayValue('https://fallback.example.com');
    fireEvent.change(fallbackInput, { target: { value: 'https://updated-fallback.example.com' } });

    const saveBtn = screen.getByText(/Save Pipeline/i);
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(linksApi.update).toHaveBeenCalledWith('route-test-123', {
        routing_config: {
          default: 'https://updated-fallback.example.com',
          rules: mockLinksResponse.links[0].routing_config.rules,
        },
      });
      expect(screen.getByText(/Pipeline Updated/i)).toBeInTheDocument();
    });
  });
});
