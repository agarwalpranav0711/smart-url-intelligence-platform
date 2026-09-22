import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RevokeKeyModal } from '../../src/components/common/RevokeKeyModal';

describe('RevokeKeyModal Component Tests', () => {
  it('renders nothing when keyId is null', () => {
    const { container } = render(
      <RevokeKeyModal
        isOpen={true}
        keyId={null}
        keyName="Test Key"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with warning, key name, key ID, and confirmation triggers', () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn();

    render(
      <RevokeKeyModal
        isOpen={true}
        keyId="key-12345"
        keyName="Automation Key"
        onClose={handleClose}
        onConfirm={handleConfirm}
      />
    );

    expect(screen.getByText('Confirm API Key Revocation')).toBeInTheDocument();
    expect(screen.getByText('Automation Key')).toBeInTheDocument();
    expect(screen.getByText('key-12345')).toBeInTheDocument();
    expect(screen.getByText('Permanent Revocation Warning')).toBeInTheDocument();

    // Click Cancel
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Click Confirm
    const confirmBtn = screen.getByRole('button', { name: /confirm revocation/i });
    fireEvent.click(confirmBtn);
    expect(handleConfirm).toHaveBeenCalledWith('key-12345');
  });
});
