import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { CreateLinkModal } from '../../src/components/common/CreateLinkModal';
import { linksApi } from '../../src/api/endpoints/links';

vi.mock('../../src/api/endpoints/links');

describe('CreateLinkModal Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderModal = (props = {}) => {
    const defaultProps = {
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    };
    return render(
      <BrowserRouter>
        <CreateLinkModal {...defaultProps} {...props} />
      </BrowserRouter>
    );
  };

  it('renders modal inputs correctly', () => {
    renderModal();
    expect(screen.getByLabelText(/Target Destination URL/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Custom Alias/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Expiration Date/i)).toBeInTheDocument();
  });

  it('validates target URL protocol on form submit', async () => {
    renderModal();
    const urlInput = screen.getByLabelText(/Target Destination URL/i);
    fireEvent.change(urlInput, { target: { value: 'ftp://invalid-scheme.com' } });

    const form = urlInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/must use http or https protocol/i)).toBeInTheDocument();
    });
  });

  it('submits valid data to linksApi.create and displays success screen', async () => {
    const mockCreated = {
      short_code: 'test-code',
      target_url: 'https://example.com/target',
      created_at: '2026-09-20T00:00:00.000Z',
      expires_at: null,
      routing_config: null,
    };
    (linksApi.create as any).mockResolvedValue(mockCreated);

    renderModal();
    const urlInput = screen.getByLabelText(/Target Destination URL/i);
    fireEvent.change(urlInput, { target: { value: 'https://example.com/target' } });

    const form = urlInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(linksApi.create).toHaveBeenCalledWith({
        target_url: 'https://example.com/target',
        alias: undefined,
        expires_at: null,
      });
      expect(screen.getByText(/Link provisioned successfully/i)).toBeInTheDocument();
      expect(screen.getByText('test-code')).toBeInTheDocument();
    });
  });
});
