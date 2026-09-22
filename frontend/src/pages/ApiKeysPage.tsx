import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Key, Plus, RefreshCw, Trash2, ShieldAlert, Search, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { Skeleton } from '../components/common/Skeleton';
import { Modal } from '../components/common/Modal';
import { CodeText } from '../components/common/CodeText';
import { Badge } from '../components/common/Badge';
import { RevokeKeyModal } from '../components/common/RevokeKeyModal';
import { CodeGenerator } from '../components/common/CodeGenerator';
import { apiKeysApi } from '../api/endpoints/apiKeys';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/formatters';

type StatusFilter = 'all' | 'active' | 'revoked';

export const ApiKeysPage: React.FC = () => {
  const { isAuthenticated, setApiKey } = useAuth();
  const queryClient = useQueryClient();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);

  // Fetch API keys metadata
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiKeysApi.list(),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  // Create key mutation
  const createMutation = useMutation({
    mutationFn: (keyName: string) => apiKeysApi.create({ name: keyName }),
    onSuccess: (res) => {
      setCreatedKey(res.api_key || null);
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  // Revoke key mutation
  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => apiKeysApi.revoke(keyId),
    onSuccess: () => {
      setRevokeTarget(null);
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(name.trim() || 'Secondary Key');
  };

  const handleCloseCreateModal = () => {
    setCreateModalOpen(false);
    setName('');
    setCreatedKey(null);
    createMutation.reset();
  };

  const handleSetAsActiveKey = () => {
    if (createdKey) {
      setApiKey(createdKey);
    }
  };

  const keys = data?.api_keys || [];

  const activeCount = useMemo(() => keys.filter((k) => !k.revoked_at).length, [keys]);
  const revokedCount = useMemo(() => keys.filter((k) => Boolean(k.revoked_at)).length, [keys]);

  // Client-side filtering by tab status & search query
  const filteredKeys = useMemo(() => {
    let result = keys;

    if (statusFilter === 'active') {
      result = result.filter((k) => !k.revoked_at);
    } else if (statusFilter === 'revoked') {
      result = result.filter((k) => Boolean(k.revoked_at));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (k) =>
          (k.name && k.name.toLowerCase().includes(q)) ||
          (k.key_id && k.key_id.toLowerCase().includes(q))
      );
    }

    return result;
  }, [keys, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Key Management"
        description="Provision secondary tokens for zero-downtime key rotation, view key metadata, and manage credential lifecycles."
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refetch()}
              disabled={!isAuthenticated}
              className="gap-1.5 font-mono"
            >
              <RefreshCw className="w-3.5 h-3.5" />
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
              Create Secondary Key
            </Button>
          </div>
        }
      />

      {!isAuthenticated ? (
        <div className="p-6 bg-slate-900 border border-brand-border rounded-md text-center font-mono">
          <ShieldAlert className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-brand-text mb-1">Authentication Required</h3>
          <p className="text-xs text-brand-textMuted max-w-md mx-auto mb-4">
            An active API key is required to query developer identity details and manage secondary credentials.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section 1: Developer Identity Card */}
          <div className="bg-brand-surface border border-brand-border rounded-md p-5 font-mono text-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-slate-200 font-semibold text-sm">
              <ShieldCheck className="w-4.5 h-4.5 text-sky-400" />
              <span>Developer Identity Context</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-3 bg-slate-900 border border-slate-800 rounded">
                <div className="text-[10px] text-slate-400 uppercase">Authentication State</div>
                <div className="text-sky-400 font-bold text-xs mt-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Active In Memory</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">Zero-persistence session</div>
              </div>

              <div className="p-3 bg-slate-900 border border-slate-800 rounded">
                <div className="text-[10px] text-slate-400 uppercase">Active API Keys</div>
                <div className="text-xl font-bold text-emerald-400 mt-1">{activeCount}</div>
                <div className="text-[10px] text-slate-500 mt-1">Valid authentication credentials</div>
              </div>

              <div className="p-3 bg-slate-900 border border-slate-800 rounded">
                <div className="text-[10px] text-slate-400 uppercase">Total Keys</div>
                <div className="text-xl font-bold text-slate-300 mt-1">{keys.length}</div>
                <div className="text-[10px] text-slate-500 mt-1">
                  {revokedCount} Revoked key {revokedCount === 1 ? 'record' : 'records'}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Controls & Status Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-mono text-xs">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 bg-brand-surface border border-brand-border p-1 rounded-md">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-slate-800 text-sky-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Keys ({keys.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('active')}
                className={`px-3 py-1 rounded transition-colors ${
                  statusFilter === 'active'
                    ? 'bg-slate-800 text-emerald-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Active ({activeCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('revoked')}
                className={`px-3 py-1 rounded transition-colors ${
                  statusFilter === 'revoked'
                    ? 'bg-slate-800 text-rose-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Revoked ({revokedCount})
              </button>
            </div>

            {/* Client-side Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Filter by label or key ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-brand-surface border border-brand-border rounded pl-8 pr-3 py-1.5 text-xs text-brand-text font-mono focus:outline-none focus:border-brand-focus"
              />
            </div>
          </div>

          {/* Section 3: API Keys Data Table */}
          {isError ? (
            <ErrorState error={error as any} onRetry={() => refetch()} />
          ) : isLoading ? (
            <div className="p-4 bg-brand-surface border border-brand-border rounded-md space-y-3">
              <Skeleton count={4} className="h-8" />
            </div>
          ) : filteredKeys.length === 0 ? (
            <EmptyState
              title={
                keys.length === 0
                  ? 'No API Keys Provisioned'
                  : `No ${statusFilter} keys match filter`
              }
              description={
                keys.length === 0
                  ? 'There are no secondary API credentials registered for this developer identity.'
                  : 'Try selecting a different filter tab or clearing your search input.'
              }
              icon={<Key className="w-8 h-8 text-slate-600" />}
              action={
                keys.length === 0 ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setCreateModalOpen(true)}
                    className="gap-1.5 font-mono"
                  >
                    <Plus className="w-3.5 h-3.5" /> Create Secondary Key
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="border border-brand-border bg-brand-surface rounded-md overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-slate-900/80 border-b border-brand-border text-brand-textMuted">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium uppercase">
                      Key Name / Label
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium uppercase">
                      Key Identifier
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium uppercase">
                      Creation Date
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium uppercase">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium uppercase text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredKeys.map((k) => {
                    const isRevoked = Boolean(k.revoked_at);

                    return (
                      <tr key={k.key_id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="px-4 py-3 text-slate-200 font-semibold">
                          {k.name || 'API Key'}
                        </td>
                        <td className="px-4 py-3">
                          <CodeText copyable>{k.key_id}</CodeText>
                        </td>
                        <td className="px-4 py-3 text-slate-400">{formatDate(k.created_at)}</td>
                        <td className="px-4 py-3">
                          {isRevoked ? (
                            <Badge variant="error">Revoked ({formatDate(k.revoked_at)})</Badge>
                          ) : (
                            <Badge variant="success">Active</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!isRevoked ? (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setRevokeTarget({ id: k.key_id, name: k.name })}
                              className="h-6 text-[11px] px-2 gap-1 font-mono"
                            >
                              <Trash2 className="w-3 h-3" /> Revoke
                            </Button>
                          ) : (
                            <span className="text-slate-600 text-[11px] font-mono">
                              Permanent
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Developer Integration Section: Using your API key */}
      <div className="space-y-3 pt-4 border-t border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Using your API key</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Programmatic HTTP clients use Bearer API keys passed in the <code className="text-sky-400">Authorization</code> header.
              Replace <code className="text-amber-400">YOUR_API_KEY</code> with your raw key token in your application environment.
            </p>
          </div>
          <a
            href="http://localhost:3000/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-sky-400 hover:text-sky-300 underline font-mono flex items-center gap-1 shrink-0"
          >
            Full API Docs →
          </a>
        </div>

        <CodeGenerator initialOperation="create_link" />
      </div>

      {/* Modal 1: Create Secondary API Key */}
      <Modal isOpen={createModalOpen} onClose={handleCloseCreateModal} title="Provision Secondary API Key">
        {createdKey ? (
          <div className="space-y-4 font-mono text-xs">
            <div className="p-3 bg-emerald-950/40 border border-emerald-800/80 rounded space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>API Key Provisioned Successfully</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Copy your key now. Raw key tokens are returned <strong className="text-emerald-300">EXACTLY ONCE</strong> upon creation and are never stored in plain text or displayed again.
              </p>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Raw Secret Key Token</div>
              <CodeText block copyable>
                {createdKey}
              </CodeText>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleSetAsActiveKey}
                className="gap-1 text-[11px]"
                title="Set this newly created key as the active in-memory session token"
              >
                Use as Active Memory Key
              </Button>

              <Button type="button" variant="primary" size="sm" onClick={handleCloseCreateModal}>
                I Have Saved My Key
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateSubmit} className="space-y-4 font-mono text-xs">
            {createMutation.isError && <ErrorState error={createMutation.error as any} />}
            <Input
              label="Key Identifier / Label"
              placeholder="e.g. Secondary Automation Key"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              hint="Maximum 100 characters. Used for friendly identification in developer logs."
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button type="button" variant="ghost" onClick={handleCloseCreateModal}>
                Cancel
              </Button>
              <Button type="submit" isLoading={createMutation.isPending} className="gap-1.5">
                <Key className="w-3.5 h-3.5" />
                Generate Key
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal 2: Revoke API Key Confirmation */}
      <RevokeKeyModal
        isOpen={Boolean(revokeTarget)}
        keyId={revokeTarget?.id || null}
        keyName={revokeTarget?.name || null}
        onClose={() => setRevokeTarget(null)}
        onConfirm={(id) => revokeMutation.mutate(id)}
        isLoading={revokeMutation.isPending}
        error={revokeMutation.isError ? revokeMutation.error : null}
      />
    </div>
  );
};
