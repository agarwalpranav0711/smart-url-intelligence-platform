import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { ErrorState } from './ErrorState';
import { linksApi } from '../../api/endpoints/links';

export interface DeactivateLinkModalProps {
  isOpen: boolean;
  code: string | null;
  onClose: () => void;
  onSuccess: (code: string) => void;
}

export const DeactivateLinkModal: React.FC<DeactivateLinkModalProps> = ({
  isOpen,
  code,
  onClose,
  onSuccess,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<any>(null);

  if (!isOpen || !code) return null;

  const handleDeactivate = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await linksApi.delete(code);
      onSuccess(code);
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Deactivate Short Link">
      <div className="space-y-4 font-mono text-xs">
        {error && <ErrorState error={error} />}

        <div className="p-3 bg-rose-950/30 border border-rose-900/50 rounded flex items-start gap-2.5 text-rose-300">
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold block text-sm">Deactivate Shortcode "{code}"?</span>
            <p className="text-[11px] text-rose-400 font-sans leading-relaxed">
              Deactivating will soft-disable the link. Subsequent HTTP GET requests to{' '}
              <span className="font-mono text-rose-300">/s/{code}</span> will receive HTTP 410 Gone responses. The historical click logs remain preserved.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDeactivate}
            isLoading={isSubmitting}
            className="gap-1.5"
          >
            Deactivate Link
          </Button>
        </div>
      </div>
    </Modal>
  );
};
