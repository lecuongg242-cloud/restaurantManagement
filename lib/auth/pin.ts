import "server-only";
import bcrypt from "bcryptjs";

/**
 * Tiện ích PIN (D7). CHỈ chạy phía server — `server-only` chặn import nhầm vào client.
 * PIN 4 số băm bcrypt; so khớp ở server action, KHÔNG bao giờ ở client.
 */

const SALT_ROUNDS = 10;
const PIN_RE = /^\d{4}$/;

export function isValidPin(pin: string): boolean {
  return PIN_RE.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  if (!isValidPin(pin)) throw new Error("PIN phải gồm đúng 4 chữ số.");
  return bcrypt.hash(pin, SALT_ROUNDS);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  if (!isValidPin(pin) || !hash) return false;
  return bcrypt.compare(pin, hash);
}
