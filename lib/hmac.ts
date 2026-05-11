import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_HEX_LENGTH = 24;

function getSecret(): string {
  const secret = process.env.HMAC_SECRET;
  if (!secret) {
    throw new Error("HMAC_SECRET environment variable is not set");
  }
  return secret;
}

function payload(nfcUid: string, pieceId: string): string {
  return `${nfcUid}:${pieceId}`;
}

export function signToken(nfcUid: string, pieceId: string): string {
  return createHmac("sha256", getSecret())
    .update(payload(nfcUid, pieceId))
    .digest("hex")
    .slice(0, TOKEN_HEX_LENGTH);
}

export function verifyToken(
  nfcUid: string,
  pieceId: string,
  candidate: string,
): boolean {
  if (
    typeof candidate !== "string" ||
    candidate.length !== TOKEN_HEX_LENGTH ||
    !/^[0-9a-f]+$/i.test(candidate)
  ) {
    return false;
  }

  const expected = signToken(nfcUid, pieceId);
  const candidateNormalized = candidate.toLowerCase();

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(candidateNormalized, "hex");
  if (a.length !== b.length || a.length === 0) {
    return false;
  }

  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const TOKEN_LENGTH = TOKEN_HEX_LENGTH;
