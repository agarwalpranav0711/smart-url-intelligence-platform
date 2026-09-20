import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodeText } from '../../src/components/common/CodeText';

describe('CodeText Component Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders monospace text correctly', () => {
    render(<CodeText>my-shortcode</CodeText>);
    expect(screen.getByText('my-shortcode')).toBeInTheDocument();
  });

  it('copies text to clipboard when copy button is clicked', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<CodeText copyable>copyable-value</CodeText>);
    const copyBtn = screen.getByRole('button', { name: /Copy value/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('copyable-value');
    });
  });
});
