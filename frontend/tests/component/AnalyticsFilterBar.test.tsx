import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  AnalyticsFilterBar,
  getPresetDates,
} from '../../src/components/analytics/AnalyticsFilterBar';

describe('AnalyticsFilterBar Component Tests', () => {
  it('generates valid ISO dates bounded to max 90 days for presets', () => {
    const { from: from24h, to: to24h } = getPresetDates('24h');
    expect(new Date(from24h).getTime()).toBeLessThan(new Date(to24h).getTime());

    const { from: from90d, to: to90d } = getPresetDates('90d');
    const rangeMs = new Date(to90d).getTime() - new Date(from90d).getTime();
    expect(rangeMs).toBeLessThanOrEqual(90 * 24 * 60 * 60 * 1000 + 1000);
  });

  it('renders preset and interval buttons and triggers onChange', () => {
    const handleChange = vi.fn();
    render(
      <AnalyticsFilterBar
        preset="30d"
        interval="day"
        onChange={handleChange}
      />
    );

    expect(screen.getByText('Last 24 Hours')).toBeInTheDocument();
    expect(screen.getByText('Last 7 Days')).toBeInTheDocument();
    expect(screen.getByText('Last 30 Days')).toBeInTheDocument();
    expect(screen.getByText('Last 90 Days')).toBeInTheDocument();

    const preset24h = screen.getByText('Last 24 Hours');
    fireEvent.click(preset24h);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        preset: '24h',
        interval: 'hour',
      })
    );

    const hourlyBtn = screen.getByText('Hourly');
    fireEvent.click(hourlyBtn);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        interval: 'hour',
      })
    );
  });
});
