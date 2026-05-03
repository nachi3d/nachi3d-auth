"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AdminGuardError,
  requireAdmin,
} from "@/lib/auth/admin-guard";
import {
  createPiece,
  updatePiece,
  PieceServerError,
} from "@/lib/server/pieces";
import { isLocale, type Locale } from "@/i18n/routing";

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
