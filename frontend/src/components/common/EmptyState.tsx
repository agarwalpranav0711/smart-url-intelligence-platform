import React, { ReactNode } from 'react';
import { Database } from 'lucide-react';

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  action,
  icon = <Database className="w-8 h-8 text-slate-600" />,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 my-4 text-center border border-dashed border-brand-border rounded-md bg-slate-900/30">
      <div className="mb-3 p-3 rounded-full bg-slate-900 border border-slate-800">{icon}</div>
      <h3 className="text-sm font-semibold text-brand-text mb-1">{title}</h3>
      <p className="text-xs text-brand-textMuted max-w-sm mb-4">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
};
