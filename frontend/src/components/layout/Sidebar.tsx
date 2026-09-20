import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Link2, BarChart2, Key, Activity, ExternalLink, ShieldCheck, X } from 'lucide-react';
import { clsx } from 'clsx';

export interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  external?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: 'Links', path: '/links', icon: <Link2 className="w-4 h-4" /> },
  { label: 'Analytics', path: '/analytics', icon: <BarChart2 className="w-4 h-4" /> },
  { label: 'API Keys', path: '/keys', icon: <Key className="w-4 h-4" /> },
  { label: 'System Status', path: '/status', icon: <Activity className="w-4 h-4" /> },
  { label: 'API Reference', path: '/docs', icon: <ExternalLink className="w-4 h-4" />, external: true },
];

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen = false, onMobileClose }) => {
  const content = (
    <div className="flex flex-col h-full bg-slate-950 border-r border-brand-border w-64 text-brand-text select-none">
      {/* Brand Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-brand-border">
        <div className="flex items-center gap-2 font-mono font-semibold text-sm tracking-tight text-slate-100">
          <ShieldCheck className="w-5 h-5 text-brand-primary" />
          <span>Smart URL Console</span>
        </div>
        {onMobileClose && (
          <button
            onClick={onMobileClose}
            className="md:hidden p-1 text-slate-400 hover:text-slate-200"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation list */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="px-2 py-1.5 text-[10px] font-mono font-semibold text-brand-textMuted uppercase tracking-wider">
          Platform Console
        </div>
        {NAV_ITEMS.map((item) => {
          if (item.external) {
            return (
              <a
                key={item.path}
                href={item.path}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded text-xs font-mono font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors"
              >
                {item.icon}
                <span>{item.label}</span>
              </a>
            );
          }

          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onMobileClose}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 px-2.5 py-1.5 rounded text-xs font-mono font-medium transition-colors',
                  isActive
                    ? 'bg-slate-900 text-brand-primary border-l-2 border-brand-primary'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                )
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer / System Meta */}
      <div className="p-3 border-t border-brand-border bg-slate-950/80 font-mono text-[11px] text-slate-500 flex flex-col gap-1">
        <div className="flex justify-between items-center">
          <span>Environment</span>
          <span className="text-slate-400 font-semibold">Development</span>
        </div>
        <div className="flex justify-between items-center">
          <span>Engine Status</span>
          <span className="text-emerald-400 font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Active
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:block shrink-0 h-screen sticky top-0">{content}</aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs" onClick={onMobileClose} />
          <div className="relative z-10">{content}</div>
        </div>
      )}
    </>
  );
};
