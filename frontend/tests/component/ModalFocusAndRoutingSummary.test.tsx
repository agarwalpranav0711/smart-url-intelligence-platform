import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { Modal } from '../../src/components/common/Modal';
import { RoutingSummaryCard } from '../../src/components/common/RoutingSummaryCard';

describe('Modal Focus Trap & Accessibility Tests', () => {
  it('renders modal with role="dialog" and aria-labelledby', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="Test Dialog">
        <button>Inside Button</button>
      </Modal>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');
    expect(screen.getByText('Test Dialog')).toBeInTheDocument();
  });

  it('triggers onClose when Escape key is pressed', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Escape Test">
        <p>Modal content</p>
      </Modal>
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});

describe('RoutingSummaryCard Accuracy Tests', () => {
  it('renders Direct 302 Pass-Through for null or empty routing config', () => {
    render(
      <MemoryRouter>
        <RoutingSummaryCard routingConfig={null} code="demo-1" />
      </MemoryRouter>
    );

    expect(screen.getByText(/Direct 302/i)).toBeInTheDocument();
    expect(screen.getByText(/Standard 302 Pass-Through/i)).toBeInTheDocument();
  });

  it('accurately parses time, device, and weighted rule counts with destination sum', () => {
    const config = {
      default: 'https://fallback.example.com',
      rules: [
        {
          type: 'time' as const,
          start: '09:00',
          end: '17:00',
          target_url: 'https://work.example.com',
        },
        {
          type: 'device' as const,
          devices: ['mobile' as const],
          target_url: 'https://m.example.com',
        },
        {
          type: 'weighted' as const,
          destinations: [
            { target_url: 'https://a.example.com', weight: 60 },
            { target_url: 'https://b.example.com', weight: 40 },
          ],
        },
      ],
    };

    render(
      <MemoryRouter>
        <RoutingSummaryCard routingConfig={config} code="demo-2" />
      </MemoryRouter>
    );

    expect(screen.getByText(/Advanced Engine/i)).toBeInTheDocument();
    expect(screen.getByText(/1 Time Rule/i)).toBeInTheDocument();
    expect(screen.getByText(/1 Device Rule/i)).toBeInTheDocument();
    expect(screen.getByText(/1 Weighted Rule/i)).toBeInTheDocument();
    expect(screen.getByText(/2 destinations distribution/i)).toBeInTheDocument();
    expect(screen.getByText('https://fallback.example.com')).toBeInTheDocument();
  });

  it('safely handles malformed routing_config without crashing', () => {
    const malformedConfig = {
      rules: 'not-an-array' as any,
      default: 12345 as any,
    };

    render(
      <MemoryRouter>
        <RoutingSummaryCard routingConfig={malformedConfig} code="demo-3" />
      </MemoryRouter>
    );
    expect(screen.getByText(/Direct 302/i)).toBeInTheDocument();
  });
});
