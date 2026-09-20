import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Home } from 'lucide-react';
import { Button } from '../components/common/Button';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 font-mono">
      <div className="p-3 bg-rose-950/30 border border-rose-900/50 rounded-full mb-4">
        <AlertCircle className="w-10 h-10 text-rose-500" />
      </div>
      <h1 className="text-2xl font-bold text-slate-100 mb-2">404 — Route Not Found</h1>
      <p className="text-xs text-slate-400 max-w-sm mb-6">
        The requested path does not exist on this console or has been removed.
      </p>
      <Button variant="secondary" onClick={() => navigate('/dashboard')} className="gap-2">
        <Home className="w-4 h-4" />
        Return to Dashboard
      </Button>
    </div>
  );
};
