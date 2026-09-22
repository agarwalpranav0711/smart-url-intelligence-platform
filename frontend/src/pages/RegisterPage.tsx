import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Key, ShieldCheck, ArrowRight } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { ErrorState } from '../components/common/ErrorState';
import { CodeText } from '../components/common/CodeText';
import { authApi } from '../api/endpoints/auth';
import { useAuth } from '../context/AuthContext';
import { RegisterUserResponse } from '../api/types';

export const RegisterPage: React.FC = () => {
  const [name, setName] = useState('');
  const [existingKey, setExistingKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const [result, setResult] = useState<RegisterUserResponse | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const response = await authApi.register({ name: name.trim() || 'Developer Key' });
      setResult(response);
      await login(response.api_key);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExistingKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!existingKey.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      await login(existingKey.trim());
      navigate('/dashboard');
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="Developer Registration"
        description="Provision a developer identity account and receive your primary API key (POST /api/v1/users)."
      />

      {error && <ErrorState error={error} onRetry={() => setError(null)} />}

      {result ? (
        <div className="bg-slate-900 border border-brand-border rounded-md p-6 space-y-4">
          <div className="flex items-center gap-2 text-emerald-400 font-mono text-sm font-semibold">
            <ShieldCheck className="w-5 h-5" />
            <span>Developer Account Provisioned Successfully</span>
          </div>

          <p className="text-xs text-brand-textMuted font-mono">
            Key ID: <span className="text-slate-200">{result.key_id}</span>
          </p>

          <p className="text-xs text-brand-textMuted">
            Save your primary API key below. Raw keys are returned ONLY ONCE upon creation and are retained in React state memory for this browser session.
          </p>

          <div className="space-y-2 pt-2">
            <div className="text-xs font-mono text-slate-400">Primary API Key:</div>
            <CodeText block copyable>
              {result.api_key}
            </CodeText>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button
              variant="primary"
              onClick={() => navigate('/dashboard')}
              className="gap-2"
            >
              Go to Dashboard <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <form onSubmit={handleSubmit} className="bg-slate-900 border border-brand-border rounded-md p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200">Register New Developer Identity</h3>
            <Input
              label="Key Identifier / Name"
              placeholder="Primary Development Key"
              value={name}
              onChange={(e) => setName(e.target.value)}
              hint="An initial API key secret will be provisioned for your developer account."
            />

            <div className="pt-2 flex justify-end">
              <Button type="submit" isLoading={isLoading} className="gap-2">
                <Key className="w-4 h-4" />
                Register Account & Key
              </Button>
            </div>
          </form>

          <form onSubmit={handleExistingKeySubmit} className="bg-slate-900 border border-brand-border rounded-md p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200">Authenticate Active Web Session</h3>
            <Input
              label="Existing API Key"
              type="password"
              placeholder="sk_live_..."
              value={existingKey}
              onChange={(e) => setExistingKey(e.target.value)}
              hint="Exchange a valid API key for an HttpOnly browser session."
            />

            <div className="pt-2 flex justify-end">
              <Button type="submit" variant="secondary" isLoading={isLoading} className="gap-2">
                <ShieldCheck className="w-4 h-4" />
                Establish Web Session
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
