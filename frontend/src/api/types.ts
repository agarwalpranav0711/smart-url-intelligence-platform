/**
 * TypeScript Interfaces derived directly from docs/openapi.yaml & backend controllers
 * Smart URL Intelligence Platform API Schema Definition
 */

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  error: ApiErrorDetail;
  status?: number;
}

export interface RegisterUserRequest {
  name?: string;
}

export interface RegisterUserResponse {
  user_id: string;
  key_id: string;
  name: string;
  api_key: string;
  created_at: string;
}

export interface CreateApiKeyRequest {
  name?: string;
}

export interface ApiKeyRecord {
  key_id: string;
  name: string;
  created_at: string;
  revoked_at?: string | null;
  api_key?: string; // Present only on key creation
}

export type ApiKey = ApiKeyRecord;

export interface ApiKeysListResponse {
  api_keys: ApiKeyRecord[];
}

export interface RevokeApiKeyResponse {
  message: string;
}

export type DayCode = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface TimeRule {
  type: 'time';
  start: string;     // HH:mm format
  end: string;       // HH:mm format
  timezone?: string; // IANA timezone string (e.g. UTC, America/New_York)
  days?: DayCode[];  // Day codes ('mon', 'tue', etc.)
  target_url: string;
}

export interface DeviceRule {
  type: 'device';
  devices: Array<'mobile' | 'tablet' | 'desktop' | 'unknown'>;
  target_url: string;
}

export interface WeightedDestination {
  target_url: string;
  weight: number;
}

export interface WeightedRule {
  type: 'weighted';
  destinations: WeightedDestination[];
}

export type RoutingRule = TimeRule | DeviceRule | WeightedRule;

export interface RoutingConfig {
  default?: string;
  rules?: RoutingRule[];
}

export interface CreateLinkRequest {
  target_url: string;
  alias?: string | null;
  expires_at?: string | null;
  routing_config?: RoutingConfig | null;
}

export interface UpdateLinkRequest {
  target_url?: string;
  expires_at?: string | null;
  routing_config?: RoutingConfig | null;
}

export interface LinkRecord {
  short_code: string;
  target_url: string;
  click_count?: number;
  is_active?: boolean;
  created_at: string;
  expires_at?: string | null;
  routing_config?: RoutingConfig | null;
}

export type Link = LinkRecord;

export interface LinksListResponse {
  links: LinkRecord[];
  limit: number;
  offset: number;
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface TrafficSeriesItem {
  timestamp: string;
  clicks: number;
}

export interface RoutingBreakdownItem {
  route_type: string;
  route_key: string;
  destination_url: string;
  clicks: number;
  percentage?: number;
}

export interface LinkAnalyticsResponse {
  short_code: string;
  total_clicks: number;
  time_range?: {
    from: string;
    to: string;
    interval: 'hour' | 'day';
  };
  traffic_series?: TrafficSeriesItem[];
  routing_breakdown?: RoutingBreakdownItem[];
}

export type LinkAnalytics = LinkAnalyticsResponse;

export interface TopLinkSummary {
  short_code: string;
  target_url: string;
  clicks: number;
}

export interface AnalyticsSummaryResponse {
  total_clicks: number;
  active_links_count: number;
  time_range?: {
    from: string;
    to: string;
  };
  top_links?: TopLinkSummary[];
}

export type AnalyticsSummary = AnalyticsSummaryResponse;

export interface HealthCheckResponse {
  status: 'ok' | string;
  uptime: number;
}

export interface ReadinessCheckResponse {
  status: 'ready' | 'not_ready' | string;
}

export interface SystemMetricsResponse {
  link_creations_total: number;
  link_creation_errors_total: number;
  redirects_total: number;
  redirect_cache_hits_total: number;
  redirect_cache_misses_total: number;
  redirect_not_found_total: number;
  redirect_inactive_total: number;
  redirect_expired_total: number;
  alias_conflicts_total: number;
  deactivations_total: number;
  rate_limit_exceeded_total: number;
  api_keys_created_total: number;
  api_keys_revoked_total: number;
  api_key_auth_successes_total: number;
  api_key_auth_failures_total: number;
  database_errors_total: number;
  routing_evaluations_total: number;
  [key: string]: number;
}

export type OperationalMetricsResponse = SystemMetricsResponse;
