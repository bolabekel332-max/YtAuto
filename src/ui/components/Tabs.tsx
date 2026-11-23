import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  badgeText?: string;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  items,
  activeId,
  onChange,
  ariaLabel = 'Navigasi tab',
}) => {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1"
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
              active
                ? 'bg-sky-500/15 text-sky-200 border border-sky-500/30'
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200 border border-transparent'
            }`}
          >
            <span>{item.label}</span>
            {item.badgeText && (
              <span className="text-[11px] text-slate-400 tabular-nums">
                · {item.badgeText}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
