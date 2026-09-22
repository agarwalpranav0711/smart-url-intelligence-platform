import React, { useState } from 'react';
import { Skeleton } from '../common/Skeleton';
import { formatNumber } from '../../utils/formatters';

export interface TimeSeriesPoint {
  timestamp: string;
  clicks: number;
}

export interface TimeSeriesChartProps {
  data: TimeSeriesPoint[];
  interval: 'hour' | 'day';
  loading?: boolean;
  className?: string;
}

const formatXAxisLabel = (isoString: string, interval: 'hour' | 'day'): string => {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;

  if (interval === 'hour') {
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${mins}`;
  }

  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const day = d.getDate();
  return `${month} ${day}`;
};

const formatTooltipDate = (isoString: string): string => {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  data,
  interval,
  loading = false,
  className = '',
}) => {
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);

  if (loading) {
    return (
      <div className={`p-4 bg-brand-surface border border-brand-border rounded-md ${className}`}>
        <Skeleton count={1} className="h-48 w-full" />
      </div>
    );
  }

  const SVG_WIDTH = 800;
  const SVG_HEIGHT = 280;
  const PADDING = { top: 25, right: 25, bottom: 45, left: 50 };

  const plotWidth = SVG_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = SVG_HEIGHT - PADDING.top - PADDING.bottom;

  if (!data || data.length === 0) {
    return (
      <div
        className={`bg-brand-surface border border-brand-border rounded-md p-6 text-center font-mono text-xs ${className}`}
      >
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full h-48 text-slate-700"
          role="img"
          aria-label="Empty traffic series chart"
        >
          <rect
            x={PADDING.left}
            y={PADDING.top}
            width={plotWidth}
            height={plotHeight}
            fill="none"
            stroke="currentColor"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
          <text
            x={SVG_WIDTH / 2}
            y={SVG_HEIGHT / 2}
            textAnchor="middle"
            fill="#94a3b8"
            className="text-xs font-mono"
          >
            No traffic recorded for this time range
          </text>
        </svg>
      </div>
    );
  }

  const rawMaxY = Math.max(...data.map((d) => d.clicks), 0);
  const maxY = rawMaxY === 0 ? 5 : Math.ceil(rawMaxY * 1.15); // Add 15% headroom

  const points = data.map((d, index) => {
    let x: number;
    if (data.length === 1) {
      x = PADDING.left + plotWidth / 2;
    } else {
      x = PADDING.left + (index / (data.length - 1)) * plotWidth;
    }
    const y = PADDING.top + plotHeight - (d.clicks / maxY) * plotHeight;
    return { x, y, clicks: d.clicks, timestamp: d.timestamp, index };
  });

  // Construct path string
  let linePathD = '';
  let areaPathD = '';

  if (points.length === 1) {
    const pt = points[0];
    linePathD = `M ${PADDING.left} ${pt.y} L ${PADDING.left + plotWidth} ${pt.y}`;
    areaPathD = `M ${PADDING.left} ${PADDING.top + plotHeight} L ${PADDING.left} ${pt.y} L ${
      PADDING.left + plotWidth
    } ${pt.y} L ${PADDING.left + plotWidth} ${PADDING.top + plotHeight} Z`;
  } else {
    linePathD = points.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`, '');
    areaPathD = `${linePathD} L ${points[points.length - 1].x} ${PADDING.top + plotHeight} L ${
      points[0].x
    } ${PADDING.top + plotHeight} Z`;
  }

  // Y-axis grid ticks (4 ticks: 0, 1/3, 2/3, maxY)
  const yTicks = [0, Math.round(maxY / 3), Math.round((maxY * 2) / 3), maxY];

  // Select X-axis ticks (max 6 visible ticks)
  const maxXTicks = 6;
  const xTickIndices: number[] = [];
  if (points.length <= maxXTicks) {
    points.forEach((_, i) => xTickIndices.push(i));
  } else {
    const step = (points.length - 1) / (maxXTicks - 1);
    for (let i = 0; i < maxXTicks; i++) {
      xTickIndices.push(Math.round(i * step));
    }
  }

  const activePoint = activePointIndex !== null ? points[activePointIndex] : null;

  return (
    <div className={`bg-brand-surface border border-brand-border rounded-md p-4 relative ${className}`}>
      <div className="flex items-center justify-between mb-2 font-mono text-xs">
        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
          Click Traffic Series ({interval === 'hour' ? 'Hourly' : 'Daily'})
        </span>
        {activePoint && (
          <span className="text-sky-400 font-bold bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-[11px]">
            {formatTooltipDate(activePoint.timestamp)}: {formatNumber(activePoint.clicks)} clicks
          </span>
        )}
      </div>

      <div className="w-full relative">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full h-auto overflow-visible select-none"
          role="img"
          aria-label={`Time series traffic chart showing ${data.length} points for interval ${interval}`}
        >
          <defs>
            <linearGradient id="skyGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines and Y-axis labels */}
          {yTicks.map((val, idx) => {
            const yPos = PADDING.top + plotHeight - (val / maxY) * plotHeight;
            return (
              <g key={`y-grid-${idx}`}>
                <line
                  x1={PADDING.left}
                  y1={yPos}
                  x2={PADDING.left + plotWidth}
                  y2={yPos}
                  stroke="#1e293b"
                  strokeDasharray={idx === 0 ? undefined : '3 3'}
                  strokeWidth="1"
                />
                <text
                  x={PADDING.left - 8}
                  y={yPos + 4}
                  textAnchor="end"
                  fill="#64748b"
                  className="text-[10px] font-mono fill-slate-500"
                >
                  {formatNumber(val)}
                </text>
              </g>
            );
          })}

          {/* X-axis line */}
          <line
            x1={PADDING.left}
            y1={PADDING.top + plotHeight}
            x2={PADDING.left + plotWidth}
            y2={PADDING.top + plotHeight}
            stroke="#334155"
            strokeWidth="1"
          />

          {/* Area under curve */}
          <path d={areaPathD} fill="url(#skyGradient)" />

          {/* Main line path */}
          <path
            d={linePathD}
            fill="none"
            stroke="#0ea5e9"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive Data Points */}
          {points.map((pt) => {
            const isActive = activePointIndex === pt.index;
            return (
              <g key={`pt-${pt.index}`}>
                {/* Outer halo on hover */}
                {isActive && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="7"
                    fill="#0ea5e9"
                    fillOpacity="0.3"
                    className="transition-all duration-150"
                  />
                )}
                {/* Data point circle */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isActive ? '4.5' : '3'}
                  fill={isActive ? '#38bdf8' : '#0ea5e9'}
                  stroke="#0f172a"
                  strokeWidth="1.5"
                  tabIndex={0}
                  role="button"
                  aria-label={`${formatTooltipDate(pt.timestamp)}: ${pt.clicks} clicks`}
                  className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-400 rounded-full"
                  onMouseEnter={() => setActivePointIndex(pt.index)}
                  onMouseLeave={() => setActivePointIndex(null)}
                  onFocus={() => setActivePointIndex(pt.index)}
                  onBlur={() => setActivePointIndex(null)}
                />
              </g>
            );
          })}

          {/* X-axis tick labels */}
          {xTickIndices.map((idx) => {
            const pt = points[idx];
            if (!pt) return null;
            return (
              <text
                key={`x-label-${idx}`}
                x={pt.x}
                y={SVG_HEIGHT - 12}
                textAnchor="middle"
                fill="#64748b"
                className="text-[10px] font-mono fill-slate-500"
              >
                {formatXAxisLabel(pt.timestamp, interval)}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
