import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { DeviceRule } from '../../api/types';
import { isValidHttpUrl, ALLOWED_DEVICES } from '../../utils/routingValidation';

export interface DeviceRuleEditorProps {
  isOpen: boolean;
  initialRule?: DeviceRule | null;
  onSave: (rule: DeviceRule) => void;
  onClose: () => void;
}

type DeviceCategory = 'mobile' | 'tablet' | 'desktop' | 'unknown';

export const DeviceRuleEditor: React.FC<DeviceRuleEditorProps> = ({ isOpen, initialRule, onSave, onClose }) => {
  const [selectedDevices, setSelectedDevices] = useState<DeviceCategory[]>(['mobile']);
  const [targetUrl, setTargetUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialRule) {
      setSelectedDevices(Array.isArray(initialRule.devices) ? (initialRule.devices as DeviceCategory[]) : ['mobile']);
      setTargetUrl(initialRule.target_url || '');
    } else {
      setSelectedDevices(['mobile']);
      setTargetUrl('');
    }
    setError(null);
  }, [initialRule, isOpen]);

  const handleDeviceToggle = (dev: DeviceCategory) => {
    setSelectedDevices((prev) =>
      prev.includes(dev) ? prev.filter((d) => d !== dev) : [...prev, dev]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (selectedDevices.length === 0) {
      setError('At least one device category must be selected.');
      return;
    }

    if (!targetUrl.trim() || !isValidHttpUrl(targetUrl.trim())) {
      setError('Target URL must be a valid HTTP or HTTPS URL under 2048 characters.');
      return;
    }

    const rule: DeviceRule = {
      type: 'device',
      devices: selectedDevices,
      target_url: targetUrl.trim(),
    };

    onSave(rule);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialRule ? 'Edit Device Rule' : 'Add Device Rule'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-950/50 border border-rose-800 rounded text-rose-300 text-xs font-mono">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">Target Device Categories</label>
          <div className="grid grid-cols-2 gap-2">
            {ALLOWED_DEVICES.map((dev) => {
              const isSelected = selectedDevices.includes(dev as DeviceCategory);
              return (
                <button
                  key={dev}
                  type="button"
                  onClick={() => handleDeviceToggle(dev as DeviceCategory)}
                  className={`p-2.5 rounded border text-left flex items-center justify-between transition-colors ${
                    isSelected
                      ? 'bg-sky-950/70 border-sky-600 text-sky-200 font-semibold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="capitalize text-xs font-mono">{dev}</span>
                  <span
                    className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] ${
                      isSelected ? 'border-sky-400 bg-sky-500 text-slate-950 font-bold' : 'border-slate-600'
                    }`}
                  >
                    {isSelected ? '✓' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Target Destination URL</label>
          <input
            type="url"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://m.example.com/mobile-landing"
            className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100 font-mono text-xs focus:outline-hidden focus:border-sky-500"
            required
          />
        </div>

        <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm">
            {initialRule ? 'Save Changes' : 'Add Device Rule'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
