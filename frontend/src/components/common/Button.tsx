import { ButtonHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading = false, disabled, children, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-brand-focus focus:ring-offset-1 focus:ring-offset-brand-bg disabled:opacity-50 disabled:cursor-not-allowed select-none';

    const variants = {
      primary: 'bg-brand-primary text-slate-950 hover:bg-sky-400 active:bg-sky-600',
      secondary: 'bg-brand-surfaceHighlight text-brand-text hover:bg-slate-700 hover:text-white active:bg-slate-800 border border-brand-border',
      danger: 'bg-status-error text-white hover:bg-rose-600 active:bg-rose-700',
      ghost: 'bg-transparent text-brand-textMuted hover:text-brand-text hover:bg-brand-surfaceHighlight',
      outline: 'bg-transparent text-brand-text border border-brand-border hover:bg-brand-surfaceHighlight hover:border-slate-600',
    };

    const sizes = {
      sm: 'px-2.5 py-1 text-xs gap-1.5 h-7',
      md: 'px-3.5 py-1.5 text-sm gap-2 h-9',
      lg: 'px-4 py-2 text-base gap-2.5 h-11',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={twMerge(clsx(baseStyles, variants[variant], sizes[size], className))}
        {...props}
      >
        {isLoading && (
          <svg className="animate-spin h-3.5 w-3.5 currentcolor shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
