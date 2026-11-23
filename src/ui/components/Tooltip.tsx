import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';

export interface TooltipProps {
  text: string;
  label?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({
  text,
  label = 'Panduan fitur',
  position = 'top',
}) => {
  const [hoverOpen, setHoverOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [clickOpen, setClickOpen] = useState(false);
  const [horizontalShift, setHorizontalShift] = useState(0);

  const containerRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const pointerDownRef = useRef(false);
  const tooltipId = useId();

  const open = hoverOpen || focusOpen || clickOpen;

  useEffect(() => {
    if (!open) return;

    const handlePointerDownOutside = (e: PointerEvent) => {
      if (
        containerRef.current &&
        e.target instanceof Node &&
        !containerRef.current.contains(e.target)
      ) {
        setClickOpen(false);
        setFocusOpen(false);
        setHoverOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setClickOpen(false);
        setFocusOpen(false);
        setHoverOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setHorizontalShift(0);
      return;
    }
    const el = popoverRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 12;
    let shift = 0;
    if (rect.left < pad) {
      shift = pad - rect.left;
    } else if (rect.right > window.innerWidth - pad) {
      shift = window.innerWidth - pad - rect.right;
    }
    if (shift !== 0) {
      setHorizontalShift(shift);
    }
  }, [open, position, text]);

  const positionClasses =
    position === 'bottom'
      ? 'top-full left-1/2 -translate-x-1/2 mt-2'
      : position === 'left'
      ? 'right-full top-1/2 -translate-y-1/2 mr-2'
      : position === 'right'
      ? 'left-full top-1/2 -translate-y-1/2 ml-2'
      : 'bottom-full left-1/2 -translate-x-1/2 mb-2';

  return (
    <span
      ref={containerRef}
      className="relative inline-flex items-center align-middle"
      onMouseEnter={() => setHoverOpen(true)}
      onMouseLeave={() => setHoverOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onPointerDown={() => {
          pointerDownRef.current = true;
        }}
        onClick={(e) => {
          e.stopPropagation();
          setClickOpen((prev) => !prev);
          setHoverOpen(false);
        }}
        onFocus={() => {
          if (!pointerDownRef.current) {
            setFocusOpen(true);
          }
          pointerDownRef.current = false;
        }}
        onBlur={() => {
          setFocusOpen(false);
          setClickOpen(false);
        }}
        className="inline-flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 transition-colors"
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open && (
        <span
          ref={popoverRef}
          id={tooltipId}
          role="tooltip"
          style={
            horizontalShift !== 0
              ? { marginLeft: `${horizontalShift}px` }
              : undefined
          }
          className={`pointer-events-none absolute z-50 w-64 max-w-[calc(100vw-1.5rem)] rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-normal leading-relaxed text-slate-200 shadow-xl ${positionClasses}`}
        >
          {text}
        </span>
      )}
    </span>
  );
};
