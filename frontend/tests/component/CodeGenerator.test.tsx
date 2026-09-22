import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodeGenerator } from '../../src/components/common/CodeGenerator';

describe('CodeGenerator Component Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders default operation (Create Link) and language (cURL) snippet', () => {
    render(<CodeGenerator />);

    expect(screen.getByText(/Code Generator/i)).toBeInTheDocument();
    expect(screen.getByText(/Programmatic API clients use Bearer API keys/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /cURL/i })).toHaveAttribute('aria-selected', 'true');

    // Code block should contain cURL command with YOUR_API_KEY placeholder
    const codeBlock = screen.getByText((content) => content.includes('curl -X POST') && content.includes('YOUR_API_KEY'));
    expect(codeBlock).toBeInTheDocument();
  });

  it('switches operation when an operation button is clicked', () => {
    render(<CodeGenerator />);

    const listOpBtn = screen.getByRole('button', { name: /List Links/i });
    fireEvent.click(listOpBtn);

    // Should update code snippet to GET /api/v1/links
    expect(screen.getByText((content) => content.includes('/api/v1/links?limit=20') && content.includes('Authorization: Bearer YOUR_API_KEY'))).toBeInTheDocument();
  });

  it('switches language tabs (JavaScript, Python, Go) and generates valid code snippets', () => {
    render(<CodeGenerator initialOperation="create_link" />);

    // 1. JavaScript
    const jsTab = screen.getByRole('tab', { name: /JavaScript/i });
    fireEvent.click(jsTab);
    expect(screen.getByText((content) => content.includes("fetch('http://localhost:3000/api/v1/links'") && content.includes("Authorization': 'Bearer YOUR_API_KEY"))).toBeInTheDocument();

    // 2. Python
    const pyTab = screen.getByRole('tab', { name: /Python/i });
    fireEvent.click(pyTab);
    expect(screen.getByText((content) => content.includes('import requests') && content.includes('"Authorization": "Bearer YOUR_API_KEY"'))).toBeInTheDocument();

    // 3. Go
    const goTab = screen.getByRole('tab', { name: /Go/i });
    fireEvent.click(goTab);
    expect(screen.getByText((content) => content.includes('package main') && content.includes('req.Header.Set("Authorization", "Bearer YOUR_API_KEY")'))).toBeInTheDocument();
  });

  it('uses shortCode prop in generated code snippet when provided', () => {
    render(<CodeGenerator initialOperation="update_link" shortCode="test-alias-99" />);

    const codeBlock = screen.getByText((content) => content.includes('/api/v1/links/test-alias-99'));
    expect(codeBlock).toBeInTheDocument();
  });

  it('hides operation selector when hideOperationSelector is true', () => {
    render(<CodeGenerator hideOperationSelector />);

    expect(screen.queryByRole('group', { name: /API Operations/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /List Links/i })).not.toBeInTheDocument();
  });

  it('copies active code snippet to clipboard and shows Copied! state', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<CodeGenerator initialOperation="create_link" />);

    const copyBtn = screen.getByRole('button', { name: /Copy code to clipboard/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('curl -X POST'));
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
  });

  it('strictly enforces zero secret token leakage in generated code', () => {
    const { container } = render(<CodeGenerator initialOperation="create_link" shortCode="my-link" />);

    const html = container.innerHTML;
    expect(html).not.toContain('sk_live_');
    expect(html).not.toContain('sess_');
    expect(html).not.toContain('csrf_');
    expect(html).not.toContain('document.cookie');
    expect(html).not.toContain('localStorage');
    expect(html).not.toContain('sessionStorage');
    expect(html).toContain('YOUR_API_KEY');
  });
});
