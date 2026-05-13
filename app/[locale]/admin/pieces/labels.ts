import type { LICENSE_STATUSES } from "@/lib/validation/piece";
import type { PieceFormLabels } from "@/components/admin/PieceForm";

type Translator = (key: string, values?: Record<string, string | number>) => string;

export function buildPieceFormLabels(
  tForm: Translator,
  tLicense: Translator,
  tPhotos: Translator,
  tErrors: Translator,
): PieceFormLabels {
  const licenseOptions = {
    original: tLicense("original"),
    public_domain: tLicense("public_domain"),
    commission: tLicense("commission"),
    licensed: tLicense("licensed"),
    other: tLicense("other"),
  } satisfies Record<(typeof LICENSE_STATUSES)[number], string>;

  return {
    nfc_uid: tForm("nfc_uid"),
    piece_number: tForm("piece_number"),
    edition_number: tForm("edition_number"),
    edition_total: tForm("edition_total"),
    character_name: tForm("character_name"),
    character_quote: tForm("character_quote"),
    license_status: tForm("license_status"),
    license_notes: tForm("license_notes"),
    sculpt_date: tForm("sculpt_date"),
    paint_date: tForm("paint_date"),
    photos: tForm("photos"),
    saveDraft: tForm("saveDraft"),
    publish: tForm("publish"),
    saved: tForm("saved"),
    uidLockedHint: tForm("uidLockedHint"),
    show_in_gallery: tForm("show_in_gallery"),
    showInGalleryHint: tForm("showInGalleryHint"),
    licenseOptions,
    photoLabels: {
      addPhotos: tPhotos("addPhotos"),
      hero: tPhotos("hero"),
      delete: tPhotos("delete"),
      uploading: tPhotos("uploading"),
      dragHint: tPhotos("dragHint"),
      empty: tPhotos("empty"),
      addAfterCreate: tPhotos("addAfterCreate"),
    },
    errors: {
      title: tErrors("title"),
      fallback: tErrors("fallback"),
    },
  };
}
