export type LoginErrorCode = "validation" | "invalid" | "denied";

export interface LoginActionState {
  ok: boolean;
  error?: LoginErrorCode;
}

export const INITIAL_LOGIN_STATE: LoginActionState = { ok: false };
