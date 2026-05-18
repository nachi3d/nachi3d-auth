"use client";

import { useEffect, useRef } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  testid?: string;
  children: React.ReactNode;
}

/**
 * Lightweight controlled modal with overlay + Escape-to-close. No
 * focus trap — for short forms this is overkill, but the close button
 * gets focus on open so keyboard users can dismiss without grabbing a
 * mouse.
 */
export function Modal({
  open,
  onClose,
  labelledBy,
  testid,
  children,
}: ModalProps) {
  const closeButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      data-testid={testid}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      ref={closeButtonRef}
      tabIndex={-1}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-md rounded-sm border border-dark-700 bg-dark-900 p-6 shadow-2xl">
        {children}
      </div>
    </div>
  );
}
