import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Link2, ShieldAlert, Search, ExternalLink, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { Skeleton } from '../components/common/Skeleton';
import { CodeText } from '../components/common/CodeText';
import { Badge } from '../components/common/Badge';
import { CreateLinkModal } from '../components/common/CreateLinkModal';
import { DeactivateLinkModal } from '../components/common/DeactivateLinkModal';
import { linksApi } from '../api/endpoints/links';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/formatters';
import { LinkRecord } from '../api/types';

const PAGE_SIZE = 20;

export const LinksPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [offset, setOffset] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deactivateCode, setDeactivateCode] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['links', offset],
    queryFn: () => linksApi.list({ limit: PAGE_SIZE, offset }),
    enabled: isAuthenticated,
  });

  const links = data?.links || [];

  // Filter links locally by search query
  const filteredLinks = useMemo(() => {
    if (!searchQuery.trim()) return links;
    const q = searchQuery.toLowerCase().trim();
    return links.filter(
      (l) => l.short_code.toLowerCase().includes(q) || l.target_url.toLowerCase().includes(q)
    );
  }, [links, searchQuery]);

  const handleLinkCreated = () => {
    queryClient.invalidateQueries({ queryKey: ['links'] });
  };

  const handleLinkDeactivated = () => {
    queryClient.invalidateQueries({ queryKey: ['links'] });
  };

  const isExpired = (expiresAt?: string | null): boolean => {
    if (!expiresAt) return false;
    return new Date(expiresAt) <= new Date();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Link Registry"
        description="Managed shortcodes, target URL mappings, expiration rules, and operational status."
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refetch()}
              disabled={!isAuthenticated || isFetching}
              className="gap-1.5 font-mono"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCreateModalOpen(true)}
              disabled={!isAuthenticated}
              className="gap-1.5 font-mono"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Link
            </Button>
          </div>
        }
      />

      {!isAuthenticated ? (
        <div className="p-6 bg-slate-900 border border-brand-border rounded-md text-center">
          <ShieldAlert className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-brand-text font-mono mb-1">Authentication Required</h3>
          <p className="text-xs text-brand-textMuted max-w-md mx-auto mb-4">
            An API key is required to list and manage shortcodes from the system database.
          </p>
          <Button variant="secondary" size="sm" onClick={() => navigate('/register')}>
            Register Account / Set Key
          </Button>
        </div>
      ) : isError ? (
        <ErrorState error={error as any} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="p-4 bg-brand-surface border border-brand-border rounded-md space-y-3">
          <Skeleton count={5} className="h-8" />
        </div>
      ) : links.length === 0 && !searchQuery ? (
        <EmptyState
          title="No Links Provisioned"
          description="There are no shortcodes registered for this developer account in the system database."
          icon={<Link2 className="w-8 h-8 text-slate-600" />}
          action={
            <Button variant="primary" size="sm" onClick={() => setCreateModalOpen(true)} className="gap-1.5 font-mono">
              <Plus className="w-3.5 h-3.5" />
              Create First Link
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Controls Bar: Search & Filter */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Filter shortcode or URL..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-brand-surface border border-brand-border rounded pl-9 pr-3 py-1.5 text-xs text-brand-text font-mono focus:outline-none focus:border-brand-focus"
              />
            </div>

            <div className="text-xs font-mono text-slate-400 self-end sm:self-auto">
              Showing {filteredLinks.length} of {links.length} items (Offset {offset})
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block border border-brand-border bg-brand-surface rounded-md overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-slate-900/80 border-b border-brand-border text-brand-textMuted">
                <tr>
                  <th className="px-4 py-2.5 font-medium uppercase">Short Code</th>
                  <th className="px-4 py-2.5 font-medium uppercase">Target URL</th>
                  <th className="px-4 py-2.5 font-medium uppercase">Routing</th>
                  <th className="px-4 py-2.5 font-medium uppercase">Created</th>
                  <th className="px-4 py-2.5 font-medium uppercase">Status</th>
                  <th className="px-4 py-2.5 font-medium uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredLinks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      No matching shortcodes found for filter "{searchQuery}".
                    </td>
                  </tr>
                ) : (
                  filteredLinks.map((link: LinkRecord) => {
                    const expired = isExpired(link.expires_at);

                    return (
                      <tr key={link.short_code} className="hover:bg-slate-900/40 transition-colors">
                        <td className="px-4 py-3">
                          <CodeText copyable>{link.short_code}</CodeText>
                        </td>

                        <td className="px-4 py-3 max-w-xs truncate text-slate-300" title={link.target_url}>
                          {link.target_url}
                        </td>

                        <td className="px-4 py-3">
                          {link.routing_config ? (
                            <Badge variant="routing">Advanced</Badge>
                          ) : (
                            <Badge variant="neutral">Direct</Badge>
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-400">{formatDate(link.created_at)}</td>

                        <td className="px-4 py-3">
                          {expired ? (
                            <Badge variant="warning">EXPIRED</Badge>
                          ) : link.is_active ? (
                            <Badge variant="success">ACTIVE</Badge>
                          ) : (
                            <Badge variant="error">INACTIVE</Badge>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/links/${link.short_code}`)}
                              className="h-7 text-xs px-2 text-slate-300 hover:text-white"
                            >
                              <ExternalLink className="w-3.5 h-3.5 mr-1 text-sky-400" />
                              Details
                            </Button>

                            {link.is_active && !expired && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeactivateCode(link.short_code)}
                                className="h-7 text-xs px-2 text-slate-400 hover:text-rose-400"
                                title="Deactivate shortcode"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View (< 768px) */}
          <div className="md:hidden space-y-3 font-mono text-xs">
            {filteredLinks.length === 0 ? (
              <div className="p-4 bg-brand-surface border border-brand-border rounded text-center text-slate-500">
                No matching shortcodes found for filter "{searchQuery}".
              </div>
            ) : (
              filteredLinks.map((link: LinkRecord) => {
                const expired = isExpired(link.expires_at);

                return (
                  <div key={link.short_code} className="p-4 bg-brand-surface border border-brand-border rounded space-y-3">
                    <div className="flex items-center justify-between">
                      <CodeText copyable>{link.short_code}</CodeText>
                      {expired ? (
                        <Badge variant="warning">EXPIRED</Badge>
                      ) : link.is_active ? (
                        <Badge variant="success">ACTIVE</Badge>
                      ) : (
                        <Badge variant="error">INACTIVE</Badge>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="text-[10px] text-slate-400 uppercase">Target URL</div>
                      <div className="text-slate-200 truncate">{link.target_url}</div>
                    </div>

                    <div className="flex justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                      <span>Created: {formatDate(link.created_at)}</span>
                      {link.routing_config ? <Badge variant="routing">Advanced</Badge> : <Badge variant="neutral">Direct</Badge>}
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(`/links/${link.short_code}`)}
                        className="gap-1 text-xs"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                        Details
                      </Button>

                      {link.is_active && !expired && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setDeactivateCode(link.short_code)}
                          className="gap-1 text-xs"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Deactivate
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-brand-border font-mono text-xs text-slate-400">
            <div>
              Offset: <span className="text-slate-200">{offset}</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0}
                className="gap-1 text-xs"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={links.length < PAGE_SIZE}
                className="gap-1 text-xs"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Link Modal */}
      <CreateLinkModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={handleLinkCreated}
      />

      {/* Deactivate Link Modal */}
      <DeactivateLinkModal
        isOpen={Boolean(deactivateCode)}
        code={deactivateCode}
        onClose={() => setDeactivateCode(null)}
        onSuccess={handleLinkDeactivated}
      />
    </div>
  );
};
