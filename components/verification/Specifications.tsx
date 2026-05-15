import type { Locale } from "@/i18n/routing";

export interface SpecsLabels {
  sectionTitle: string;
  height: string;
  base_width: string;
  weight: string;
  material: string;
  scale: string;
  variant: string;
  mm: string;
  g: string;
}

export interface SpecsValues {
  height_mm: number | null;
  base_width_mm: number | null;
  weight_g: number | null;
  material: string | null;
  scale: string | null;
  variant_label: string | null;
}

export function hasAnySpecs(s: SpecsValues): boolean {
  return (
    s.height_mm !== null ||
    s.base_width_mm !== null ||
    s.weight_g !== null ||
    (s.material !== null && s.material.length > 0) ||
    (s.scale !== null && s.scale.length > 0) ||
    (s.variant_label !== null && s.variant_label.length > 0)
  );
}

function formatNumber(value: number, locale: Locale): string {
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return value.toFixed(1);
  }
}

export function Specifications({
  values,
  labels,
  locale,
}: {
  values: SpecsValues;
  labels: SpecsLabels;
  locale: Locale;
}) {
  if (!hasAnySpecs(values)) return null;

  const rows: Array<{ key: string; label: string; value: string }> = [];
  if (values.height_mm !== null) {
    rows.push({
      key: "height_mm",
      label: labels.height,
      value: `${formatNumber(values.height_mm, locale)} ${labels.mm}`,
    });
  }
  if (values.base_width_mm !== null) {
    rows.push({
      key: "base_width_mm",
      label: labels.base_width,
      value: `${formatNumber(values.base_width_mm, locale)} ${labels.mm}`,
    });
  }
  if (values.weight_g !== null) {
    rows.push({
      key: "weight_g",
      label: labels.weight,
      value: `${formatNumber(values.weight_g, locale)} ${labels.g}`,
    });
  }
  if (values.material) {
    rows.push({
      key: "material",
      label: labels.material,
      value: values.material,
    });
  }
  if (values.scale) {
    rows.push({ key: "scale", label: labels.scale, value: values.scale });
  }
  if (values.variant_label) {
    rows.push({
      key: "variant_label",
      label: labels.variant,
      value: values.variant_label,
    });
  }

  return (
    <section
      data-testid="verification-specs"
      className="mt-10 border-t border-dark-700 pt-8"
    >
      <h2 className="mb-4 text-xs uppercase tracking-[0.2em] text-dark-text-200">
        {labels.sectionTitle}
      </h2>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.key}
            data-testid={`spec-row-${row.key}`}
            className="flex flex-col gap-1"
          >
            <dt className="text-xs uppercase tracking-[0.15em] text-dark-text-200">
              {row.label}
            </dt>
            <dd className="text-dark-text-100">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
