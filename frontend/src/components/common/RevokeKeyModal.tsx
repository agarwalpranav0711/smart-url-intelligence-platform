import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { CodeText } from './CodeText';
import { ErrorState } from './ErrorState';

export interface RevokeKeyModalProps {
  isOpen: boolean;
  keyId: string | null;
  keyName: string | null;
  onClose: () => void;
  onConfirm: (keyId: string) => void;
  isLoading?: boolean;
  error?: any;
}

export const RevokeKeyModal: React.FC<RevokeKeyModalProps> = ({
  isOpen,
  keyId,
  keyName,
  onClose,
  onConfirm,
  isLoading = false,
  error = null,
}) => {
  if (!keyId) return null;

  const handleConfirm = () => {
    onConfirm(keyId);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirm API Key Revocation">
      <div className="space-y-4 font-mono text-xs">
        {error && <ErrorState error={error} />}

        <div className="p-3 bg-rose-950/40 border border-rose-900/80 rounded flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-semibold text-rose-300 text-sm">Permanent Revocation Warning</h4>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Revoking this API key is <strong className="text-rose-400">permanent and immediate</strong>. Any system or application using this key will immediately receive HTTP 401 Unauthorized errors.
            </p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded p-3 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span>Key Label:</span>
            <span className="text-slate-200 font-semibold">{keyName || 'API Key'}</span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Key Identifier:</span>
            <CodeText copyable={false}>{keyId}</CodeText>
          </div>
        </div>

        <p className="text-slate-400 text-[11px]">
          Revoked keys cannot be re-activated under any circumstances. You must provision a new key if replacement access is required.
        </p>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleConfirm}
            isLoading={isLoading}
            className="gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Confirm Revocation
          </Button>
        </div>
      </div>
    </Modal>
  );
};
