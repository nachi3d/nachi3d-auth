import type { Locale } from "@/i18n/routing";
import type { ProvenanceEventRow, ProvenanceEventType } from "@/lib/supabase/types";

interface ProvenanceTimelineProps {
  events: Array<
    Pick<ProvenanceEventRow, "id" | "event_type" | "occurred_at" | "notes">
  >;
  labels: {
    title: string;
    types: Record<ProvenanceEventType, string>;
    empty: string;
  };
  locale: Locale;
}

function formatDate(value: string, locale: Locale): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function ProvenanceTimeline({
  events,
  labels,
  locale,
}: ProvenanceTimelineProps) {
  return (
    <section data-testid="provenance-timeline" className="mt-16">
      <h2 className="mb-6 text-xs uppercase tracking-[0.25em] text-dark-text-200">
        {labels.title}
      </h2>
      {events.length === 0 ? (
        <p className="text-sm text-dark-text-200">{labels.empty}</p>
      ) : (
        <ol className="relative space-y-5 border-l border-dark-700 pl-6">
          {events.map((event) => (
            <li
              key={event.id}
              data-testid="provenance-event"
              data-event-type={event.event_type}
              className="relative"
            >
              <span
                aria-hidden
                className="absolute -left-[27px] top-1.5 h-2 w-2 rounded-full bg-primary-500"
              />
              <p className="text-xs uppercase tracking-[0.2em] text-primary-400">
                {labels.types[event.event_type]}
              </p>
              <p className="mt-1 text-sm text-dark-text-100">
                {formatDate(event.occurred_at, locale)}
              </p>
              {event.notes ? (
                <p className="mt-1 text-sm text-dark-text-200">{event.notes}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
