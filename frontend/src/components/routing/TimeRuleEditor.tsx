import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { TimeRule, DayCode } from '../../api/types';
import { isValidHttpUrl, isValidIanaTimezone, ALLOWED_DAYS } from '../../utils/routingValidation';

export interface TimeRuleEditorProps {
  isOpen: boolean;
  initialRule?: TimeRule | null;
  onSave: (rule: TimeRule) => void;
  onClose: () => void;
}

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export const TimeRuleEditor: React.FC<TimeRuleEditorProps> = ({ isOpen, initialRule, onSave, onClose }) => {
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [timezone, setTimezone] = useState('UTC');
  const [customTimezone, setCustomTimezone] = useState('');
  const [isCustomTz, setIsCustomTz] = useState(false);
  const [selectedDays, setSelectedDays] = useState<DayCode[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [targetUrl, setTargetUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialRule) {
      setStartTime(initialRule.start || '09:00');
      setEndTime(initialRule.end || '17:00');
      setTargetUrl(initialRule.target_url || '');

      const tz = initialRule.timezone || 'UTC';
      if (COMMON_TIMEZONES.includes(tz)) {
        setTimezone(tz);
        setIsCustomTz(false);
      } else {
        setIsCustomTz(true);
        setCustomTimezone(tz);
      }

      if (Array.isArray(initialRule.days)) {
        setSelectedDays(initialRule.days);
      } else {
        setSelectedDays([]);
      }
    } else {
      setStartTime('09:00');
      setEndTime('17:00');
      setTimezone('UTC');
      setIsCustomTz(false);
      setCustomTimezone('');
      setSelectedDays(['mon', 'tue', 'wed', 'thu', 'fri']);
      setTargetUrl('');
    }
    setError(null);
  }, [initialRule, isOpen]);

  const handleDayToggle = (day: DayCode) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSelectAllDays = () => {
    if (selectedDays.length === ALLOWED_DAYS.length) {
      setSelectedDays([]);
    } else {
      setSelectedDays([...ALLOWED_DAYS]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const activeTz = isCustomTz ? customTimezone.trim() : timezone;

    if (!activeTz || !isValidIanaTimezone(activeTz)) {
      setError(`Invalid IANA timezone "${activeTz}". Please specify a valid timezone string (e.g. UTC, America/New_York).`);
      return;
    }

    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timeRegex.test(startTime)) {
      setError('Start time must be in HH:mm format (e.g. 09:00).');
      return;
    }
    if (!timeRegex.test(endTime)) {
      setError('End time must be in HH:mm format (e.g. 17:00).');
      return;
    }

    if (startTime === endTime) {
      setError('Start time and end time cannot be identical.');
      return;
    }

    if (!targetUrl.trim() || !isValidHttpUrl(targetUrl.trim())) {
      setError('Target URL must be a valid HTTP or HTTPS URL under 2048 characters.');
      return;
    }

    const rule: TimeRule = {
      type: 'time',
      start: startTime,
      end: endTime,
      timezone: activeTz,
      days: selectedDays.length > 0 ? selectedDays : undefined,
      target_url: targetUrl.trim(),
    };

    onSave(rule);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialRule ? 'Edit Time-Based Rule' : 'Add Time-Based Rule'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-950/50 border border-rose-800 rounded text-rose-300 text-xs font-mono">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Start Time (HH:mm)</label>
            <input
              type="text"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              placeholder="09:00"
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100 font-mono text-xs focus:outline-hidden focus:border-indigo-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">End Time (HH:mm)</label>
            <input
              type="text"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              placeholder="17:00"
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100 font-mono text-xs focus:outline-hidden focus:border-indigo-500"
              required
            />
          </div>
        </div>

        <p className="text-[11px] text-slate-400 font-mono leading-tight">
          Range interval evaluates as <span className="text-slate-200">[start, end)</span>. Overnight ranges spanning midnight (e.g. 22:00 to 06:00) are supported.
        </p>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">IANA Timezone</label>
          <div className="space-y-2">
            <select
              value={isCustomTz ? 'CUSTOM' : timezone}
              onChange={(e) => {
                if (e.target.value === 'CUSTOM') {
                  setIsCustomTz(true);
                } else {
                  setIsCustomTz(false);
                  setTimezone(e.target.value);
                }
              }}
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100 font-mono text-xs focus:outline-hidden focus:border-indigo-500"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
              <option value="CUSTOM">Custom IANA Timezone...</option>
            </select>

            {isCustomTz && (
              <input
                type="text"
                value={customTimezone}
                onChange={(e) => setCustomTimezone(e.target.value)}
                placeholder="e.g. Europe/Berlin"
                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100 font-mono text-xs focus:outline-hidden focus:border-indigo-500"
              />
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-slate-300">Days of Week (Optional)</label>
            <button
              type="button"
              onClick={handleSelectAllDays}
              className="text-[11px] text-indigo-400 hover:underline font-mono"
            >
              {selectedDays.length === ALLOWED_DAYS.length ? 'Clear All' : 'Select All'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ALLOWED_DAYS.map((day) => {
              const isSelected = selectedDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleDayToggle(day)}
                  className={`px-2.5 py-1 rounded text-xs font-mono uppercase transition-colors ${
                    isSelected
                      ? 'bg-indigo-600 text-white font-bold'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {day}
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
            placeholder="https://example.com/time-targeted"
            className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-100 font-mono text-xs focus:outline-hidden focus:border-indigo-500"
            required
          />
        </div>

        <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm">
            {initialRule ? 'Save Changes' : 'Add Time Rule'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
