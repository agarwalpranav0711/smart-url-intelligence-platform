import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, Key, Activity, ShieldAlert } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { useAuth } from '../context/AuthContext';

export const DashboardPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Infrastructure Overview"
        description="Smart URL Intelligence Platform console and operational state."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate('/links')} className="gap-1.5 font-mono">
              <Link2 className="w-3.5 h-3.5" />
              Manage Links
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/keys')} className="gap-1.5 font-mono">
              <Key className="w-3.5 h-3.5" />
              API Keys
            </Button>
          </div>
        }
      />

      {!isAuthenticated && (
        <div className="p-4 bg-amber-950/20 border border-amber-800/40 rounded-md flex items-start gap-3 text-amber-300 font-mono text-xs">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">No API Key in Memory:</span> Provide an API key via{' '}
            <button onClick={() => navigate('/register')} className="underline hover:text-amber-200">
              Developer Registration
            </button>{' '}
            or the header to interact with protected backend endpoints.
          </div>
        </div>
      )}

      {/* Structural Layout Placeholders (No Fake Data) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-brand-surface border border-brand-border rounded-md">
          <div className="text-xs font-mono text-brand-textMuted uppercase">Engine Health</div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-mono font-semibold text-emerald-400 flex items-center gap-1.5">
              <Activity className="w-4 h-4" /> Operational
            </span>
            <button onClick={() => navigate('/status')} className="text-xs text-sky-400 hover:underline font-mono">
              View Health
            </button>
          </div>
        </div>

        <div className="p-4 bg-brand-surface border border-brand-border rounded-md">
          <div className="text-xs font-mono text-brand-textMuted uppercase">Routing Engine</div>
          <div className="mt-2 text-sm font-mono text-brand-text font-semibold">
            LRU Cache + Deterministic Rules
          </div>
        </div>

        <div className="p-4 bg-brand-surface border border-brand-border rounded-md">
          <div className="text-xs font-mono text-brand-textMuted uppercase">Analytics Pipeline</div>
          <div className="mt-2 text-sm font-mono text-brand-text font-semibold">
            Process-Local Buffering
          </div>
        </div>
      </div>

      <div className="border border-brand-border bg-brand-surface rounded-md p-6">
        <h2 className="text-sm font-semibold font-mono text-brand-text mb-2">Shortcode Registry</h2>
        <EmptyState
          title="No Active Data Fetched"
          description="Authenticate with a valid API key to query links, analytics, and active routing rules from the backend API."
          action={
            <Button variant="secondary" size="sm" onClick={() => navigate('/links')}>
              Open Links Directory
            </Button>
          }
        />
      </div>
    </div>
  );
};
