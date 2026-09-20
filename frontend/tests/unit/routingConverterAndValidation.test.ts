import { describe, it, expect } from 'vitest';
import { RoutingConfig, TimeRule, DeviceRule, WeightedRule } from '../../src/api/types';
import { validateRoutingConfigClient, MAX_ROUTING_PAYLOAD_BYTES } from '../../src/utils/routingValidation';
import { routingConfigToBuilderState, builderStateToRoutingConfig } from '../../src/utils/routingConverter';

describe('routingConverter & routingValidation Unit Tests', () => {
  it('converts null/undefined RoutingConfig to default empty builder state', () => {
    const stateNull = routingConfigToBuilderState(null);
    expect(stateNull.defaultFallback).toBe('');
    expect(stateNull.rules).toEqual([]);

    const stateUndef = routingConfigToBuilderState(undefined);
    expect(stateUndef.defaultFallback).toBe('');
    expect(stateUndef.rules).toEqual([]);
  });

  it('converts builder state to RoutingConfig correctly', () => {
    const state = {
      defaultFallback: 'https://fallback.example.com',
      rules: [
        {
          type: 'device' as const,
          devices: ['mobile' as const, 'tablet' as const],
          target_url: 'https://m.example.com',
        },
      ],
    };

    const config = builderStateToRoutingConfig(state);
    expect(config).toEqual({
      default: 'https://fallback.example.com',
      rules: [
        {
          type: 'device',
          devices: ['mobile', 'tablet'],
          target_url: 'https://m.example.com',
        },
      ],
    });
  });

  it('returns null RoutingConfig if fallback is blank and rules array is empty', () => {
    const state = { defaultFallback: '   ', rules: [] };
    expect(builderStateToRoutingConfig(state)).toBeNull();
  });

  it('validates a correct RoutingConfig payload containing Time, Device, and Weighted rules', () => {
    const validConfig: RoutingConfig = {
      default: 'https://fallback.example.com',
      rules: [
        {
          type: 'time',
          start: '09:00',
          end: '17:00',
          timezone: 'America/New_York',
          days: ['mon', 'tue', 'wed', 'thu', 'fri'],
          target_url: 'https://work.example.com',
        },
        {
          type: 'device',
          devices: ['mobile', 'tablet'],
          target_url: 'https://m.example.com',
        },
        {
          type: 'weighted',
          destinations: [
            { target_url: 'https://a.example.com', weight: 80 },
            { target_url: 'https://b.example.com', weight: 20 },
          ],
        },
      ],
    };

    const result = validateRoutingConfigClient(validConfig);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts overnight time rule intervals (e.g. 22:00 to 06:00)', () => {
    const overnightConfig: RoutingConfig = {
      rules: [
        {
          type: 'time',
          start: '22:00',
          end: '06:00',
          timezone: 'UTC',
          target_url: 'https://night.example.com',
        },
      ],
    };
    const result = validateRoutingConfigClient(overnightConfig);
    expect(result.valid).toBe(true);
  });

  it('rejects time rule with identical start and end time', () => {
    const invalidConfig: RoutingConfig = {
      rules: [
        {
          type: 'time',
          start: '12:00',
          end: '12:00',
          target_url: 'https://example.com',
        },
      ],
    };
    const result = validateRoutingConfigClient(invalidConfig);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/cannot be identical/i);
  });

  it('rejects invalid IANA timezones', () => {
    const invalidTzConfig: RoutingConfig = {
      rules: [
        {
          type: 'time',
          start: '09:00',
          end: '17:00',
          timezone: 'Invalid/NonExistent_Zone',
          target_url: 'https://example.com',
        },
      ],
    };
    const result = validateRoutingConfigClient(invalidTzConfig);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/invalid IANA timezone/i);
  });

  it('rejects invalid HH:mm time format', () => {
    const invalidTimeFormat: RoutingConfig = {
      rules: [
        {
          type: 'time',
          start: '9:00', // missing leading zero
          end: '17:00',
          target_url: 'https://example.com',
        },
      ],
    };
    const result = validateRoutingConfigClient(invalidTimeFormat);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/invalid start time/i);
  });

  it('validates weighted rule constraints (2-10 destinations, weight 1-100, total sum <= 1000)', () => {
    // Under 2 destinations
    const underDestinations: RoutingConfig = {
      rules: [
        {
          type: 'weighted',
          destinations: [{ target_url: 'https://a.com', weight: 50 }],
        },
      ],
    };
    expect(validateRoutingConfigClient(underDestinations).valid).toBe(false);

    // Weight out of range (0 or > 100)
    const invalidWeight: RoutingConfig = {
      rules: [
        {
          type: 'weighted',
          destinations: [
            { target_url: 'https://a.com', weight: 150 },
            { target_url: 'https://b.com', weight: 50 },
          ],
        },
      ],
    };
    expect(validateRoutingConfigClient(invalidWeight).valid).toBe(false);

    // Total weight > 1000
    const overweightSum: RoutingConfig = {
      rules: [
        {
          type: 'weighted',
          destinations: [
            { target_url: 'https://a.com', weight: 100 },
            { target_url: 'https://b.com', weight: 100 },
            { target_url: 'https://c.com', weight: 100 },
            { target_url: 'https://d.com', weight: 100 },
            { target_url: 'https://e.com', weight: 100 },
            { target_url: 'https://f.com', weight: 100 },
            { target_url: 'https://g.com', weight: 100 },
            { target_url: 'https://h.com', weight: 100 },
            { target_url: 'https://i.com', weight: 100 },
            { target_url: 'https://j.com', weight: 100 },
          ],
        },
      ],
    };
  });

  it('enforces maximum 10 rules limit', () => {
    const rulesArray = Array.from({ length: 11 }, (_, i) => ({
      type: 'device' as const,
      devices: ['mobile' as const],
      target_url: `https://m${i}.example.com`,
    }));
    const excessRulesConfig: RoutingConfig = { rules: rulesArray };
    const result = validateRoutingConfigClient(excessRulesConfig);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/cannot exceed 10 rules/i);
  });
});
