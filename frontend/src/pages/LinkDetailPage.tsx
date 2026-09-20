import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, ShieldAlert, Trash2, Edit3, Globe, Clock, BarChart2 } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { CodeText } from '../components/common/CodeText';
import { ErrorState } from '../components/common/ErrorState';
import { Skeleton } from '../components/common/Skeleton';
import { EditLinkModal } from '../components/common/EditLinkModal';
import { DeactivateLinkModal } from '../components/common/DeactivateLinkModal';
import { RoutingSummaryCard } from '../components/common/RoutingSummaryCard';
import { linksApi } from '../api/endpoints/links';
import { analyticsApi } from '../api/endpoints/analytics';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatNumber } from '../utils/formatters';

export const LinkDetailPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const rawBaseUrl =
    (import.meta.env.VITE_PUBLIC_BASE_URL as string) || (typeof window !== 'undefined' ? window.location.origin : '');
  const publicBaseUrl = rawBaseUrl.replace(/\/+$/, '');

  // 1. Fetch shortcode from list query to locate link record
  const { data: listData, isLoading: listLoading, isError: listError, error: linkErr, refetch: refetchList } = useQuery({
    queryKey: ['links', 0],
    queryFn: () => linksApi.list({ limit: 100, offset: 0 }),
    enabled: isAuthenticated && Boolean(code),
  });

  // 2. Fetch shortcode analytics summary
  const { data: analyticsData, isLoading: analyticsLoading, refetch: refetchAnalytics } = useQuery({
    queryKey: ['link-analytics', code],
    queryFn: () => analyticsApi.getLinkAnalytics(code || ''),
    enabled: isAuthenticated && Boolean(code),
  });

  const link = listData?.links?.find((l) => l.short_code === code);
  const handleRefresh = () => {
    refetchList();
    refetchAnalytics();
  };

  const handleUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ['links'] });
    queryClient.invalidateQueries({ queryKey: ['link-analytics', code] });
  };

  const handleDeactivated = () => {
    queryClient.invalidateQueries({ queryKey: ['links'] });
    queryClient.invalidateQueries({ queryKey: ['link-analytics', code] });
  };

  const fullShortUrl = code ? `${publicBaseUrl}/s/${code}` : '';
  const isExpired = link?.expires_at ? new Date(link.expires_at) <= new Date() : false;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Shortcode Resource: ${code || ''}`}
        description="Managed URL target, operational lifecycle, routing rules, and click metrics."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate('/links')} className="gap-1.5 font-mono">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Registry
            </Button>
            <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={!isAuthenticated}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        }
      />

      {!isAuthenticated ? (
        <div className="p-6 bg-slate-900 border border-brand-border rounded-md text-center font-mono">
          <ShieldAlert className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-brand-text mb-1">Authentication Required</h3>
          <p className="text-xs text-brand-textMuted max-w-md mx-auto mb-4">
            An API key is required to view shortcode details and analytics.
          </p>
        </div>
      ) : listError ? (
        <ErrorState error={linkErr as any} onRetry={handleRefresh} />
      ) : listLoading || analyticsLoading ? (
        <div className="p-4 bg-brand-surface border border-brand-border rounded-md">
          <Skeleton count={6} className="h-6" />
        </div>
      ) : !link && !analyticsData ? (
        <div className="text-center p-8 bg-brand-surface border border-brand-border rounded font-mono text-xs text-slate-400">
          Shortcode resource <span className="text-slate-200 font-semibold">{code}</span> was not found in active link registry.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top Bar Header & Action Buttons */}
          <div className="bg-brand-surface border border-brand-border rounded-md p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-mono text-xs">
            <div className="flex items-center gap-3">
              <CodeText copyable className="text-sm font-bold">{code || ''}</CodeText>
              {isExpired ? (
                <Badge variant="warning">EXPIRED</Badge>
              ) : link?.is_active ?? true ? (
                <Badge variant="success">ACTIVE</Badge>
              ) : (
                <Badge variant="error">INACTIVE</Badge>
              )}
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              {link?.is_active && !isExpired && (
                <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5 font-mono">
                  <Edit3 className="w-3.5 h-3.5 text-sky-400" /> Edit Properties
                </Button>
              )}
              {link?.is_active && !isExpired && (
                <Button variant="danger" size="sm" onClick={() => setDeactivateOpen(true)} className="gap-1.5 font-mono">
                  <Trash2 className="w-3.5 h-3.5" /> Deactivate
                </Button>
              )}
            </div>
          </div>

          {/* Desktop Two-Column Layout / Mobile Stack */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Section 1: Target Destination URL */}
            <div className="bg-brand-surface border border-brand-border rounded-md p-6 space-y-4 font-mono text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-brand-text font-semibold text-sm">
                  <Globe className="w-4 h-4 text-sky-400" />
                  <span>Target Destination URL</span>
                </div>
                {link?.is_active && !isExpired && (
                  <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)} className="text-[11px] px-2">
                    Edit Destination
                  </Button>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase mb-1">Public Short URL</div>
                  <CodeText block copyable>{fullShortUrl}</CodeText>
                </div>

                <div>
                  <div className="text-[10px] text-slate-400 uppercase mb-1">Primary Target Destination</div>
                  <CodeText block copyable>{link?.target_url || 'Target mapping established'}</CodeText>
                </div>
              </div>
            </div>

            {/* Section 2: Lifecycle & Expiration */}
            <div className="bg-brand-surface border border-brand-border rounded-md p-6 space-y-4 font-mono text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-brand-text font-semibold text-sm">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>Operational Lifecycle</span>
                </div>
                {link?.is_active && !isExpired && (
                  <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)} className="text-[11px] px-2">
                    Edit Expiration
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase mb-1">Creation Date</div>
                  <div className="text-slate-200 font-medium">{formatDate(link?.created_at)}</div>
                </div>

                <div>
                  <div className="text-[10px] text-slate-400 uppercase mb-1">Expiration Date</div>
                  <div className="text-slate-200 font-medium">
                    {link?.expires_at ? formatDate(link.expires_at) : 'Permanent (No Expiration)'}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-slate-400 uppercase mb-1">Public State</div>
                  <div>
                    {isExpired ? (
                      <span className="text-amber-400 font-semibold">Expired (HTTP 410)</span>
                    ) : link?.is_active ?? true ? (
                      <span className="text-emerald-400 font-semibold">Active Redirect (HTTP 302)</span>
                    ) : (
                      <span className="text-rose-400 font-semibold">Deactivated (HTTP 410)</span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-slate-400 uppercase mb-1">Click Volume</div>
                  <div className="text-base font-bold text-sky-400">
                    {formatNumber(analyticsData?.total_clicks ?? link?.click_count ?? 0)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Traffic Routing Pipeline Summary */}
          <RoutingSummaryCard routingConfig={link?.routing_config} code={code || ''} />

          {/* Section 4: Analytics Summary & Recorded Breakdown */}
          {analyticsData && (
            <div className="bg-brand-surface border border-brand-border rounded-md p-6 space-y-4 font-mono text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-brand-text font-semibold text-sm">
                  <BarChart2 className="w-4 h-4 text-emerald-400" />
                  <span>Recorded Analytics Snapshot</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate('/analytics')} className="text-[11px]">
                  View Full Analytics →
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 bg-slate-900 border border-slate-800 rounded">
                  <div className="text-[10px] text-slate-400 uppercase">Total Clicks Recorded</div>
                  <div className="text-xl font-bold text-sky-400 mt-1">{formatNumber(analyticsData.total_clicks)}</div>
                </div>

                <div className="p-3 bg-slate-900 border border-slate-800 rounded">
                  <div className="text-[10px] text-slate-400 uppercase">Time Series Points</div>
                  <div className="text-xl font-bold text-emerald-400 mt-1">
                    {analyticsData.traffic_series ? analyticsData.traffic_series.length : 0} Buckets
                  </div>
                </div>
              </div>

              {analyticsData.routing_breakdown && analyticsData.routing_breakdown.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Routing Destination Breakdown</div>
                  <div className="border border-slate-800 rounded overflow-hidden divide-y divide-slate-800">
                    {analyticsData.routing_breakdown.map((item, idx) => (
                      <div key={idx} className="p-2.5 bg-slate-900 flex items-center justify-between">
                        <div>
                          <span className="text-slate-200 font-semibold">{item.route_type}</span>
                          <span className="text-slate-500 ml-2">({item.route_key})</span>
                        </div>
                        <div className="text-slate-400 max-w-xs truncate">{item.destination_url}</div>
                        <div className="text-sky-400 font-semibold">{formatNumber(item.clicks)} clicks</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Edit Modal */}
          <EditLinkModal
            isOpen={editOpen}
            link={link || null}
            onClose={() => setEditOpen(false)}
            onSuccess={handleUpdated}
          />

          {/* Deactivate Modal */}
          <DeactivateLinkModal
            isOpen={deactivateOpen}
            code={code || null}
            onClose={() => setDeactivateOpen(false)}
            onSuccess={handleDeactivated}
          />
        </div>
      )}
    </div>
  );
};
