import React, { ReactNode } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface BadgeProps {
  variant?: 'neutral' | 'success' | 'warning' | 'error' | 'routing' | 'primary';
  children: ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ variant = 'neutral', children, className }) => {
  const baseStyles = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium tracking-tight';

  const variants = {
    neutral: 'bg-slate-800 text-slate-300 border border-slate-700',
    success: 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60',
    warning: 'bg-amber-950/80 text-amber-400 border border-amber-800/60',
    error: 'bg-rose-950/80 text-rose-400 border border-rose-800/60',
    routing: 'bg-indigo-950/80 text-indigo-400 border border-indigo-800/60',
    primary: 'bg-sky-950/80 text-sky-400 border border-sky-800/60',
  };

  return <span className={twMerge(clsx(baseStyles, variants[variant], className))}>{children}</span>;
};
