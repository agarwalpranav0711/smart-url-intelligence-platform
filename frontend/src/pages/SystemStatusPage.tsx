import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, RefreshCw, Server, Database } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { ErrorState } from '../components/common/ErrorState';
import { Skeleton } from '../components/common/Skeleton';
import { opsApi } from '../api/endpoints/ops';

export const SystemStatusPage: React.FC = () => {
  const { data: health, isLoading: healthLoading, isError: healthIsError, error: healthError, refetch: refetchHealth } = useQuery({
    queryKey: ['health'],
    queryFn: () => opsApi.health(),
    refetchInterval: 15000,
  });

  const { data: ready, isLoading: readyLoading, refetch: refetchReady } = useQuery({
    queryKey: ['readiness'],
    queryFn: () => opsApi.readiness(),
    refetchInterval: 15000,
  });

  const handleRefresh = () => {
    refetchHealth();
    refetchReady();
  };

  const isHealthy = health?.status === 'ok' || health?.status === 'healthy' || health?.status === 'OK';
  const isReady = ready?.status === 'ready' || ready?.status === 'OK';

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Status & Operations"
        description="Live operational health metrics, database connectivity, and readiness probes."
        actions={
          <Button variant="secondary" size="sm" onClick={handleRefresh} className="gap-1.5 font-mono">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Diagnostics
          </Button>
        }
      />

      {healthIsError ? (
        <ErrorState error={healthError as any} onRetry={handleRefresh} title="Health Endpoint Unavailable" />
      ) : healthLoading || readyLoading ? (
        <div className="p-4 bg-brand-surface border border-brand-border rounded-md">
          <Skeleton count={4} className="h-6" />
        </div>
      ) : (
        <div className="space-y-6 font-mono text-xs">
          {/* Status Banners */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-brand-surface border border-brand-border rounded-md">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 uppercase font-semibold flex items-center gap-1.5">
                  <Server className="w-4 h-4 text-sky-400" /> API Health Probe
                </span>
                {isHealthy ? <Badge variant="success">OK (200)</Badge> : <Badge variant="error">Degraded</Badge>}
              </div>
              <div className="mt-3 text-slate-300">
                Uptime: <span className="text-slate-400">{health?.uptime ? `${health.uptime}s` : 'N/A'}</span>
              </div>
            </div>

            <div className="p-4 bg-brand-surface border border-brand-border rounded-md">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 uppercase font-semibold flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-indigo-400" /> Database Readiness Probe
                </span>
                {isReady ? <Badge variant="success">READY (200)</Badge> : <Badge variant="error">Not Ready</Badge>}
              </div>
              <div className="mt-3 text-slate-300">
                PostgreSQL Connection: <span className="text-emerald-400">Established</span>
              </div>
            </div>
          </div>

          {/* Operational Engine Info */}
          <div className="bg-brand-surface border border-brand-border rounded-md p-6 space-y-4">
            <h2 className="text-sm font-semibold text-brand-text flex items-center gap-2">
              <Activity className="w-4 h-4 text-brand-primary" /> Core Engine Operational Metadata
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-3 bg-slate-900 border border-slate-800 rounded">
                <div className="text-[10px] text-slate-400 uppercase">Redirect Engine</div>
                <div className="text-slate-200 font-semibold mt-1">LRU Cache + Rules Pipeline</div>
              </div>

              <div className="p-3 bg-slate-900 border border-slate-800 rounded">
                <div className="text-[10px] text-slate-400 uppercase">Authentication Provider</div>
                <div className="text-slate-200 font-semibold mt-1">SHA-256 Bearer Token</div>
              </div>

              <div className="p-3 bg-slate-900 border border-slate-800 rounded">
                <div className="text-[10px] text-slate-400 uppercase">Idempotency Guard</div>
                <div className="text-slate-200 font-semibold mt-1">Transactional Key Lock</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
