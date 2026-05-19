import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PieceRow, ProfileRow } from "@/lib/supabase/types";
import {
  profilePatchSchema,
  type ProfilePatchInput,
} from "@/lib/validation/profile";

export class ProfileServerError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ProfileServerError";
  }
}

export async function getProfileById(id: string): Promise<ProfileRow | null> {
  const sb = createAdminClient();
  const { data } = await sb
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

export async function updateProfile(
  userId: string,
  rawPatch: unknown,
): Promise<ProfileRow> {
  const parsed = profilePatchSchema.safeParse(rawPatch);
  if (!parsed.success) {
    throw new ProfileServerError(
      400,
      "validation_error",
      "Invalid profile patch",
      parsed.error.flatten().fieldErrors,
    );
  }
  const patch: ProfilePatchInput = parsed.data;
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("profiles")
    .update({
      display_name: patch.display_name,
      country: patch.country,
    })
    .eq("id", userId)
    .select("*")
    .single();
  if (error) {
    throw new ProfileServerError(500, "db_error", error.message);
  }
  return data as ProfileRow;
}

export async function listOwnedPieces(ownerId: string): Promise<PieceRow[]> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("pieces")
    .select("*")
    .eq("current_owner_id", ownerId)
    .order("piece_number", { ascending: false });
  if (error) {
    throw new ProfileServerError(500, "db_error", error.message);
  }
  return (data ?? []) as PieceRow[];
}
