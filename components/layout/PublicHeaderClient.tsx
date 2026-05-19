"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { publicSignOutAction } from "@/app/[locale]/auth-actions";
import type { Locale } from "@/i18n/routing";

interface PublicHeaderClientProps {
  locale: Locale;
  triggerLabel: string;
  initials: string;
  labels: {
    myPieces: string;
    signOut: string;
  };
}

export function PublicHeaderClient({
  locale,
  triggerLabel,
  initials,
  labels,
}: PublicHeaderClientProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const itemCount = 2;

  // Click-outside + Esc-on-document close. Both are scoped to `open`
  // so we don't waste a listener while the menu is dismissed.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // When the menu opens, push focus into the first item so arrow-key
  // navigation has somewhere to start. When it closes, return focus to
  // the trigger so keyboard users aren't dropped on the body.
  useEffect(() => {
    if (open) {
      itemRefs.current[activeIndex]?.focus();
    }
  }, [open, activeIndex]);

  function handleTriggerKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setActiveIndex(0);
      setOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(itemCount - 1);
      setOpen(true);
    }
  }

  function handleMenuKey(e: React.KeyboardEvent<HTMLUListElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % itemCount);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + itemCount) % itemCount);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(itemCount - 1);
    } else if (e.key === "Tab") {
      // Tab away closes the menu so focus doesn't jump back inside
      // when the next focus target lives elsewhere on the page.
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative" data-testid="public-header-user">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleTriggerKey}
        data-testid="public-header-trigger"
        className="flex items-center gap-2 rounded-sm px-1 py-1 text-sm text-dark-text-100 transition hover:text-primary-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60"
      >
        <span
          aria-hidden
          data-testid="public-header-avatar"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-500 text-xs font-medium text-white"
        >
          {initials}
        </span>
        <span
          data-testid="public-header-label"
          className="max-w-[10rem] truncate"
        >
          {triggerLabel}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 12 12"
          className={`h-3 w-3 text-dark-text-200 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M3 4.5 L6 7.5 L9 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <ul
          id={menuId}
          role="menu"
          aria-label={triggerLabel}
          onKeyDown={handleMenuKey}
          data-testid="public-header-menu"
          // RTL flips the anchor: in LTR the menu hangs from the right
          // edge of the trigger; in RTL it hangs from the left edge.
          // z-50 keeps it above any `<main>` that paints later in DOM
          // order — without it Playwright clicks landed on the page
          // body and the menu items were unreachable.
          className="absolute end-0 top-full z-50 mt-2 min-w-[12rem] rounded-sm border border-dark-700 bg-dark-900/95 py-1 shadow-xl backdrop-blur"
        >
          <li role="none">
            <Link
              ref={(el) => {
                itemRefs.current[0] = el;
              }}
              role="menuitem"
              href={`/${locale}/me`}
              data-testid="public-header-menu-my-pieces"
              tabIndex={activeIndex === 0 ? 0 : -1}
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-dark-text-100 transition hover:bg-dark-800 hover:text-primary-300 focus:bg-dark-800 focus:text-primary-300 focus:outline-none"
            >
              {labels.myPieces}
            </Link>
          </li>
          <li role="none">
            <form action={publicSignOutAction}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="next" value={`/${locale}`} />
              <button
                ref={(el) => {
                  itemRefs.current[1] = el;
                }}
                type="submit"
                role="menuitem"
                data-testid="public-header-menu-sign-out"
                tabIndex={activeIndex === 1 ? 0 : -1}
                className="block w-full px-4 py-2 text-start text-sm text-dark-text-100 transition hover:bg-dark-800 hover:text-primary-300 focus:bg-dark-800 focus:text-primary-300 focus:outline-none"
              >
                {labels.signOut}
              </button>
            </form>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
