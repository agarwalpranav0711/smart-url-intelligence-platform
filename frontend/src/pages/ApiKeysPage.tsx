import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Key, Plus, RefreshCw, Trash2, ShieldAlert } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { Skeleton } from '../components/common/Skeleton';
import { Modal } from '../components/common/Modal';
import { CodeText } from '../components/common/CodeText';
import { Badge } from '../components/common/Badge';
import { apiKeysApi } from '../api/endpoints/apiKeys';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/formatters';

export const ApiKeysPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiKeysApi.list(),
    enabled: isAuthenticated,
  });

  const createMutation = useMutation({
    mutationFn: (keyName: string) => apiKeysApi.create({ name: keyName }),
    onSuccess: (res) => {
      setCreatedKey(res.api_key || null);
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => apiKeysApi.revoke(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate(name.trim());
  };

  const handleCloseModal = () => {
    setCreateModalOpen(false);
    setName('');
    setCreatedKey(null);
    createMutation.reset();
  };

  const keys = data?.api_keys || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Key Management"
        description="Provision secondary keys, view key IDs, and soft-revoke tokens (GET/POST/DELETE /api/v1/api-keys)."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={!isAuthenticated} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCreateModalOpen(true)}
              disabled={!isAuthenticated}
              className="gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Secondary Key
            </Button>
          </div>
        }
      />

      {!isAuthenticated ? (
        <div className="p-6 bg-slate-900 border border-brand-border rounded-md text-center">
          <ShieldAlert className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-brand-text font-mono mb-1">Authentication Required</h3>
          <p className="text-xs text-brand-textMuted max-w-md mx-auto mb-4">
            An API key is required to list and manage developer API tokens.
          </p>
        </div>
      ) : isError ? (
        <ErrorState error={error as any} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="p-4 bg-brand-surface border border-brand-border rounded-md">
          <Skeleton count={4} className="h-6" />
        </div>
      ) : keys.length === 0 ? (
        <EmptyState
          title="No API Keys Registered"
          description="There are no active API keys provisioned for this developer account."
          icon={<Key className="w-8 h-8 text-slate-600" />}
          action={
            <Button variant="primary" size="sm" onClick={() => setCreateModalOpen(true)}>
              Create First Key
            </Button>
          }
        />
      ) : (
        <div className="border border-brand-border bg-brand-surface rounded-md overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-slate-900/80 border-b border-brand-border text-brand-textMuted">
              <tr>
                <th className="px-4 py-2.5 font-medium uppercase">Key Name</th>
                <th className="px-4 py-2.5 font-medium uppercase">Key ID</th>
                <th className="px-4 py-2.5 font-medium uppercase">Created</th>
                <th className="px-4 py-2.5 font-medium uppercase">Status</th>
                <th className="px-4 py-2.5 font-medium uppercase text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {keys.map((k) => (
                <tr key={k.key_id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="px-4 py-3 text-slate-200 font-semibold">{k.name || 'Key'}</td>
                  <td className="px-4 py-3">
                    <CodeText copyable>{k.key_id}</CodeText>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{formatDate(k.created_at)}</td>
                  <td className="px-4 py-3">
                    {k.revoked_at ? (
                      <Badge variant="error">Revoked ({formatDate(k.revoked_at)})</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!k.revoked_at && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => revokeMutation.mutate(k.key_id)}
                        isLoading={revokeMutation.isPending}
                        className="h-6 text-[11px] px-2"
                      >
                        <Trash2 className="w-3 h-3 mr-1" /> Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal for Creating API Key */}
      <Modal isOpen={createModalOpen} onClose={handleCloseModal} title="Provision Secondary Key">
        {createdKey ? (
          <div className="space-y-4">
            <div className="p-3 bg-emerald-950/40 border border-emerald-800 rounded text-emerald-300 font-mono text-xs">
              Key created successfully. Copy it now. Raw keys are never stored or displayed again.
            </div>
            <CodeText block copyable>
              {createdKey}
            </CodeText>
            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={handleCloseModal}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            {createMutation.isError && <ErrorState error={createMutation.error as any} />}
            <Input
              label="Key Identifier / Name"
              placeholder="e.g. Secondary Automation Key"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={handleCloseModal}>
                Cancel
              </Button>
              <Button type="submit" isLoading={createMutation.isPending}>
                Create Key
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
