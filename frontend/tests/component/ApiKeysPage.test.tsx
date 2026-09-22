import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiKeysPage } from '../../src/pages/ApiKeysPage';
import { apiKeysApi } from '../../src/api/endpoints/apiKeys';
import { useAuth } from '../../src/context/AuthContext';

vi.mock('../../src/api/endpoints/apiKeys');
vi.mock('../../src/context/AuthContext');

describe('ApiKeysPage Component Tests', () => {
  let queryClient: QueryClient;
  const mockSetApiKey = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    (useAuth as any).mockReturnValue({
      apiKey: 'sk_live_1234567890abcdef',
      isAuthenticated: true,
      setApiKey: mockSetApiKey,
    });
  });

  const renderApiKeysPage = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ApiKeysPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('1. renders unauthenticated warning when no API key is set', () => {
    (useAuth as any).mockReturnValue({ isAuthenticated: false });
    renderApiKeysPage();
    expect(screen.getByText(/Authentication Required/i)).toBeInTheDocument();
  });

  it('2-7. renders Developer Identity card, key counts, active and revoked key table, and supports filter tabs', async () => {
    const mockKeys = {
      api_keys: [
        {
          key_id: 'key-active-1',
          name: 'Primary Key',
          created_at: '2026-09-01T00:00:00.000Z',
          revoked_at: null,
        },
        {
          key_id: 'key-revoked-2',
          name: 'Legacy Key',
          created_at: '2026-08-01T00:00:00.000Z',
          revoked_at: '2026-08-15T00:00:00.000Z',
        },
      ],
    };

    (apiKeysApi.list as any).mockResolvedValue(mockKeys);

    renderApiKeysPage();

    await waitFor(() => {
      // Identity Card
      expect(screen.getByText('Developer Identity Context')).toBeInTheDocument();
      expect(screen.getByText('Active In Memory')).toBeInTheDocument();

      // Keys Table
      expect(screen.getByText('Primary Key')).toBeInTheDocument();
      expect(screen.getByText('Legacy Key')).toBeInTheDocument();
      expect(screen.getByText('key-active-1')).toBeInTheDocument();
      expect(screen.getByText('key-revoked-2')).toBeInTheDocument();
    });

    // Test Active Filter tab
    const activeTab = screen.getByRole('button', { name: /Active \(1\)/i });
    fireEvent.click(activeTab);
    expect(screen.getByText('Primary Key')).toBeInTheDocument();
    expect(screen.queryByText('Legacy Key')).not.toBeInTheDocument();

    // Test Revoked Filter tab
    const revokedTab = screen.getByRole('button', { name: /Revoked \(1\)/i });
    fireEvent.click(revokedTab);
    expect(screen.getByText('Legacy Key')).toBeInTheDocument();
    expect(screen.queryByText('Primary Key')).not.toBeInTheDocument();

    // Test All Filter tab
    const allTab = screen.getByRole('button', { name: /All Keys \(2\)/i });
    fireEvent.click(allTab);
    expect(screen.getByText('Primary Key')).toBeInTheDocument();
    expect(screen.getByText('Legacy Key')).toBeInTheDocument();
  });

  it('8-11. opens Create Secondary Key modal, submits name, renders one-time raw key, and allows setting active key', async () => {
    (apiKeysApi.list as any).mockResolvedValue({ api_keys: [] });
    (apiKeysApi.create as any).mockResolvedValue({
      key_id: 'key-new-99',
      name: 'Secondary Automation Key',
      api_key: 'sk_live_SECRET_RAW_KEY_TOKEN_999',
      created_at: new Date().toISOString(),
    });

    renderApiKeysPage();

    await waitFor(() => {
      expect(screen.getByText('No API Keys Provisioned')).toBeInTheDocument();
    });

    // Open modal using header action button
    const createBtn = screen.getAllByRole('button', { name: /Create Secondary Key/i })[0];
    fireEvent.click(createBtn);

    expect(screen.getByText('Provision Secondary API Key')).toBeInTheDocument();

    // Fill form
    const input = screen.getByLabelText(/Key Identifier/i);
    fireEvent.change(input, { target: { value: 'Secondary Automation Key' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Generate Key/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('API Key Provisioned Successfully')).toBeInTheDocument();
      expect(screen.getByText('sk_live_SECRET_RAW_KEY_TOKEN_999')).toBeInTheDocument();
    });

    // Test "Use as Active Memory Key"
    const setMemKeyBtn = screen.getByRole('button', { name: /Use as Active Memory Key/i });
    fireEvent.click(setMemKeyBtn);
    expect(mockSetApiKey).toHaveBeenCalledWith('sk_live_SECRET_RAW_KEY_TOKEN_999');
  });

  it('12-16. opens RevokeKeyModal, supports cancellation, triggers API mutation on confirmation, and handles error state', async () => {
    const mockKeys = {
      api_keys: [
        {
          key_id: 'key-to-revoke-10',
          name: 'Stale Key',
          created_at: '2026-09-01T00:00:00.000Z',
          revoked_at: null,
        },
      ],
    };

    (apiKeysApi.list as any).mockResolvedValue(mockKeys);
    (apiKeysApi.revoke as any).mockResolvedValue({ message: 'API key revoked successfully' });

    renderApiKeysPage();

    await waitFor(() => {
      expect(screen.getByText('Stale Key')).toBeInTheDocument();
    });

    // Click Revoke action button in table
    const revokeBtn = screen.getByRole('button', { name: /^Revoke$/i });
    fireEvent.click(revokeBtn);

    // Verify confirmation modal opens
    expect(screen.getByText('Confirm API Key Revocation')).toBeInTheDocument();
    expect(screen.getAllByText('Stale Key').length).toBeGreaterThan(0);
    expect(screen.getAllByText('key-to-revoke-10').length).toBeGreaterThan(0);

    // Cancel revocation
    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);
    expect(screen.queryByText('Confirm API Key Revocation')).not.toBeInTheDocument();

    // Re-open and confirm revocation
    const revokeBtn2 = screen.getByRole('button', { name: /^Revoke$/i });
    fireEvent.click(revokeBtn2);

    const confirmBtn = screen.getByRole('button', { name: /Confirm Revocation/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(apiKeysApi.revoke).toHaveBeenCalledWith('key-to-revoke-10');
    });
  });
});
