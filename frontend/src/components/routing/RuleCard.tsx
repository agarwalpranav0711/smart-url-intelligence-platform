import React from 'react';
import { ArrowUp, ArrowDown, Edit2, Trash2, Clock, Smartphone, Scale } from 'lucide-react';
import { Badge } from '../common/Badge';
import { CodeText } from '../common/CodeText';
import { RoutingRule } from '../../api/types';

export interface RuleCardProps {
  rule: RoutingRule;
  index: number;
  totalRules: number;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
}

export const RuleCard: React.FC<RuleCardProps> = ({
  rule,
  index,
  totalRules,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
}) => {
  const isFirst = index === 0;
  const isLast = index === totalRules - 1;

  const renderContent = () => {
    if (rule.type === 'time') {
      const daysStr = Array.isArray(rule.days) && rule.days.length > 0
        ? rule.days.map((d) => String(d).toUpperCase()).join(', ')
        : 'All Days';

      return (
        <div className="space-y-1.5 font-mono text-xs">
          <div className="flex items-center gap-2 text-indigo-300 font-semibold">
            <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>{rule.start} - {rule.end} ({rule.timezone || 'UTC'})</span>
            <span className="text-[10px] text-indigo-400/80 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/40">
              {daysStr}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-[10px] uppercase">Destination:</span>
            <CodeText copyable>{rule.target_url}</CodeText>
          </div>
        </div>
      );
    }

    if (rule.type === 'device') {
      const devicesStr = Array.isArray(rule.devices)
        ? rule.devices.map((d) => d.toUpperCase()).join(', ')
        : 'ANY';

      return (
        <div className="space-y-1.5 font-mono text-xs">
          <div className="flex items-center gap-2 text-sky-300 font-semibold">
            <Smartphone className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>Target Devices: {devicesStr}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-[10px] uppercase">Destination:</span>
            <CodeText copyable>{rule.target_url}</CodeText>
          </div>
        </div>
      );
    }

    if (rule.type === 'weighted') {
      const destinations = Array.isArray(rule.destinations) ? rule.destinations : [];
      const totalWeight = destinations.reduce((sum, d) => sum + (d.weight || 0), 0);

      return (
        <div className="space-y-2 font-mono text-xs">
          <div className="flex items-center gap-2 text-amber-300 font-semibold">
            <Scale className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Weighted Traffic Distribution ({destinations.length} destinations, sum: {totalWeight})</span>
          </div>
          <div className="space-y-1 pl-2 border-l-2 border-amber-900/60">
            {destinations.map((d, dIdx) => {
              const pct = totalWeight > 0 ? ((d.weight / totalWeight) * 100).toFixed(1) : '0';
              return (
                <div key={dIdx} className="flex items-center justify-between text-[11px] gap-2">
                  <div className="truncate shrink min-w-0">
                    <CodeText copyable>{d.target_url}</CodeText>
                  </div>
                  <div className="shrink-0 text-amber-400 font-semibold">
                    {d.weight} wt ({pct}%)
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return null;
  };

  const getBadge = () => {
    if (rule.type === 'time') return <Badge variant="routing">Time Rule</Badge>;
    if (rule.type === 'device') return <Badge variant="primary">Device Rule</Badge>;
    if (rule.type === 'weighted') return <Badge variant="warning">Weighted Rule</Badge>;
    return null;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-md p-4 space-y-3 transition-colors">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 font-bold flex items-center justify-center text-[10px]">
            {index + 1}
          </span>
          {getBadge()}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMoveUp(index)}
            disabled={isFirst}
            aria-label={`Move rule #${index + 1} up`}
            title={isFirst ? 'First rule in pipeline' : 'Move rule up'}
            className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 rounded transition-colors"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMoveDown(index)}
            disabled={isLast}
            aria-label={`Move rule #${index + 1} down`}
            title={isLast ? 'Last rule in pipeline' : 'Move rule down'}
            className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 rounded transition-colors"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-3.5 bg-slate-800 mx-1" />

          <button
            type="button"
            onClick={() => onEdit(index)}
            aria-label={`Edit rule #${index + 1}`}
            title="Edit rule settings"
            className="p-1 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(index)}
            aria-label={`Delete rule #${index + 1}`}
            title="Delete rule"
            className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {renderContent()}
    </div>
  );
};
