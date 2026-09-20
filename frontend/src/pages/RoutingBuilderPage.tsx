import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Save, RotateCcw, Plus, Route, AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { linksApi } from '../api/endpoints/links';
import { RoutingConfig, RoutingRule, TimeRule, DeviceRule, WeightedRule, LinkRecord } from '../api/types';
import { routingConfigToBuilderState, builderStateToRoutingConfig, RoutingBuilderState } from '../utils/routingConverter';
import { validateRoutingConfigClient } from '../utils/routingValidation';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { CodeText } from '../components/common/CodeText';
import { RuleCard } from '../components/routing/RuleCard';
import { AddRuleModal } from '../components/routing/AddRuleModal';
import { TimeRuleEditor } from '../components/routing/TimeRuleEditor';
import { DeviceRuleEditor } from '../components/routing/DeviceRuleEditor';
import { WeightedRuleEditor } from '../components/routing/WeightedRuleEditor';

export const RoutingBuilderPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const queryClient = useQueryClient();

  const { data: listData } = useQuery({
    queryKey: ['links', 0],
    queryFn: () => linksApi.list({ limit: 100, offset: 0 }),
    enabled: Boolean(code),
  });

  const links = listData?.links || [];
  const link = links.find((l: LinkRecord) => l.short_code === code);

  const [builderState, setBuilderState] = useState<RoutingBuilderState>({ defaultFallback: '', rules: [] });
  const [initialConfig, setInitialConfig] = useState<RoutingConfig | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal controls
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);
  const [editingRuleType, setEditingRuleType] = useState<'time' | 'device' | 'weighted' | null>(null);
  const [isJsonPreviewOpen, setIsJsonPreviewOpen] = useState(false);

  useEffect(() => {
    if (link) {
      const cfg = link.routing_config || null;
      setInitialConfig(cfg);
      setBuilderState(routingConfigToBuilderState(cfg));
    }
  }, [link]);

  const currentPayload = builderStateToRoutingConfig(builderState);
  const isDirty = JSON.stringify(currentPayload) !== JSON.stringify(initialConfig);

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setBuilderState((prev) => {
      const updated = [...prev.rules];
      const temp = updated[index - 1];
      updated[index - 1] = updated[index];
      updated[index] = temp;
      return { ...prev, rules: updated };
    });
    setSuccessMessage(null);
  };

  const handleMoveDown = (index: number) => {
    if (index === builderState.rules.length - 1) return;
    setBuilderState((prev) => {
      const updated = [...prev.rules];
      const temp = updated[index + 1];
      updated[index + 1] = updated[index];
      updated[index] = temp;
      return { ...prev, rules: updated };
    });
    setSuccessMessage(null);
  };

  const handleDeleteRule = (index: number) => {
    setBuilderState((prev) => ({
      ...prev,
      rules: prev.rules.filter((_, i) => i !== index),
    }));
    setSuccessMessage(null);
  };

  const handleStartAddRule = (type: 'time' | 'device' | 'weighted') => {
    if (builderState.rules.length >= 10) {
      setValidationError('Cannot add more than 10 routing rules.');
      return;
    }
    setEditingRuleIndex(null);
    setEditingRuleType(type);
    setSuccessMessage(null);
  };

  const handleStartEditRule = (index: number) => {
    const targetRule = builderState.rules[index];
    if (!targetRule) return;
    setEditingRuleIndex(index);
    setEditingRuleType(targetRule.type);
    setSuccessMessage(null);
  };

  const handleSaveRule = (rule: RoutingRule) => {
    setBuilderState((prev) => {
      const updated = [...prev.rules];
      if (editingRuleIndex !== null && editingRuleIndex >= 0 && editingRuleIndex < updated.length) {
        updated[editingRuleIndex] = rule;
      } else {
        updated.push(rule);
      }
      return { ...prev, rules: updated };
    });
    setEditingRuleIndex(null);
    setEditingRuleType(null);
    setValidationError(null);
  };

  const handleDiscard = () => {
    setBuilderState(routingConfigToBuilderState(initialConfig));
    setValidationError(null);
    setApiError(null);
    setSuccessMessage(null);
  };

  const handleSaveConfig = async () => {
    setValidationError(null);
    setApiError(null);
    setSuccessMessage(null);

    const payload = builderStateToRoutingConfig(builderState);

    // Client-side validation
    const valResult = validateRoutingConfigClient(payload);
    if (!valResult.valid) {
      setValidationError(valResult.error || 'Invalid routing configuration.');
      return;
    }

    if (!code) return;

    setIsSaving(true);
    try {
      const updatedLink = await linksApi.update(code, {
        routing_config: payload,
      });

      // Update React Query caches
      await queryClient.invalidateQueries({ queryKey: ['links'] });
      await queryClient.invalidateQueries({ queryKey: ['link-analytics', code] });

      const savedCfg = updatedLink.routing_config || null;
      setInitialConfig(savedCfg);
      setBuilderState(routingConfigToBuilderState(savedCfg));
      setSuccessMessage('Routing pipeline configuration saved successfully!');
    } catch (err: any) {
      const msg = err?.error?.message || err?.message || 'Failed to save routing configuration';
      setApiError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const publicUrl = `${(import.meta.env.VITE_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/+$/, '')}/s/${code || ''}`;

  return (
    <div className="space-y-6">
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="space-y-1 font-mono text-xs">
          <Link
            to={`/links/${code}`}
            className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200 mb-1 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Link Console
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-100 font-sans tracking-tight">
              Visual Routing Builder
            </h1>
            <Badge variant="routing">/s/{code}</Badge>
            {isDirty && (
              <span className="px-2 py-0.5 text-[10px] bg-amber-950/80 border border-amber-800/80 text-amber-300 font-semibold rounded animate-pulse">
                Unsaved Changes
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span>Public URL:</span>
            <CodeText copyable>{publicUrl}</CodeText>
          </div>
        </div>

        {/* ACTIONS */}
        <div className="flex items-center gap-2">
          {isDirty && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDiscard}
              disabled={isSaving}
              className="gap-1 text-slate-300 hover:text-rose-300 font-mono text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Discard Edits
            </Button>
          )}

          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveConfig}
            disabled={isSaving || !isDirty}
            className="gap-1.5 font-mono text-xs"
          >
            <Save className="w-3.5 h-3.5" /> {isSaving ? 'Saving Pipeline...' : 'Save Pipeline'}
          </Button>
        </div>
      </div>

      {/* FEEDBACK BANNERS */}
      {validationError && (
        <div className="p-4 bg-rose-950/60 border border-rose-800 rounded-md text-rose-200 text-xs font-mono flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-rose-300 mb-0.5">Validation Failed</div>
            <div>{validationError}</div>
          </div>
        </div>
      )}

      {apiError && (
        <div className="p-4 bg-rose-950/60 border border-rose-800 rounded-md text-rose-200 text-xs font-mono flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-rose-300 mb-0.5">API Request Error</div>
            <div>{apiError}</div>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-800 rounded-md text-emerald-200 text-xs font-mono flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-emerald-300 mb-0.5">Pipeline Updated</div>
            <div>{successMessage}</div>
          </div>
        </div>
      )}

      {/* PIPELINE OVERVIEW */}
      <div className="bg-brand-surface border border-brand-border rounded-md p-6 space-y-6 font-mono text-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-slate-100 font-semibold text-sm">
            <Route className="w-4 h-4 text-brand-primary" />
            <span>Conditional Routing Pipeline ({builderState.rules.length}/10 Rules)</span>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsAddModalOpen(true)}
            disabled={builderState.rules.length >= 10}
            className="gap-1 font-mono text-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Add Routing Rule
          </Button>
        </div>

        {/* RULES LIST */}
        {builderState.rules.length === 0 ? (
          <div className="p-6 bg-slate-900/60 border border-slate-800 rounded text-center space-y-2">
            <div className="text-slate-300 font-semibold text-xs">No Conditional Rules Configured</div>
            <p className="text-[11px] text-slate-400 max-w-md mx-auto font-sans leading-relaxed">
              Traffic to shortcode <span className="font-mono text-slate-200">/s/{code}</span> will evaluate default fallback or primary link target URL without conditional branching.
            </p>
            <div className="pt-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsAddModalOpen(true)}
                className="gap-1 font-mono text-xs"
              >
                <Plus className="w-3.5 h-3.5" /> Add First Routing Rule
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
              Rules are evaluated sequentially in top-to-bottom array order. The first matching condition terminates evaluation and redirects traffic.
            </p>

            {builderState.rules.map((rule, idx) => (
              <RuleCard
                key={idx}
                rule={rule}
                index={idx}
                totalRules={builderState.rules.length}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onEdit={handleStartEditRule}
                onDelete={handleDeleteRule}
              />
            ))}
          </div>
        )}

        {/* DEFAULT FALLBACK SECTION */}
        <div className="pt-4 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
              Default Fallback Destination (Optional)
            </span>
            <Badge variant="neutral">Fallback</Badge>
          </div>

          <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
            If no conditional rule matches incoming request parameters, traffic routes to this Fallback URL. If left empty, traffic falls back to the primary link target URL (<span className="font-mono text-slate-300">{link?.target_url || 'primary destination'}</span>).
          </p>

          <input
            type="url"
            value={builderState.defaultFallback}
            onChange={(e) => {
              setBuilderState((prev) => ({ ...prev, defaultFallback: e.target.value }));
              setSuccessMessage(null);
            }}
            placeholder="https://example.com/fallback-destination"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-100 font-mono text-xs focus:outline-hidden focus:border-indigo-500"
          />
        </div>
      </div>

      {/* DEVELOPER JSON PREVIEW */}
      <div className="bg-slate-900 border border-slate-800 rounded-md overflow-hidden font-mono text-xs">
        <button
          type="button"
          onClick={() => setIsJsonPreviewOpen(!isJsonPreviewOpen)}
          className="w-full px-4 py-3 bg-slate-950 flex items-center justify-between text-slate-300 hover:text-slate-100 font-semibold"
        >
          <span className="flex items-center gap-2">
            Developer Inspection: Raw <code className="text-indigo-400 font-bold">routing_config</code> JSON Preview
          </span>
          {isJsonPreviewOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {isJsonPreviewOpen && (
          <div className="p-4 border-t border-slate-800 bg-slate-950/80">
            <pre className="text-[11px] text-indigo-300 overflow-x-auto leading-relaxed">
              {JSON.stringify(currentPayload, null, 2) || 'null'}
            </pre>
          </div>
        )}
      </div>

      {/* MODALS */}
      <AddRuleModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSelectType={handleStartAddRule}
      />

      <TimeRuleEditor
        isOpen={editingRuleType === 'time'}
        initialRule={editingRuleIndex !== null ? (builderState.rules[editingRuleIndex] as TimeRule) : null}
        onSave={handleSaveRule}
        onClose={() => {
          setEditingRuleType(null);
          setEditingRuleIndex(null);
        }}
      />

      <DeviceRuleEditor
        isOpen={editingRuleType === 'device'}
        initialRule={editingRuleIndex !== null ? (builderState.rules[editingRuleIndex] as DeviceRule) : null}
        onSave={handleSaveRule}
        onClose={() => {
          setEditingRuleType(null);
          setEditingRuleIndex(null);
        }}
      />

      <WeightedRuleEditor
        isOpen={editingRuleType === 'weighted'}
        initialRule={editingRuleIndex !== null ? (builderState.rules[editingRuleIndex] as WeightedRule) : null}
        onSave={handleSaveRule}
        onClose={() => {
          setEditingRuleType(null);
          setEditingRuleIndex(null);
        }}
      />
    </div>
  );
};
