import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, BarChart2, ShieldAlert } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { Skeleton } from '../components/common/Skeleton';
import { CodeText } from '../components/common/CodeText';
import { analyticsApi } from '../api/endpoints/analytics';
import { useAuth } from '../context/AuthContext';
import { formatNumber } from '../utils/formatters';

export const AnalyticsPage: React.FC = () => {
  const { isAuthenticated } = useAuth();

  const { data: summary, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: () => analyticsApi.getSummary(),
    enabled: isAuthenticated,
  });

  const topLinks = summary?.top_links || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Analytics"
        description="Process-buffered traffic metrics and overall developer summary (GET /api/v1/analytics/summary)."
        actions={
          <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={!isAuthenticated} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        }
      />

      {!isAuthenticated ? (
        <div className="p-6 bg-slate-900 border border-brand-border rounded-md text-center">
          <ShieldAlert className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-brand-text font-mono mb-1">Authentication Required</h3>
          <p className="text-xs text-brand-textMuted max-w-md mx-auto mb-4">
            An API key is required to query analytics summaries from the system backend.
          </p>
        </div>
      ) : isError ? (
        <ErrorState error={error as any} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="p-4 bg-brand-surface border border-brand-border rounded-md">
          <Skeleton count={3} className="h-6" />
        </div>
      ) : !summary ? (
        <EmptyState
          title="No Analytics Data"
          description="The analytics buffer is currently empty or has not flushed recorded redirect events."
          icon={<BarChart2 className="w-8 h-8 text-slate-600" />}
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
            <div className="p-4 bg-brand-surface border border-brand-border rounded-md">
              <div className="text-xs text-brand-textMuted uppercase">Total Clicks</div>
              <div className="text-xl font-bold text-sky-400 mt-1">{formatNumber(summary.total_clicks)}</div>
            </div>

            <div className="p-4 bg-brand-surface border border-brand-border rounded-md">
              <div className="text-xs text-brand-textMuted uppercase">Active Links</div>
              <div className="text-xl font-bold text-emerald-400 mt-1">{formatNumber(summary.active_links_count)}</div>
            </div>

            <div className="p-4 bg-brand-surface border border-brand-border rounded-md">
              <div className="text-xs text-brand-textMuted uppercase">Buffer Pipeline</div>
              <div className="text-sm font-bold text-brand-text mt-1">Process-Local Async</div>
            </div>
          </div>

          {topLinks.length > 0 && (
            <div className="border border-brand-border bg-brand-surface rounded-md p-4 space-y-3 font-mono text-xs">
              <h3 className="text-xs font-semibold uppercase text-brand-textMuted">Top Shortcodes Leaderboard</h3>
              <div className="divide-y divide-slate-800">
                {topLinks.map((item) => (
                  <div key={item.short_code} className="py-2 flex items-center justify-between">
                    <CodeText copyable>{item.short_code}</CodeText>
                    <span className="text-slate-400 text-ellipsis overflow-hidden max-w-xs">{item.target_url}</span>
                    <span className="text-sky-400 font-semibold">{formatNumber(item.clicks)} clicks</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
