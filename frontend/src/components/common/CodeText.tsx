import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { clsx } from 'clsx';

export interface CodeTextProps {
  children: string;
  copyable?: boolean;
  className?: string;
  block?: boolean;
}

export const CodeText: React.FC<CodeTextProps> = ({ children, copyable = false, className, block = false }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  if (block) {
    return (
      <div className="relative group bg-slate-950 border border-brand-border rounded p-3 font-mono text-xs text-sky-400 overflow-x-auto">
        <pre className="whitespace-pre-wrap break-all">{children}</pre>
        {copyable && (
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 p-1 rounded bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
            aria-label="Copy snippet"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    );
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 font-mono text-xs px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-sky-400',
        className
      )}
    >
      <span className="truncate max-w-xs">{children}</span>
      {copyable && (
        <button
          onClick={handleCopy}
          className="text-slate-500 hover:text-slate-200 transition-colors focus:outline-none"
          aria-label="Copy value"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
        </button>
      )}
    </span>
  );
};
