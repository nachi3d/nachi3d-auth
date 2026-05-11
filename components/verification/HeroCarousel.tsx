"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

interface HeroCarouselProps {
  photos: string[];
  alt: string;
  emptyLabel: string;
}

export function HeroCarousel({ photos, alt, emptyLabel }: HeroCarouselProps) {
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number | null>(null);
  const deltaXRef = useRef(0);

  const count = photos.length;

  const goTo = useCallback(
    (next: number) => {
      if (count === 0) return;
      const wrapped = ((next % count) + count) % count;
      setIndex(wrapped);
    },
    [count],
  );

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  // Global arrow-key navigation while the carousel has focus, OR when
  // the carousel is the most recent thing the user interacted with.
  // Listening on the element itself avoids hijacking page-level shortcuts.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (count <= 1) return;
    startXRef.current = e.clientX;
    deltaXRef.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (startXRef.current === null) return;
    deltaXRef.current = e.clientX - startXRef.current;
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (startXRef.current === null) return;
    const delta = deltaXRef.current;
    startXRef.current = null;
    deltaXRef.current = 0;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const SWIPE_THRESHOLD = 40;
    if (delta < -SWIPE_THRESHOLD) next();
    else if (delta > SWIPE_THRESHOLD) prev();
  };

  // Reset focus highlight when index changes (helps screen readers).
  useEffect(() => {
    trackRef.current?.setAttribute("aria-live", "polite");
  }, [index]);

  if (count === 0) {
    return (
      <div
        data-testid="hero-carousel"
        data-empty="true"
        className="mb-10 flex aspect-[4/5] items-center justify-center rounded-sm border border-dashed border-dark-700 bg-dark-800 text-dark-text-200"
      >
        {emptyLabel}
      </div>
    );
  }

  const currentPhoto = photos[index] ?? photos[0]!;

  return (
    <div
      data-testid="hero-carousel"
      data-count={count}
      data-current-index={index}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="mb-10 outline-none"
    >
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative aspect-[4/5] touch-pan-y select-none overflow-hidden rounded-sm bg-dark-800"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={currentPhoto}
          alt={`${alt} — ${index + 1}/${count}`}
          draggable={false}
          className="h-full w-full object-cover"
        />
        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={prev}
              data-testid="carousel-prev"
              aria-label="Previous photo"
              className="absolute inset-y-0 left-0 flex w-1/4 items-center justify-start px-3 text-white opacity-0 transition hover:bg-gradient-to-r hover:from-dark-950/70 hover:to-transparent hover:opacity-100 focus-visible:opacity-100"
            >
              ←
            </button>
            <button
              type="button"
              onClick={next}
              data-testid="carousel-next"
              aria-label="Next photo"
              className="absolute inset-y-0 right-0 flex w-1/4 items-center justify-end px-3 text-white opacity-0 transition hover:bg-gradient-to-l hover:from-dark-950/70 hover:to-transparent hover:opacity-100 focus-visible:opacity-100"
            >
              →
            </button>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <ul
          data-testid="carousel-thumbs"
          className="mt-3 hidden gap-2 md:flex"
          role="tablist"
        >
          {photos.map((url, i) => (
            <li key={url} role="presentation">
              <button
                type="button"
                role="tab"
                aria-selected={i === index}
                data-testid={`carousel-thumb-${i}`}
                onClick={() => goTo(i)}
                className={
                  "block h-12 w-12 overflow-hidden rounded-sm border-2 transition " +
                  (i === index
                    ? "border-primary-500"
                    : "border-transparent opacity-60 hover:opacity-100")
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {count > 1 ? (
        <div
          data-testid="carousel-dots"
          className="mt-3 flex justify-center gap-2 md:hidden"
        >
          {photos.map((url, i) => (
            <span
              key={url}
              className={
                "h-1.5 w-1.5 rounded-full transition " +
                (i === index ? "bg-primary-500" : "bg-dark-700")
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
