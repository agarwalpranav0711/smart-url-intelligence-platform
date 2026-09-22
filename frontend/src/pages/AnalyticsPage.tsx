import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, BarChart2, ShieldAlert, Download, Link2 } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { Skeleton } from '../components/common/Skeleton';
import { CodeText } from '../components/common/CodeText';
import { Select } from '../components/common/Select';
import { analyticsApi } from '../api/endpoints/analytics';
import { linksApi } from '../api/endpoints/links';
import { useAuth } from '../context/AuthContext';
import { formatNumber, formatDate } from '../utils/formatters';
import {
  AnalyticsFilterBar,
  FilterState,
  getPresetDates,
} from '../components/analytics/AnalyticsFilterBar';
import { TimeSeriesChart } from '../components/analytics/TimeSeriesChart';
import { RoutingBreakdownTable } from '../components/analytics/RoutingBreakdownTable';
import { TopLinksLeaderboard } from '../components/analytics/TopLinksLeaderboard';

export const AnalyticsPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCode = searchParams.get('code') || '';

  const [selectedCode, setSelectedCode] = useState<string>(initialCode);

  // Initialize filter state with 30-day preset
  const [filterState, setFilterState] = useState<FilterState>(() => {
    const { from, to } = getPresetDates('30d');
    return {
      preset: '30d',
      from,
      to,
      interval: 'day',
    };
  });

  // Query 1: Global Summary
  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    error: summaryErr,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['analytics-summary', filterState.from, filterState.to],
    queryFn: () =>
      analyticsApi.getSummary({
        from: filterState.from,
        to: filterState.to,
        limit: 10,
      }),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  // Query 2: Links List for Selector
  const { data: linksData, isLoading: linksLoading } = useQuery({
    queryKey: ['links', 0],
    queryFn: () => linksApi.list({ limit: 100, offset: 0 }),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const links = linksData?.links || [];

  // Auto-select first link if none selected yet
  useEffect(() => {
    if (!selectedCode && links.length > 0) {
      const firstCode = links[0].short_code;
      setSelectedCode(firstCode);
    }
  }, [links, selectedCode]);

  // Sync search params with selected shortcode
  const handleSelectCode = (code: string) => {
    setSelectedCode(code);
    if (code) {
      setSearchParams({ code });
    } else {
      setSearchParams({});
    }
  };

  // Query 3: Per-Link Analytics
  const {
    data: linkAnalytics,
    isLoading: linkAnalyticsLoading,
    isError: linkAnalyticsError,
    error: linkAnalyticsErr,
    refetch: refetchLinkAnalytics,
  } = useQuery({
    queryKey: [
      'link-analytics',
      selectedCode,
      filterState.from,
      filterState.to,
      filterState.interval,
    ],
    queryFn: () =>
      analyticsApi.getLinkAnalytics(selectedCode, {
        from: filterState.from,
        to: filterState.to,
        interval: filterState.interval,
      }),
    enabled: isAuthenticated && Boolean(selectedCode),
    staleTime: 30_000,
  });

  const handleRefreshAll = () => {
    refetchSummary();
    if (selectedCode) refetchLinkAnalytics();
  };

  // Export CSV Helper
  const handleExportCSV = () => {
    if (!linkAnalytics || !linkAnalytics.traffic_series) return;
    const headers = ['Timestamp', 'Clicks'];
    const rows = linkAnalytics.traffic_series.map((pt) => [pt.timestamp, pt.clicks]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${selectedCode}_traffic_analytics.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export JSON Helper
  const handleExportJSON = () => {
    if (!linkAnalytics) return;
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(linkAnalytics, null, 2)
    )}`;
    const link = document.createElement('a');
    link.setAttribute('href', jsonString);
    link.setAttribute('download', `${selectedCode}_analytics.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const selectedLinkRecord = links.find((l) => l.short_code === selectedCode);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics & Traffic Intelligence"
        description="Hourly-aggregated redirect events, routing decision breakdowns, and traffic performance."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefreshAll}
            disabled={!isAuthenticated}
            className="gap-1.5 font-mono"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        }
      />

      {!isAuthenticated ? (
        <div className="p-6 bg-slate-900 border border-brand-border rounded-md text-center font-mono">
          <ShieldAlert className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-brand-text mb-1">Authentication Required</h3>
          <p className="text-xs text-brand-textMuted max-w-md mx-auto mb-4">
            An API key is required to query system analytics and shortcode traffic series.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Global Filter Bar */}
          <AnalyticsFilterBar
            preset={filterState.preset}
            interval={filterState.interval}
            onChange={(newState) => setFilterState(newState)}
          />

          {/* Section 1: System Summary Cards */}
          {summaryError ? (
            <ErrorState error={summaryErr as any} onRetry={refetchSummary} />
          ) : summaryLoading ? (
            <div className="p-4 bg-brand-surface border border-brand-border rounded-md">
              <Skeleton count={2} className="h-10" />
            </div>
          ) : summary ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
              <div className="p-4 bg-brand-surface border border-brand-border rounded-md">
                <div className="text-xs text-brand-textMuted uppercase">Total Clicks Recorded</div>
                <div className="text-2xl font-bold text-sky-400 mt-1">
                  {formatNumber(summary.total_clicks)}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">In selected time window</div>
              </div>

              <div className="p-4 bg-brand-surface border border-brand-border rounded-md">
                <div className="text-xs text-brand-textMuted uppercase">Active Links</div>
                <div className="text-2xl font-bold text-emerald-400 mt-1">
                  {formatNumber(summary.active_links_count)}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">Managed shortcodes</div>
              </div>

              <div className="p-4 bg-brand-surface border border-brand-border rounded-md">
                <div className="text-xs text-brand-textMuted uppercase">Time Window</div>
                <div className="text-xs font-semibold text-slate-200 mt-1.5 truncate">
                  {formatDate(summary.time_range?.from)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  to {formatDate(summary.time_range?.to)}
                </div>
              </div>
            </div>
          ) : null}

          {/* Section 2: Top Links Leaderboard */}
          {summary?.top_links && summary.top_links.length > 0 && (
            <TopLinksLeaderboard
              data={summary.top_links}
              loading={summaryLoading}
              onSelectLink={handleSelectCode}
            />
          )}

          {/* Section 3: Per-Link Analytics Inspector */}
          <div className="bg-brand-surface border border-brand-border rounded-md p-6 space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-sky-400" />
                <h3 className="text-sm font-semibold text-brand-text font-mono uppercase tracking-wide">
                  Shortcode Traffic Deep-Dive
                </h3>
              </div>

              {/* Shortcode Selector */}
              <div className="flex items-center gap-2 w-full sm:w-auto font-mono text-xs">
                <label htmlFor="shortcode-select" className="text-slate-400 shrink-0">
                  Select Link:
                </label>
                {linksLoading ? (
                  <Skeleton count={1} className="w-48 h-8" />
                ) : links.length === 0 ? (
                  <span className="text-slate-500 text-xs">No shortcodes available</span>
                ) : (
                  <Select
                    id="shortcode-select"
                    value={selectedCode}
                    onChange={(e) => handleSelectCode(e.target.value)}
                    options={links.map((l) => ({
                      value: l.short_code,
                      label: `${l.short_code} (${l.target_url})`,
                    }))}
                    className="w-full sm:w-64"
                  />
                )}
              </div>
            </div>

            {!selectedCode ? (
              <EmptyState
                title="No Shortcode Selected"
                description="Select a shortcode from the registry dropdown above to view traffic series and routing breakdown."
                icon={<Link2 className="w-8 h-8 text-slate-600" />}
              />
            ) : linkAnalyticsError ? (
              <ErrorState error={linkAnalyticsErr as any} onRetry={refetchLinkAnalytics} />
            ) : linkAnalyticsLoading ? (
              <div className="space-y-4">
                <Skeleton count={2} className="h-8" />
                <Skeleton count={1} className="h-48" />
              </div>
            ) : linkAnalytics ? (
              <div className="space-y-6 font-mono text-xs">
                {/* Shortcode Stats Bar */}
                <div className="bg-slate-900 border border-slate-800 rounded p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-xs uppercase">Inspecting:</span>
                      <CodeText copyable className="text-sm font-bold">
                        {linkAnalytics.short_code}
                      </CodeText>
                      {selectedLinkRecord && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/links/${selectedCode}`)}
                          className="text-[11px] px-2"
                        >
                          View Link Details →
                        </Button>
                      )}
                    </div>
                    {selectedLinkRecord && (
                      <div className="text-slate-400 text-[11px] mt-1 truncate max-w-lg">
                        Target: {selectedLinkRecord.target_url}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-[10px] text-slate-500 uppercase">Range Total Clicks</div>
                      <div className="text-xl font-bold text-sky-400">
                        {formatNumber(linkAnalytics.total_clicks)}
                      </div>
                    </div>

                    {/* Export Actions */}
                    <div className="flex gap-1.5 pl-2 border-l border-slate-800">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleExportCSV}
                        title="Export Traffic Series to CSV"
                        className="text-[11px] px-2 gap-1"
                      >
                        <Download className="w-3 h-3" />
                        CSV
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleExportJSON}
                        title="Export Analytics Payload to JSON"
                        className="text-[11px] px-2 gap-1"
                      >
                        <Download className="w-3 h-3" />
                        JSON
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Time Series Chart */}
                <TimeSeriesChart
                  data={linkAnalytics.traffic_series || []}
                  interval={filterState.interval}
                  loading={false}
                />

                {/* Routing Breakdown Table */}
                <RoutingBreakdownTable
                  data={linkAnalytics.routing_breakdown || []}
                  loading={false}
                />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
