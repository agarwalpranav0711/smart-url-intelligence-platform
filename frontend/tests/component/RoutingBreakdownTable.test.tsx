import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  RoutingBreakdownTable,
  formatRouteLabel,
} from '../../src/components/analytics/RoutingBreakdownTable';

describe('RoutingBreakdownTable Component Tests', () => {
  it('formats route labels accurately for default, fallback, time, device, and weighted types', () => {
    expect(formatRouteLabel('default', 'default')).toEqual({
      primary: 'Default Rule',
      secondary: 'Default Config Route',
    });
    expect(formatRouteLabel('fallback', 'fallback')).toEqual({
      primary: 'Primary Fallback Target',
      secondary: 'Main Target URL',
    });
    expect(formatRouteLabel('time', 'rule_0')).toEqual({
      primary: 'Time Rule #1',
      secondary: 'Time Match (rule_0)',
    });
    expect(formatRouteLabel('device', 'rule_1')).toEqual({
      primary: 'Device Rule #2',
      secondary: 'Device Match (rule_1)',
    });
    expect(formatRouteLabel('weighted', 'dest_0')).toEqual({
      primary: 'Weighted Target #1',
      secondary: 'Weight Bucket (dest_0)',
    });
  });

  it('renders empty breakdown state cleanly when data is empty', () => {
    render(<RoutingBreakdownTable data={[]} />);
    expect(screen.getByText('No Routing Breakdown Available')).toBeInTheDocument();
  });

  it('renders routing breakdown table with click counts, percentages, and target destinations', () => {
    const mockData = [
      {
        route_type: 'default',
        route_key: 'default',
        destination_url: 'https://example.com/default',
        clicks: 70,
        percentage: 70.0,
      },
      {
        route_type: 'device',
        route_key: 'rule_0',
        destination_url: 'https://m.example.com/mobile',
        clicks: 30,
        percentage: 30.0,
      },
    ];

    render(<RoutingBreakdownTable data={mockData} />);

    expect(screen.getByText('Default Rule')).toBeInTheDocument();
    expect(screen.getByText('Device Rule #1')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/default')).toBeInTheDocument();
    expect(screen.getByText('https://m.example.com/mobile')).toBeInTheDocument();
    expect(screen.getByText('70')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('70.0%')).toBeInTheDocument();
    expect(screen.getByText('30.0%')).toBeInTheDocument();
  });
});
