import React, { useId } from 'react';
import { Tooltip } from './Tooltip';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  label: string;
  value: string;
  options: readonly (string | SelectOption)[];
  onChange: (value: string) => void;
  customValue?: string;
  onCustomChange?: (value: string) => void;
  customPlaceholder?: string;
  customMaxLength?: number;
  tooltip?: string;
  helperText?: string;
}

export const SelectField: React.FC<SelectFieldProps> = ({
  label,
  value,
  options,
  onChange,
  customValue = '',
  onCustomChange,
  customPlaceholder = 'Isi sendiri...',
  customMaxLength = 500,
  tooltip,
  helperText,
}) => {
  const selectId = useId();
  const customId = useId();
  const normalizedOptions: SelectOption[] = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label htmlFor={selectId} className="text-xs font-medium text-slate-200">
          {label}
        </label>
        {tooltip && <Tooltip text={tooltip} label={`Panduan ${label}`} />}
      </div>
      <select
        id={selectId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        {normalizedOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {value === 'Lainnya' && onCustomChange && (
        <div className="pt-1">
          <label htmlFor={customId} className="sr-only">
            {label} kustom
          </label>
          <input
            id={customId}
            type="text"
            maxLength={customMaxLength}
            value={customValue}
            onChange={(e) => onCustomChange(e.target.value)}
            placeholder={customPlaceholder}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          />
        </div>
      )}
      {helperText && <p className="text-xs text-slate-400">{helperText}</p>}
    </div>
  );
};

export interface ChipGroupProps {
  label: string;
  options: readonly (string | SelectOption)[];
  selected: string[];
  onChange: (next: string[]) => void;
  customValue?: string;
  onCustomChange?: (value: string) => void;
  customPlaceholder?: string;
  customMaxLength?: number;
  tooltip?: string;
  minSelected?: number;
}

export const ChipGroup: React.FC<ChipGroupProps> = ({
  label,
  options,
  selected,
  onChange,
  customValue = '',
  onCustomChange,
  customPlaceholder = 'Isi pilihan lainnya...',
  customMaxLength = 500,
  tooltip,
  minSelected = 1,
}) => {
  const customId = useId();
  const normalizedOptions: SelectOption[] = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );

  const toggle = (val: string) => {
    const exists = selected.includes(val);
    if (exists) {
      if (selected.length <= minSelected) return;
      onChange(selected.filter((s) => s !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-slate-200">{label}</span>
        {tooltip && <Tooltip text={tooltip} label={`Panduan ${label}`} />}
      </div>
      <div className="flex flex-wrap gap-2.5">
        {normalizedOptions.map((opt) => {
          const active = selected.includes(opt.value);
          return (
            <label
              key={opt.value}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium cursor-pointer transition-colors select-none ${
                active
                  ? 'border-sky-500/80 bg-sky-500/20 text-sky-100 shadow-sm'
                  : 'border-slate-800 bg-slate-950/80 text-slate-300 hover:border-slate-700 hover:text-white'
              }`}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggle(opt.value)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900 accent-sky-400 text-sky-500 focus:ring-sky-400 focus:ring-offset-slate-950"
              />
              <span>{opt.label}</span>
            </label>
          );
        })}
      </div>
      {selected.includes('Lainnya') && onCustomChange && (
        <div className="pt-1">
          <label htmlFor={customId} className="sr-only">
            {label} lainnya
          </label>
          <input
            id={customId}
            type="text"
            maxLength={customMaxLength}
            value={customValue}
            onChange={(e) => onCustomChange(e.target.value)}
            placeholder={customPlaceholder}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          />
        </div>
      )}
    </div>
  );
};
