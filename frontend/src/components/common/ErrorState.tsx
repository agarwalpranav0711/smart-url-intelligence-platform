import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { ApiError } from '../../api/client';

export interface ErrorStateProps {
  error: ApiError | Error | null;
  onRetry?: () => void;
  title?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  error,
  onRetry,
  title = 'API Request Failed',
}) => {
  const isApiError = error && 'status' in error;
  const status = isApiError ? (error as ApiError).status : undefined;
  const message = error?.message || 'An unexpected error occurred while communicating with the server.';
  const code = isApiError ? (error as ApiError).code : undefined;
  const requestId = isApiError ? (error as ApiError).requestId : undefined;

  return (
    <div className="flex flex-col items-center justify-center p-6 border border-rose-900/50 bg-rose-950/10 rounded-md my-4">
      <AlertTriangle className="w-8 h-8 text-rose-500 mb-2" />
      <h3 className="text-sm font-semibold text-rose-300 mb-1">{title}</h3>
      <p className="text-xs text-rose-400 font-mono text-center max-w-md mb-3">{message}</p>

      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 mb-4 bg-slate-900/80 px-3 py-1.5 rounded border border-slate-800">
        {status && <span>HTTP {status}</span>}
        {code && <span>• Code: {code}</span>}
        {requestId && <span className="text-slate-500">• ReqID: {requestId}</span>}
      </div>

      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Retry Request
        </Button>
      )}
    </div>
  );
};
