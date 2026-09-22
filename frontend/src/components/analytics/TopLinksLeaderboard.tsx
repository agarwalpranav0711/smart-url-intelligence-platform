import React from 'react';
import { Award, ExternalLink } from 'lucide-react';
import { CodeText } from '../common/CodeText';
import { Skeleton } from '../common/Skeleton';
import { formatNumber } from '../../utils/formatters';

export interface TopLinkItem {
  short_code: string;
  target_url: string;
  clicks: number;
}

export interface TopLinksLeaderboardProps {
  data: TopLinkItem[];
  loading?: boolean;
  onSelectLink?: (shortCode: string) => void;
  className?: string;
}

export const TopLinksLeaderboard: React.FC<TopLinksLeaderboardProps> = ({
  data,
  loading = false,
  onSelectLink,
  className = '',
}) => {
  if (loading) {
    return (
      <div className={`p-4 bg-brand-surface border border-brand-border rounded-md ${className}`}>
        <Skeleton count={3} className="h-8 mb-2" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        className={`bg-brand-surface border border-brand-border rounded-md p-6 text-center font-mono text-xs text-slate-500 ${className}`}
      >
        No links recorded traffic during this summary period.
      </div>
    );
  }

  return (
    <div
      className={`bg-brand-surface border border-brand-border rounded-md p-4 space-y-3 font-mono text-xs ${className}`}
    >
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
          <Award className="w-3.5 h-3.5 text-amber-400" />
          Top Links Leaderboard
        </span>
        <span className="text-slate-500 text-[11px]">{data.length} Ranked Links</span>
      </div>

      <div className="divide-y divide-slate-800">
        {data.map((item, index) => {
          const rank = index + 1;
          const rankColor =
            rank === 1
              ? 'text-amber-400 font-bold'
              : rank === 2
              ? 'text-slate-300 font-bold'
              : rank === 3
              ? 'text-amber-600 font-bold'
              : 'text-slate-500';

          return (
            <div
              key={item.short_code}
              className="py-2.5 flex items-center justify-between gap-3 hover:bg-slate-900/40 px-1 rounded transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`w-6 text-center ${rankColor}`}>#{rank}</span>
                <button
                  type="button"
                  onClick={() => onSelectLink && onSelectLink(item.short_code)}
                  className="hover:opacity-80 focus:outline-none focus:ring-1 focus:ring-sky-400 rounded text-left"
                  aria-label={`Inspect analytics for short code ${item.short_code}`}
                >
                  <CodeText copyable={false}>{item.short_code}</CodeText>
                </button>
                <span
                  className="text-slate-400 truncate max-w-xs text-[11px] hidden sm:inline"
                  title={item.target_url}
                >
                  {item.target_url}
                </span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sky-400 font-semibold">{formatNumber(item.clicks)} clicks</span>
                {onSelectLink && (
                  <button
                    type="button"
                    onClick={() => onSelectLink(item.short_code)}
                    className="text-slate-500 hover:text-sky-300 transition-colors p-1"
                    title="Select link for per-link analytics"
                    aria-label={`Select ${item.short_code} for analytics`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
