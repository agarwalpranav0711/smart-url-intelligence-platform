import React from 'react';
import { Link } from 'react-router-dom';
import { Route, Clock, Smartphone, Scale, ArrowRight, ShieldCheck } from 'lucide-react';
import { Badge } from './Badge';
import { Button } from './Button';
import { CodeText } from './CodeText';
import { RoutingConfig } from '../../api/types';

export interface RoutingSummaryCardProps {
  routingConfig: RoutingConfig | null | undefined;
  code: string;
}

export const RoutingSummaryCard: React.FC<RoutingSummaryCardProps> = ({ routingConfig, code }) => {
  const rules = Array.isArray(routingConfig?.rules)
    ? routingConfig.rules.filter((r) => r && typeof r === 'object' && typeof r.type === 'string')
    : [];

  const defaultFallback =
    typeof routingConfig?.default === 'string' && routingConfig.default.trim().length > 0
      ? routingConfig.default.trim()
      : null;

  const timeRules = rules.filter((r) => r.type === 'time');
  const deviceRules = rules.filter((r) => r.type === 'device');
  const weightedRules = rules.filter((r) => r.type === 'weighted');

  const weightedDestinationsCount = weightedRules.reduce((acc, r) => {
    return acc + (Array.isArray(r.destinations) ? r.destinations.length : 0);
  }, 0);

  const hasAdvancedRouting = rules.length > 0 || Boolean(defaultFallback);

  return (
    <div className="bg-brand-surface border border-brand-border rounded-md p-6 space-y-4 font-mono text-xs">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2 text-brand-text font-semibold text-sm">
          <Route className="w-4 h-4 text-brand-primary" />
          <span>Traffic Routing Pipeline</span>
        </div>
        {hasAdvancedRouting ? <Badge variant="routing">Advanced Engine</Badge> : <Badge variant="neutral">Direct 302</Badge>}
      </div>

      {!hasAdvancedRouting ? (
        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded text-slate-400 space-y-2">
          <div className="flex items-center gap-2 text-slate-300 font-semibold">
            <ShieldCheck className="w-4 h-4 text-emerald-400" /> Standard 302 Pass-Through
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
            Incoming HTTP GET traffic to shortcode <span className="font-mono text-slate-300">/s/{code}</span> issues a direct HTTP 302 Found redirect to the primary destination URL without conditional evaluation.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {timeRules.length > 0 && (
              <div className="p-3 bg-slate-900 border border-slate-800 rounded flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-200">{timeRules.length} Time Rule{timeRules.length > 1 ? 's' : ''}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 font-sans">Timezone & hour bounds</div>
                </div>
              </div>
            )}

            {deviceRules.length > 0 && (
              <div className="p-3 bg-slate-900 border border-slate-800 rounded flex items-start gap-2.5">
                <Smartphone className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-200">{deviceRules.length} Device Rule{deviceRules.length > 1 ? 's' : ''}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 font-sans">Mobile/desktop targeting</div>
                </div>
              </div>
            )}

            {weightedRules.length > 0 && (
              <div className="p-3 bg-slate-900 border border-slate-800 rounded flex items-start gap-2.5">
                <Scale className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-200">{weightedRules.length} Weighted Rule{weightedRules.length > 1 ? 's' : ''}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 font-sans">
                    {weightedDestinationsCount} destination{weightedDestinationsCount !== 1 ? 's' : ''} distribution
                  </div>
                </div>
              </div>
            )}
          </div>

          {defaultFallback && (
            <div className="p-3 bg-slate-900 border border-slate-800 rounded space-y-1">
              <div className="text-[10px] text-slate-400 uppercase">Default Fallback URL</div>
              <CodeText copyable>{defaultFallback}</CodeText>
            </div>
          )}
        </div>
      )}

      <div className="pt-2 flex justify-end border-t border-slate-800">
        <Link to={`/links/${code}/routing`}>
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5 font-mono text-xs"
          >
            Configure Routing <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
};
