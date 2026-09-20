import React from 'react';
import { Clock, Smartphone, Scale } from 'lucide-react';
import { Modal } from '../common/Modal';

export interface AddRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectType: (type: 'time' | 'device' | 'weighted') => void;
}

export const AddRuleModal: React.FC<AddRuleModalProps> = ({ isOpen, onClose, onSelectType }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Select Routing Rule Type">
      <div className="space-y-3 font-mono text-xs">
        <p className="text-slate-400 leading-relaxed font-sans text-xs">
          Select a rule type to append to your traffic routing pipeline. Rules are evaluated sequentially in array order.
        </p>

        <button
          type="button"
          onClick={() => {
            onSelectType('time');
            onClose();
          }}
          className="w-full p-3.5 bg-slate-900 border border-slate-800 hover:border-indigo-500 hover:bg-slate-850 rounded-md text-left transition-all flex items-start gap-3 group"
        >
          <div className="p-2 bg-indigo-950/80 border border-indigo-800/60 rounded text-indigo-400 group-hover:bg-indigo-900 transition-colors">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-slate-200 text-xs">Time-Based Routing</div>
            <p className="text-[11px] text-slate-400 font-sans mt-0.5">
              Route requests based on IANA timezone, start/end hours (e.g. 09:00 - 17:00), and day of week.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            onSelectType('device');
            onClose();
          }}
          className="w-full p-3.5 bg-slate-900 border border-slate-800 hover:border-sky-500 hover:bg-slate-850 rounded-md text-left transition-all flex items-start gap-3 group"
        >
          <div className="p-2 bg-sky-950/80 border border-sky-800/60 rounded text-sky-400 group-hover:bg-sky-900 transition-colors">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-slate-200 text-xs">Device-Based Routing</div>
            <p className="text-[11px] text-slate-400 font-sans mt-0.5">
              Target incoming traffic based on User-Agent classification (Mobile, Tablet, Desktop, Unknown).
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            onSelectType('weighted');
            onClose();
          }}
          className="w-full p-3.5 bg-slate-900 border border-slate-800 hover:border-amber-500 hover:bg-slate-850 rounded-md text-left transition-all flex items-start gap-3 group"
        >
          <div className="p-2 bg-amber-950/80 border border-amber-800/60 rounded text-amber-400 group-hover:bg-amber-900 transition-colors">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-slate-200 text-xs">Weighted Traffic Distribution (A/B)</div>
            <p className="text-[11px] text-slate-400 font-sans mt-0.5">
              Distribute traffic across 2–10 destinations using relative integer weight ratios.
            </p>
          </div>
        </button>
      </div>
    </Modal>
  );
};
