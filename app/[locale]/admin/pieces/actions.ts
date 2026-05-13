"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AdminGuardError,
  requireAdmin,
} from "@/lib/auth/admin-guard";
import {
  createPiece,
  deletePiece,
  getPieceById,
  updatePiece,
  PieceServerError,
} from "@/lib/server/pieces";
import { isLocale, type Locale } from "@/i18n/routing";
import type { DeleteActionState } from "./state";

export interface ActionState {
  ok: boolean;
  error?: string;
  message?: string;
  fields?: Record<string, string[]>;
}

function readPieceFields(formData: FormData) {
  const photosRaw = formData.get("photos");
  let photos: string[] = [];
  if (typeof photosRaw === "string" && photosRaw.length > 0) {
    try {
      const parsed = JSON.parse(photosRaw);
      if (Array.isArray(parsed)) {
        photos = parsed.filter((v): v is string => typeof v === "string");
      }
    } catch {
      photos = [];
    }
  }

  const get = (key: string) => {
    const v = formData.get(key);
    return typeof v === "string" ? v : null;
  };

  // Checkbox marker: the form always submits `show_in_gallery_present=1`
  // so we can tell "the user unchecked the box" from "the field is
  // absent entirely". When the marker is present, the box state is the
  // canonical value; otherwise (legacy callers / partial patches) leave
  // it undefined so the zod default applies.
  const rawShow = get("show_in_gallery");
  const presentMarker = get("show_in_gallery_present");
  const show_in_gallery =
    presentMarker === "1" ? rawShow === "on" || rawShow === "true" : undefined;

  return {
    nfc_uid: get("nfc_uid") ?? "",
    piece_number: get("piece_number") ?? "",
    edition_number: get("edition_number") ?? "",
    edition_total: get("edition_total") ?? "",
    character_name: get("character_name") ?? "",
    character_quote: get("character_quote") ?? "",
    license_status: get("license_status") ?? "original",
    license_notes: get("license_notes") ?? "",
    sculpt_date: get("sculpt_date") ?? "",
    paint_date: get("paint_date") ?? "",
    photos,
    status: get("status") ?? "draft",
    ...(show_in_gallery === undefined ? {} : { show_in_gallery }),
  };
}

function safeLocale(formData: FormData): Locale {
  const raw = formData.get("locale");
  return typeof raw === "string" && isLocale(raw) ? raw : "en";
}

export async function createPieceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = safeLocale(formData);
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AdminGuardError) {
      return {
        ok: false,
        error: e.reason,
        message:
          e.reason === "unauthenticated"
            ? "Sign in required"
            : "Admin access required",
      };
    }
    throw e;
  }

  let pieceId: string;
  try {
    const piece = await createPiece(readPieceFields(formData));
    pieceId = piece.id;
  } catch (e) {
    if (e instanceof PieceServerError) {
      return {
        ok: false,
        error: e.code,
        message: e.message,
        fields: e.fields,
      };
    }
    throw e;
  }

  revalidatePath(`/${locale}/admin/pieces`);
  redirect(`/${locale}/admin/pieces/${pieceId}/edit?created=1`);
}

/**
 * Hard-delete server action. Confirmed via the client-side typed
 * piece-number modal; the server still re-validates the typed value
 * against the row's piece_number so a forged FormData submission can't
 * delete the wrong row.
 *
 * On success, redirects to the list page with ?deleted=NNNN so the
 * banner can fire — useActionState only sees the redirect throw and
 * never resolves.
 */
export async function deletePieceAction(
  pieceId: string,
  _prev: DeleteActionState,
  formData: FormData,
): Promise<DeleteActionState> {
  const locale = safeLocale(formData);

  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AdminGuardError) {
      return {
        ok: false,
        error: e.reason,
        message:
          e.reason === "unauthenticated"
            ? "Sign in required"
            : "Admin access required",
      };
    }
    throw e;
  }

  // The form must echo back the piece_number the user typed so the
  // server can independently confirm intent. A naive caller posting
  // FormData with no confirmation field cannot delete.
  const typedRaw = formData.get("confirm_piece_number");
  const typed =
    typeof typedRaw === "string" ? typedRaw.trim().replace(/^0+/, "") : "";
  if (typed === "") {
    return {
      ok: false,
      error: "confirmation_required",
      message: "Type the piece number to confirm.",
    };
  }

  let result: { deleted_piece_number: number };
  try {
    // Read the piece first so the server can check the typed number
    // matches what's actually stored. Forgive leading zeros either
    // side ("1" matches piece_number=1; "0001" also matches).
    result = await deletePieceConfirmed(pieceId, typed);
  } catch (e) {
    if (e instanceof PieceServerError) {
      return {
        ok: false,
        error: e.code,
        message: e.message,
      };
    }
    throw e;
  }

  revalidatePath(`/${locale}/admin/pieces`);
  redirect(
    `/${locale}/admin/pieces?deleted=${result.deleted_piece_number}`,
  );
}

async function deletePieceConfirmed(
  pieceId: string,
  typedPieceNumber: string,
): Promise<{ deleted_piece_number: number }> {
  // Re-read the piece via deletePiece, which already 404s if missing.
  // We need the piece_number BEFORE deletion to compare; cheapest
  // approach is to use getPieceById once here.
  const piece = await getPieceById(pieceId);
  if (!piece) {
    throw new PieceServerError(404, "not_found", "Piece not found");
  }
  if (String(piece.piece_number) !== typedPieceNumber) {
    throw new PieceServerError(
      400,
      "confirmation_mismatch",
      "Typed piece number does not match.",
    );
  }
  return deletePiece(pieceId);
}

export async function updatePieceAction(
  pieceId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locale = safeLocale(formData);
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AdminGuardError) {
      return {
        ok: false,
        error: e.reason,
        message:
          e.reason === "unauthenticated"
            ? "Sign in required"
            : "Admin access required",
      };
    }
    throw e;
  }

  try {
    await updatePiece(pieceId, readPieceFields(formData));
  } catch (e) {
    if (e instanceof PieceServerError) {
      return {
        ok: false,
        error: e.code,
        message: e.message,
        fields: e.fields,
      };
    }
    throw e;
  }

  revalidatePath(`/${locale}/admin/pieces`);
  revalidatePath(`/${locale}/admin/pieces/${pieceId}/edit`);
  return { ok: true, message: "Saved" };
}
