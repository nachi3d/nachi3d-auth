export type LicenseStatus =
  | "original"
  | "public_domain"
  | "commission"
  | "licensed"
  | "other";

export type PieceStatus = "draft" | "published" | "archived";

export type ProvenanceEventType =
  | "created"
  | "claimed"
  | "transferred"
  | "note";

export type PieceRow = {
  id: string;
  piece_number: number;
  edition_number: number | null;
  edition_total: number | null;
  nfc_uid: string;
  verification_token: string;
  character_name: string;
  character_quote: string | null;
  license_status: LicenseStatus;
  license_notes: string | null;
  sculpt_date: string;
  paint_date: string;
  photos: string[];
  current_owner_id: string | null;
  status: PieceStatus;
  show_in_gallery: boolean;
  is_fixture: boolean;
  height_mm: number | null;
  base_width_mm: number | null;
  weight_g: number | null;
  material: string | null;
  scale: string | null;
  variant_label: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileRow = {
  id: string;
  display_name: string | null;
  country: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
};

export type ProvenanceEventRow = {
  id: string;
  piece_id: string;
  event_type: ProvenanceEventType;
  from_owner_id: string | null;
  to_owner_id: string | null;
  notes: string | null;
  occurred_at: string;
};

export type VerificationLogRow = {
  id: string;
  piece_id: string;
  ip_country: string | null;
  ip_region: string | null;
  user_agent: string | null;
  is_owner: boolean;
  occurred_at: string;
};

export type ClaimRow = {
  id: string;
  piece_id: string;
  email: string;
  display_name: string | null;
  country: string | null;
  token: string;
  expires_at: string;
  consumed_at: string | null;
  is_fixture: boolean;
  created_at: string;
};

export type TransferStatus = "pending" | "accepted" | "revoked" | "expired";

export type TransferRow = {
  id: string;
  piece_id: string;
  from_owner_id: string;
  to_email: string;
  to_owner_id: string | null;
  token: string;
  status: TransferStatus;
  expires_at: string;
  note: string | null;
  is_fixture: boolean;
  created_at: string;
  accepted_at: string | null;
};

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & { id: string };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      pieces: {
        Row: PieceRow;
        Insert: Omit<
          PieceRow,
          "id" | "is_fixture" | "created_at" | "updated_at"
        > & {
          id?: string;
          // is_fixture is set ONLY by the service-role seed script.
          // Defaults false in the database; admin code paths never pass it.
          is_fixture?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<PieceRow>;
        Relationships: [];
      };
      provenance_events: {
        Row: ProvenanceEventRow;
        Insert: Omit<ProvenanceEventRow, "id" | "occurred_at"> & {
          id?: string;
          occurred_at?: string;
        };
        Update: Partial<ProvenanceEventRow>;
        Relationships: [];
      };
      verification_logs: {
        Row: VerificationLogRow;
        Insert: Omit<VerificationLogRow, "id" | "occurred_at"> & {
          id?: string;
          occurred_at?: string;
        };
        Update: Partial<VerificationLogRow>;
        Relationships: [];
      };
      claims: {
        Row: ClaimRow;
        Insert: Omit<ClaimRow, "id" | "is_fixture" | "created_at" | "consumed_at"> & {
          id?: string;
          consumed_at?: string | null;
          // is_fixture is set ONLY by the seed/test code; admin and
          // public APIs strip it before reaching the database.
          is_fixture?: boolean;
          created_at?: string;
        };
        Update: Partial<ClaimRow>;
        Relationships: [];
      };
      transfers: {
        Row: TransferRow;
        Insert: Omit<
          TransferRow,
          "id" | "status" | "is_fixture" | "created_at" | "accepted_at" | "to_owner_id"
        > & {
          id?: string;
          status?: TransferStatus;
          to_owner_id?: string | null;
          accepted_at?: string | null;
          is_fixture?: boolean;
          created_at?: string;
        };
        Update: Partial<TransferRow>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      claim_piece: {
        Args: {
          p_token: string;
          p_user_id: string;
          p_display_name: string;
          p_country: string;
        };
        Returns:
          | { ok: true; piece_id: string }
          | {
              ok: false;
              error:
                | "invalid_token"
                | "already_consumed"
                | "expired"
                | "piece_not_found"
                | "already_claimed";
            };
      };
      accept_transfer: {
        Args: {
          p_token: string;
          p_user_id: string;
        };
        Returns:
          | { ok: true; piece_id: string }
          | {
              ok: false;
              error:
                | "invalid_token"
                | "accepted"
                | "revoked"
                | "expired"
                | "email_mismatch"
                | "piece_not_found"
                | "ownership_changed"
                | "invalid_user";
            };
      };
      expire_pending_transfers_and_claims: {
        Args: Record<string, never>;
        Returns: number;
      };
      has_password: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      e2e_clear_user_password: {
        Args: { p_user_id: string };
        Returns: void;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
