-- Phase 5-prep — physical characteristics fields
--
-- Pieces need structured optional fields so collectors can distinguish
-- variants. The concrete driver is the "Raze" design, which exists in
-- three sizes; without dimensions, two Raze pieces are indistinguishable
-- on paper despite being physically different objects.
--
-- All six columns are nullable with no default. Existing pieces simply
-- have no specs, which is a valid state. Precision is generous (height
-- and base up to 9999.9 mm, weight up to 999999.9 g) so we never need a
-- second migration to widen them.
--
-- material / scale / variant_label are short free-text. Max length is
-- enforced at the application layer via zod (material 80, scale 40,
-- variant_label 60) — kept off the DB so we can tune limits without a
-- schema change.
--
-- No index needed: these fields are not queried or filtered in this
-- phase. The gallery still sorts by piece_number.

alter table public.pieces
  add column if not exists height_mm     numeric(6,1) null,
  add column if not exists base_width_mm numeric(6,1) null,
  add column if not exists weight_g      numeric(7,1) null,
  add column if not exists material      text null,
  add column if not exists scale         text null,
  add column if not exists variant_label text null;
