import React from 'react';
import { Menu, Key, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';

export interface HeaderProps {
  onMenuToggle?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuToggle }) => {
  const { isAuthenticated, userId, logout } = useAuth();

  return (
    <header className="h-14 bg-slate-950 border-b border-brand-border px-4 flex items-center justify-between sticky top-0 z-30 shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="md:hidden p-1.5 text-slate-400 hover:text-slate-200 focus:outline-none"
          aria-label="Toggle Navigation Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-slate-400">
          <span className="text-slate-500">Node</span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-300">smart-url-api</span>
          <Badge variant="primary" className="text-[10px] py-0 px-1.5">
            v1.0.0
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Auth Status & Web Session Info */}
        <div className="flex items-center gap-2 font-mono text-xs">
          {isAuthenticated ? (
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded px-2.5 py-1">
              <Key className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-slate-400 hidden sm:inline">Session:</span>
              <span className="text-slate-200 font-semibold">{userId ? `${userId.substring(0, 8)}...` : 'Active'}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => logout()}
                className="h-5 px-1 text-slate-400 hover:text-rose-400"
                title="Terminate web session (Logout)"
              >
                <LogOut className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="warning" className="text-[11px]">
                Unauthenticated
              </Badge>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
