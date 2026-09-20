import { InputHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label htmlFor={inputId} className="text-xs font-medium text-brand-textMuted uppercase tracking-wider">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={twMerge(
            clsx(
              'w-full bg-brand-surface border border-brand-border rounded px-3 py-1.5 text-sm text-brand-text placeholder-slate-500 font-mono focus:outline-none focus:border-brand-focus focus:ring-1 focus:ring-brand-focus transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
              error && 'border-status-error focus:border-status-error focus:ring-status-error',
              className
            )
          )}
          {...props}
        />
        {error ? (
          <span className="text-xs text-status-error font-medium">{error}</span>
        ) : hint ? (
          <span className="text-xs text-brand-textMuted">{hint}</span>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
