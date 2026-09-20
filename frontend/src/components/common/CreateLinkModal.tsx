import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, ArrowRight, Check, Copy, Sparkles } from 'lucide-react';
import { Modal } from './Modal';
import { Input } from './Input';
import { Button } from './Button';
import { ErrorState } from './ErrorState';
import { CodeText } from './CodeText';
import { linksApi } from '../../api/endpoints/links';
import { LinkRecord } from '../../api/types';
import { validateUrl, validateCustomAlias } from '../../utils/validators';

export interface CreateLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (createdLink: LinkRecord) => void;
}

export const CreateLinkModal: React.FC<CreateLinkModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const navigate = useNavigate();
  const [targetUrl, setTargetUrl] = useState('');
  const [alias, setAlias] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const [urlError, setUrlError] = useState<string | undefined>();
  const [aliasError, setAliasError] = useState<string | undefined>();
  const [expiresError, setExpiresError] = useState<string | undefined>();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<any>(null);
  const [createdLink, setCreatedLink] = useState<LinkRecord | null>(null);
  const [copied, setCopied] = useState(false);

  const rawBaseUrl =
    (import.meta.env.VITE_PUBLIC_BASE_URL as string) || (typeof window !== 'undefined' ? window.location.origin : '');
  const publicBaseUrl = rawBaseUrl.replace(/\/+$/, '');

  const resetForm = () => {
    setTargetUrl('');
    setAlias('');
    setExpiresAt('');
    setUrlError(undefined);
    setAliasError(undefined);
    setExpiresError(undefined);
    setApiError(null);
    setCreatedLink(null);
    setCopied(false);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError(undefined);
    setAliasError(undefined);
    setExpiresError(undefined);
    setApiError(null);

    // 1. Validate Target URL
    const urlValidation = validateUrl(targetUrl);
    if (!urlValidation.valid) {
      setUrlError(urlValidation.error);
      return;
    }

    // 2. Validate Alias if provided
    if (alias.trim()) {
      const aliasValidation = validateCustomAlias(alias.trim());
      if (!aliasValidation.valid) {
        setAliasError(aliasValidation.error);
        return;
      }
    }

    // 3. Validate Expiration if provided
    let isoExpiresAt: string | null = null;
    if (expiresAt) {
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
      const payload = {
        target_url: targetUrl.trim(),
        alias: alias.trim() || undefined,
        expires_at: isoExpiresAt,
      };

      const result = await linksApi.create(payload);
      setCreatedLink(result);
      onSuccess(result);
    } catch (err: any) {
      if (err?.code === 'ALIAS_ALREADY_EXISTS' || err?.status === 409) {
        setAliasError('This custom alias is already taken. Please choose another.');
      } else {
        setApiError(err);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const fullShortUrl = createdLink ? `${publicBaseUrl}/s/${createdLink.short_code}` : '';

  const handleCopy = async () => {
    if (!fullShortUrl) return;
    try {
      await navigator.clipboard.writeText(fullShortUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={createdLink ? 'Short Link Created' : 'Create Short Link'}>
      {createdLink ? (
        <div className="space-y-4 font-mono text-xs">
          <div className="p-3 bg-emerald-950/40 border border-emerald-800 rounded text-emerald-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Link provisioned successfully!</span>
          </div>

          <div className="space-y-3 bg-slate-950 border border-slate-800 rounded p-4">
            <div>
              <div className="text-[10px] uppercase text-slate-400 mb-1">Public Short URL</div>
              <div className="flex items-center gap-2">
                <span className="text-sky-400 font-semibold text-sm truncate flex-1">{fullShortUrl}</span>
                <Button variant="secondary" size="sm" onClick={handleCopy} className="gap-1 text-xs shrink-0">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase text-slate-400 mb-1">Short Code</div>
              <CodeText copyable>{createdLink.short_code}</CodeText>
            </div>

            <div>
              <div className="text-[10px] uppercase text-slate-400 mb-1">Target URL</div>
              <div className="text-slate-300 truncate">{createdLink.target_url}</div>
            </div>

            {createdLink.expires_at && (
              <div>
                <div className="text-[10px] uppercase text-slate-400 mb-1">Expires At</div>
                <div className="text-slate-400">{new Date(createdLink.expires_at).toLocaleString()}</div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <Button variant="ghost" onClick={resetForm}>
              Create Another
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                handleClose();
                navigate(`/links/${createdLink.short_code}`);
              }}
              className="gap-1.5"
            >
              View Details <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 font-sans text-sm">
          {apiError && <ErrorState error={apiError} />}

          <Input
            label="Target Destination URL"
            type="url"
            placeholder="https://example.com/documentation/guide"
            value={targetUrl}
            onChange={(e) => {
              setTargetUrl(e.target.value);
              if (urlError) setUrlError(undefined);
            }}
            error={urlError}
            hint="Must use http:// or https:// scheme (max 2048 characters)."
            required
            autoFocus
          />

          <Input
            label="Custom Alias (Optional)"
            placeholder="e.g. dev-guide"
            value={alias}
            onChange={(e) => {
              setAlias(e.target.value);
              if (aliasError) setAliasError(undefined);
            }}
            error={aliasError}
            hint="Leave empty to auto-generate a 6-character Base62 code (3-32 chars)."
          />

          <Input
            label="Expiration Date & Time (Optional)"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => {
              setExpiresAt(e.target.value);
              if (expiresError) setExpiresError(undefined);
            }}
            error={expiresError}
            hint="Leave empty for permanent link. Must be a future timestamp."
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <Button type="button" variant="ghost" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting} className="gap-1.5 font-mono">
              <Link2 className="w-3.5 h-3.5" />
              Create Link
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};
