import { RoutingConfig, RoutingRule } from '../api/types';

export interface RoutingBuilderState {
  defaultFallback: string;
  rules: RoutingRule[];
}

export function routingConfigToBuilderState(config: RoutingConfig | null | undefined): RoutingBuilderState {
  if (!config) {
    return {
      defaultFallback: '',
      rules: [],
    };
  }

  const defaultFallback = typeof config.default === 'string' ? config.default : '';
  const rules = Array.isArray(config.rules) ? JSON.parse(JSON.stringify(config.rules)) : [];

  return {
    defaultFallback,
    rules,
  };
}

export function builderStateToRoutingConfig(state: RoutingBuilderState): RoutingConfig | null {
  const trimmedFallback = state.defaultFallback.trim();
  const rules = state.rules;

  if (trimmedFallback.length === 0 && rules.length === 0) {
    return null;
  }

  const config: RoutingConfig = {};

  if (trimmedFallback.length > 0) {
    config.default = trimmedFallback;
  }

  if (rules.length > 0) {
    config.rules = JSON.parse(JSON.stringify(rules));
  }

  return config;
}
