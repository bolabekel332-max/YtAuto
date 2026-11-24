import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface AccessibleDialogProps {
  open: boolean;
  ariaLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}

export const AccessibleDialog: React.FC<AccessibleDialogProps> = ({
  open,
  ariaLabel,
  onClose,
  children,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const rootEl = document.getElementById('root') as (HTMLElement & { inert?: boolean }) | null;
    if (rootEl) {
      rootEl.inert = true;
    }

    const focusFirst = () => {
      const focusables = containerRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables && focusables.length > 0) {
        focusables[0].focus();
      } else {
        containerRef.current?.focus();
      }
    };
    const rafId = window.requestAnimationFrame(focusFirst);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !containerRef.current) return;
      const focusables = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(rafId);
      document.removeEventListener('keydown', handleKeyDown);
      if (rootEl) {
        rootEl.inert = false;
      }
      if (prevFocus && typeof prevFocus.focus === 'function' && prevFocus.isConnected) {
        prevFocus.focus();
      }
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-4"
    >
      {children}
    </div>,
    document.body
  );
};
