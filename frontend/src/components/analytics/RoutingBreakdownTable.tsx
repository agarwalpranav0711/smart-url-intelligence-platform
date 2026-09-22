import React from 'react';
import { Network } from 'lucide-react';
import { Skeleton } from '../common/Skeleton';
import { formatNumber } from '../../utils/formatters';

export interface RoutingBreakdownItem {
  route_type: string;
  route_key: string;
  destination_url: string;
  clicks: number;
  percentage?: number;
}

export interface RoutingBreakdownTableProps {
  data: RoutingBreakdownItem[];
  loading?: boolean;
  className?: string;
}

export const formatRouteLabel = (
  routeType: string,
  routeKey: string
): { primary: string; secondary: string } => {
  const normType = (routeType || '').toLowerCase();
  const normKey = (routeKey || '').toLowerCase();

  if (normType === 'default' && normKey === 'default') {
    return { primary: 'Default Rule', secondary: 'Default Config Route' };
  }
  if (normType === 'fallback' && normKey === 'fallback') {
    return { primary: 'Primary Fallback Target', secondary: 'Main Target URL' };
  }
  if (normType === 'time') {
    const match = normKey.match(/rule_(\d+)/);
    const num = match ? parseInt(match[1], 10) + 1 : normKey;
    return { primary: `Time Rule #${num}`, secondary: `Time Match (${routeKey})` };
  }
  if (normType === 'device') {
    const match = normKey.match(/rule_(\d+)/);
    const num = match ? parseInt(match[1], 10) + 1 : normKey;
    return { primary: `Device Rule #${num}`, secondary: `Device Match (${routeKey})` };
  }
  if (normType === 'weighted') {
    const match = normKey.match(/dest_(\d+)/);
    const num = match ? parseInt(match[1], 10) + 1 : normKey;
    return { primary: `Weighted Target #${num}`, secondary: `Weight Bucket (${routeKey})` };
  }

  return { primary: `${routeType.toUpperCase()} Route`, secondary: routeKey };
};

export const RoutingBreakdownTable: React.FC<RoutingBreakdownTableProps> = ({
  data,
  loading = false,
  className = '',
}) => {
  if (loading) {
    return (
      <div className={`p-4 bg-brand-surface border border-brand-border rounded-md ${className}`}>
        <Skeleton count={4} className="h-8 mb-2" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        className={`bg-brand-surface border border-brand-border rounded-md p-6 text-center font-mono text-xs ${className}`}
      >
        <Network className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        <h4 className="font-semibold text-slate-300">No Routing Breakdown Available</h4>
        <p className="text-slate-500 mt-1 max-w-sm mx-auto">
          No traffic routing records were logged for this shortcode during the selected period.
        </p>
      </div>
    );
  }

  const totalClicks = data.reduce((sum, item) => sum + item.clicks, 0);

  return (
    <div
      className={`bg-brand-surface border border-brand-border rounded-md p-4 space-y-3 font-mono text-xs ${className}`}
    >
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
          Traffic Routing Breakdown
        </span>
        <span className="text-slate-500 text-[11px]">
          {data.length} Route {data.length === 1 ? 'Rule' : 'Rules'} Executed
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left divide-y divide-slate-800">
          <thead>
            <tr className="text-[10px] text-slate-400 uppercase">
              <th scope="col" className="pb-2 font-semibold">Route Description</th>
              <th scope="col" className="pb-2 font-semibold">Target Destination</th>
              <th scope="col" className="pb-2 font-semibold text-right">Clicks</th>
              <th scope="col" className="pb-2 font-semibold text-right min-w-[120px]">Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {data.map((item, index) => {
              const label = formatRouteLabel(item.route_type, item.route_key);
              const pct =
                item.percentage !== undefined
                  ? item.percentage
                  : totalClicks > 0
                  ? (item.clicks / totalClicks) * 100
                  : 0;

              return (
                <tr key={`${item.route_type}-${item.route_key}-${index}`} className="hover:bg-slate-900/40">
                  <td className="py-2.5 pr-3">
                    <div className="font-semibold text-slate-200">{label.primary}</div>
                    <div className="text-[10px] text-slate-500">{label.secondary}</div>
                  </td>
                  <td className="py-2.5 px-3 max-w-xs truncate" title={item.destination_url}>
                    <span className="text-slate-300 hover:text-sky-300 font-mono text-ellipsis overflow-hidden block">
                      {item.destination_url}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-sky-400 whitespace-nowrap">
                    {formatNumber(item.clicks)}
                  </td>
                  <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-slate-400 text-[11px] w-12 text-right">
                        {pct.toFixed(1)}%
                      </span>
                      <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
