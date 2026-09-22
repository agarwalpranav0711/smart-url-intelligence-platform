import React from 'react';
import { Calendar, Clock } from 'lucide-react';
import { Button } from '../common/Button';

export type RangePreset = '24h' | '7d' | '30d' | '90d';
export type Granularity = 'hour' | 'day';

export interface FilterState {
  preset: RangePreset;
  from: string;
  to: string;
  interval: Granularity;
}

export interface AnalyticsFilterBarProps {
  preset: RangePreset;
  interval: Granularity;
  onChange: (state: FilterState) => void;
  disabled?: boolean;
}

export const getPresetDates = (preset: RangePreset): { from: string; to: string } => {
  const now = new Date();
  const to = now.toISOString();
  let fromMs = now.getTime();

  switch (preset) {
    case '24h':
      fromMs -= 24 * 60 * 60 * 1000;
      break;
    case '7d':
      fromMs -= 7 * 24 * 60 * 60 * 1000;
      break;
    case '30d':
      fromMs -= 30 * 24 * 60 * 60 * 1000;
      break;
    case '90d':
      fromMs -= 90 * 24 * 60 * 60 * 1000;
      break;
  }

  return { from: new Date(fromMs).toISOString(), to };
};

export const AnalyticsFilterBar: React.FC<AnalyticsFilterBarProps> = ({
  preset,
  interval,
  onChange,
  disabled = false,
}) => {
  const handlePresetSelect = (newPreset: RangePreset) => {
    const { from, to } = getPresetDates(newPreset);
    const defaultInterval: Granularity = newPreset === '24h' ? 'hour' : 'day';
    onChange({
      preset: newPreset,
      from,
      to,
      interval: defaultInterval,
    });
  };

  const handleIntervalSelect = (newInterval: Granularity) => {
    const { from, to } = getPresetDates(preset);
    onChange({
      preset,
      from,
      to,
      interval: newInterval,
    });
  };

  const presets: Array<{ key: RangePreset; label: string }> = [
    { key: '24h', label: 'Last 24 Hours' },
    { key: '7d', label: 'Last 7 Days' },
    { key: '30d', label: 'Last 30 Days' },
    { key: '90d', label: 'Last 90 Days' },
  ];

  return (
    <div className="bg-brand-surface border border-brand-border rounded-md p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-mono text-xs">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-slate-400 flex items-center gap-1 mr-2 text-[11px] uppercase tracking-wide">
          <Calendar className="w-3.5 h-3.5 text-sky-400" />
          Range:
        </span>
        {presets.map((p) => (
          <Button
            key={p.key}
            variant={preset === p.key ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => handlePresetSelect(p.key)}
            disabled={disabled}
            className="text-[11px] px-2.5 py-1"
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 self-end sm:self-auto">
        <span className="text-slate-400 flex items-center gap-1 mr-2 text-[11px] uppercase tracking-wide">
          <Clock className="w-3.5 h-3.5 text-emerald-400" />
          Interval:
        </span>
        <Button
          variant={interval === 'hour' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => handleIntervalSelect('hour')}
          disabled={disabled}
          className="text-[11px] px-2.5 py-1"
        >
          Hourly
        </Button>
        <Button
          variant={interval === 'day' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => handleIntervalSelect('day')}
          disabled={disabled}
          className="text-[11px] px-2.5 py-1"
        >
          Daily
        </Button>
      </div>
    </div>
  );
};
