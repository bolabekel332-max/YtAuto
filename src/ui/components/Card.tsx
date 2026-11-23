import React from 'react';
import { Tooltip } from './Tooltip';

export interface CardProps {
  title?: string;
  description?: string;
  tooltip?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({
  title,
  description,
  tooltip,
  headerAction,
  children,
  className = '',
}) => {
  return (
    <section
      className={`rounded-xl border border-slate-800 bg-slate-900/90 p-5 ${className}`}
    >
      {(title || headerAction) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-800/80 pb-3.5">
          <div className="min-w-0">
            {title && (
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight text-slate-100">
                  {title}
                </h2>
                {tooltip && <Tooltip text={tooltip} label={`Panduan ${title}`} />}
              </div>
            )}
            {description && (
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{description}</p>
            )}
          </div>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </div>
      )}
      {children}
    </section>
  );
};
