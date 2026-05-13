export interface DeleteActionState {
  ok: boolean;
  error?: string;
  message?: string;
}

export const INITIAL_DELETE_STATE: DeleteActionState = { ok: false };
