import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TimeSeriesChart, TimeSeriesPoint } from '../../src/components/analytics/TimeSeriesChart';

describe('TimeSeriesChart Component Tests', () => {
  it('renders loading skeleton when loading prop is true', () => {
    const { container } = render(<TimeSeriesChart data={[]} interval="day" loading={true} />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders fallback empty SVG state when data is empty', () => {
    render(<TimeSeriesChart data={[]} interval="day" />);
    expect(screen.getByText('No traffic recorded for this time range')).toBeInTheDocument();
  });

  it('renders single data point series without crashing', () => {
    const singleData: TimeSeriesPoint[] = [
      { timestamp: '2026-09-20T00:00:00.000Z', clicks: 42 },
    ];
    render(<TimeSeriesChart data={singleData} interval="hour" />);
    const svgEl = screen.getByRole('img');
    expect(svgEl).toBeInTheDocument();
    expect(screen.getByText(/Click Traffic Series \(Hourly\)/i)).toBeInTheDocument();
  });

  it('renders zero value data points correctly', () => {
    const zeroData: TimeSeriesPoint[] = [
      { timestamp: '2026-09-19T00:00:00.000Z', clicks: 0 },
      { timestamp: '2026-09-20T00:00:00.000Z', clicks: 0 },
    ];
    render(<TimeSeriesChart data={zeroData} interval="day" />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('renders multi-point normal traffic series with accessible point buttons', () => {
    const multiData: TimeSeriesPoint[] = [
      { timestamp: '2026-09-18T00:00:00.000Z', clicks: 10 },
      { timestamp: '2026-09-19T00:00:00.000Z', clicks: 25 },
      { timestamp: '2026-09-20T00:00:00.000Z', clicks: 50 },
    ];
    render(<TimeSeriesChart data={multiData} interval="day" />);
    
    const svgEl = screen.getByRole('img');
    expect(svgEl).toHaveAttribute('aria-label');

    const pointButtons = screen.getAllByRole('button');
    expect(pointButtons.length).toBe(3);

    // Hover on second point
    fireEvent.mouseEnter(pointButtons[1]);
    expect(screen.getByText(/25 clicks/i)).toBeInTheDocument();

    fireEvent.mouseLeave(pointButtons[1]);
  });
});
