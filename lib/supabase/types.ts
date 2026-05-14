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
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
