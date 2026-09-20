import React, { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { WeightedRule, WeightedDestination } from '../../api/types';
import { isValidHttpUrl } from '../../utils/routingValidation';

export interface WeightedRuleEditorProps {
  isOpen: boolean;
  initialRule?: WeightedRule | null;
  onSave: (rule: WeightedRule) => void;
  onClose: () => void;
}

export const WeightedRuleEditor: React.FC<WeightedRuleEditorProps> = ({ isOpen, initialRule, onSave, onClose }) => {
  const [destinations, setDestinations] = useState<WeightedDestination[]>([
    { target_url: '', weight: 50 },
    { target_url: '', weight: 50 },
  ]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialRule && Array.isArray(initialRule.destinations) && initialRule.destinations.length >= 2) {
      setDestinations(JSON.parse(JSON.stringify(initialRule.destinations)));
    } else {
      setDestinations([
        { target_url: '', weight: 50 },
        { target_url: '', weight: 50 },
      ]);
    }
    setError(null);
  }, [initialRule, isOpen]);

  const totalWeight = destinations.reduce((sum, d) => sum + (Number.isInteger(d.weight) ? d.weight : 0), 0);

  const handleDestinationChange = (index: number, field: 'target_url' | 'weight', value: string | number) => {
    setDestinations((prev) => {
      const updated = [...prev];
      if (field === 'target_url') {
        updated[index] = { ...updated[index], target_url: String(value) };
      } else {
        const num = typeof value === 'number' ? value : parseInt(value, 10);
        updated[index] = { ...updated[index], weight: isNaN(num) ? 0 : num };
      }
      return updated;
    });
  };

  const handleAddDestination = () => {
    if (destinations.length >= 10) return;
    setDestinations((prev) => [...prev, { target_url: '', weight: 10 }]);
  };

  const handleRemoveDestination = (index: number) => {
    if (destinations.length <= 2) return;
    setDestinations((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (destinations.length < 2 || destinations.length > 10) {
      setError('Weighted routing requires between 2 and 10 destinations.');
      return;
    }

    for (let i = 0; i < destinations.length; i++) {
      const d = destinations[i];
      if (!d.target_url.trim() || !isValidHttpUrl(d.target_url.trim())) {
        setError(`Destination #${i + 1} URL must be a valid HTTP or HTTPS URL.`);
        return;
      }
      if (!Number.isInteger(d.weight) || d.weight < 1 || d.weight > 100) {
        setError(`Destination #${i + 1} weight must be an integer between 1 and 100.`);
        return;
      }
    }

    if (totalWeight < 1 || totalWeight > 1000) {
      setError(`Total weight sum must be between 1 and 1000 (currently ${totalWeight}).`);
      return;
    }

    const rule: WeightedRule = {
      type: 'weighted',
      destinations: destinations.map((d) => ({
        target_url: d.target_url.trim(),
        weight: Number(d.weight),
      })),
    };

    onSave(rule);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialRule ? 'Edit Weighted Rule' : 'Add Weighted Rule'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-950/50 border border-rose-800 rounded text-rose-300 text-xs font-mono">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div>
            <span className="text-xs font-semibold text-slate-300">Weighted Destinations ({destinations.length}/10)</span>
            <p className="text-[11px] text-slate-400 font-mono">Min 2, Max 10. Individual weights 1–100.</p>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono text-slate-400 uppercase">Total Weight</span>
            <div
              className={`text-sm font-mono font-bold ${
                totalWeight > 1000 || totalWeight < 1 ? 'text-rose-400' : 'text-amber-400'
              }`}
            >
              {totalWeight} / 1000
            </div>
          </div>
        </div>

        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
          {destinations.map((dest, idx) => (
            <div key={idx} className="p-3 bg-slate-900 border border-slate-800 rounded space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-amber-400">Destination #{idx + 1}</span>
                {destinations.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveDestination(idx)}
                    className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                    aria-label={`Remove destination #${idx + 1}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-mono text-slate-400 mb-0.5">Destination URL</label>
                  <input
                    type="url"
                    value={dest.target_url}
                    onChange={(e) => handleDestinationChange(idx, 'target_url', e.target.value)}
                    placeholder="https://v1.example.com/ab-variant"
                    className="w-full px-2.5 py-1 bg-slate-950 border border-slate-700 rounded text-slate-100 font-mono text-xs focus:outline-hidden focus:border-amber-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-0.5">Weight (1–100)</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={dest.weight}
                    onChange={(e) => handleDestinationChange(idx, 'weight', e.target.value)}
                    className="w-full px-2.5 py-1 bg-slate-950 border border-slate-700 rounded text-slate-100 font-mono text-xs focus:outline-hidden focus:border-amber-500 text-right"
                    required
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {destinations.length < 10 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleAddDestination}
            className="w-full justify-center border border-dashed border-slate-700 text-slate-300 hover:bg-slate-900 gap-1 font-mono text-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Add Destination Row
          </Button>
        )}

        <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm">
            {initialRule ? 'Save Changes' : 'Add Weighted Rule'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
