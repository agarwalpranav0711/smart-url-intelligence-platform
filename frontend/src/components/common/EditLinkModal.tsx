import React, { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { Modal } from './Modal';
import { Input } from './Input';
import { Button } from './Button';
import { ErrorState } from './ErrorState';
import { linksApi } from '../../api/endpoints/links';
import { LinkRecord, UpdateLinkRequest } from '../../api/types';
import { validateUrl } from '../../utils/validators';

export interface EditLinkModalProps {
  isOpen: boolean;
  link: LinkRecord | null;
  onClose: () => void;
  onSuccess: (updatedLink: LinkRecord) => void;
}

export const EditLinkModal: React.FC<EditLinkModalProps> = ({ isOpen, link, onClose, onSuccess }) => {
  const [targetUrl, setTargetUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [clearExpiration, setClearExpiration] = useState(false);

  const [urlError, setUrlError] = useState<string | undefined>();
  const [expiresError, setExpiresError] = useState<string | undefined>();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<any>(null);

  useEffect(() => {
    if (link) {
      setTargetUrl(link.target_url || '');
      if (link.expires_at) {
        // Format ISO string to local datetime-local format YYYY-MM-DDTHH:mm
        const d = new Date(link.expires_at);
        if (!isNaN(d.getTime())) {
          const tzOffset = d.getTimezoneOffset() * 60000;
          const localIso = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
          setExpiresAt(localIso);
        } else {
          setExpiresAt('');
        }
      } else {
        setExpiresAt('');
      }
      setClearExpiration(false);
      setUrlError(undefined);
      setExpiresError(undefined);
      setApiError(null);
    }
  }, [link, isOpen]);

  if (!isOpen || !link) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError(undefined);
    setExpiresError(undefined);
    setApiError(null);

    // 1. Validate Target URL
    const urlValidation = validateUrl(targetUrl);
    if (!urlValidation.valid) {
      setUrlError(urlValidation.error);
      return;
    }

    // 2. Validate Expiration if set
    let isoExpiresAt: string | null | undefined = undefined;
    if (clearExpiration) {
      isoExpiresAt = null;
    } else if (expiresAt) {
      const parsedExp = new Date(expiresAt);
      if (isNaN(parsedExp.getTime())) {
        setExpiresError('Invalid expiration date format');
        return;
      }
      if (parsedExp <= new Date()) {
        setExpiresError('Expiration timestamp must be in the future');
        return;
      }
      isoExpiresAt = parsedExp.toISOString();
    }

    setIsSubmitting(true);
    try {
      const payload: UpdateLinkRequest = {
        target_url: targetUrl.trim(),
        expires_at: isoExpiresAt,
      };

      const result = await linksApi.update(link.short_code, payload);
      onSuccess(result);
      onClose();
    } catch (err: any) {
      setApiError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit Link Properties (${link.short_code})`}>
      <form onSubmit={handleSubmit} className="space-y-4 font-sans text-sm">
        {apiError && <ErrorState error={apiError} />}

        <Input
          label="Target Destination URL"
          type="url"
          placeholder="https://example.com/target"
          value={targetUrl}
          onChange={(e) => {
            setTargetUrl(e.target.value);
            if (urlError) setUrlError(undefined);
          }}
          error={urlError}
          hint="Must use http:// or https:// scheme (max 2048 characters)."
          required
        />

        <div className="space-y-2">
          <Input
            label="Expiration Date & Time"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => {
              setExpiresAt(e.target.value);
              setClearExpiration(false);
              if (expiresError) setExpiresError(undefined);
            }}
            disabled={clearExpiration}
            error={expiresError}
            hint="Set a future UTC timestamp for shortcode deactivation."
          />

          {link.expires_at && (
            <label className="flex items-center gap-2 font-mono text-xs text-slate-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={clearExpiration}
                onChange={(e) => {
                  setClearExpiration(e.target.checked);
                  if (e.target.checked) {
                    setExpiresAt('');
                    setExpiresError(undefined);
                  }
                }}
                className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500"
              />
              <span>Remove existing expiration (Make permanent)</span>
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting} className="gap-1.5 font-mono">
            <Save className="w-3.5 h-3.5" />
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
};
