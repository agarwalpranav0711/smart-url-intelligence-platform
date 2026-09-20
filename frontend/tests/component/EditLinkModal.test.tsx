import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditLinkModal } from '../../src/components/common/EditLinkModal';
import { linksApi } from '../../src/api/endpoints/links';

vi.mock('../../src/api/endpoints/links');

describe('EditLinkModal Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockLink = {
    short_code: 'edit-code-123',
    target_url: 'https://example.com/original',
    created_at: '2026-09-20T00:00:00.000Z',
    expires_at: '2026-12-31T23:59:59.000Z',
    routing_config: null,
  };

  it('pre-populates inputs with existing link record values', () => {
    render(<EditLinkModal isOpen={true} link={mockLink} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const urlInput = screen.getByLabelText(/Target Destination URL/i) as HTMLInputElement;
    expect(urlInput.value).toBe('https://example.com/original');
  });

  it('validates target URL scheme before dispatching PATCH', async () => {
    render(<EditLinkModal isOpen={true} link={mockLink} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const urlInput = screen.getByLabelText(/Target Destination URL/i);
    fireEvent.change(urlInput, { target: { value: 'javascript:alert(1)' } });

    const form = urlInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/must use http or https protocol/i)).toBeInTheDocument();
    });
  });

  it('calls linksApi.update with PATCH payload on valid submission', async () => {
    const mockUpdated = {
      ...mockLink,
      target_url: 'https://example.com/updated',
    };
    (linksApi.update as any).mockResolvedValue(mockUpdated);

    const handleSuccess = vi.fn();
    render(<EditLinkModal isOpen={true} link={mockLink} onClose={vi.fn()} onSuccess={handleSuccess} />);

    const urlInput = screen.getByLabelText(/Target Destination URL/i);
    fireEvent.change(urlInput, { target: { value: 'https://example.com/updated' } });

    const form = urlInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(linksApi.update).toHaveBeenCalledWith(
        'edit-code-123',
        expect.objectContaining({
          target_url: 'https://example.com/updated',
        })
      );
      expect(handleSuccess).toHaveBeenCalledWith(mockUpdated);
    });
  });
});
