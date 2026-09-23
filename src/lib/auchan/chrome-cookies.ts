import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { STATE_PATH } from "./session";

/** Import de la session Auchan depuis le Chrome habituel de l'utilisateur (macOS). */

export const CHROME_DIR = path.join(os.homedir(), "Library/Application Support/Google/Chrome");
const CHROME_EPOCH_OFFSET_S = 11_644_473_600; // 1601-01-01 → 1970-01-01

export interface ChromeCookieRow {
  host_key: string;
  name: string;
  path: string;
  expires_utc: number;
  is_httponly: number;
  is_secure: number;
  encrypted_hex: string;
}

interface StorageStateCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Lax";
}

export interface StorageState {
  cookies: StorageStateCookie[];
  origins: [];
}

export function deriveKey(keychainPassword: string): Buffer {
  return crypto.pbkdf2Sync(keychainPassword, "saltysalt", 1003, 16, "sha1");
}

export function decryptCookieValue(encrypted: Buffer, key: Buffer, hostKey: string, dbVersion: number): string {
  if (encrypted.subarray(0, 3).toString() !== "v10") {
    throw new Error(`Cookie Chrome (${hostKey}) : format de chiffrement inconnu`);
  }
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, " "));
  let plain = Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()]);
  if (dbVersion >= 24) {
    const expected = crypto.createHash("sha256").update(hostKey).digest();
    if (!plain.subarray(0, 32).equals(expected)) {
      throw new Error(`Cookie Chrome (${hostKey}) : empreinte de domaine inattendue`);
    }
    plain = plain.subarray(32);
  }
  return plain.toString("utf8");
}

export function chromeTimeToUnix(expiresUtc: number): number {
  return expiresUtc === 0 ? -1 : Math.floor(expiresUtc / 1_000_000 - CHROME_EPOCH_OFFSET_S);
}

/** Cookies que le navigateur enverrait à https://www.auchan.fr */
export function appliesToAuchanWww(hostKey: string): boolean {
  return hostKey === "www.auchan.fr" || hostKey === ".auchan.fr";
}

export function toStorageState(rows: ChromeCookieRow[], key: Buffer, dbVersion: number): StorageState {
  return {
    cookies: rows
      .filter((r) => appliesToAuchanWww(r.host_key))
      .map((r) => ({
        name: r.name,
        value: decryptCookieValue(Buffer.from(r.encrypted_hex, "hex"), key, r.host_key, dbVersion),
        domain: r.host_key,
        path: r.path,
        expires: chromeTimeToUnix(r.expires_utc),
        httpOnly: r.is_httponly === 1,
        secure: r.is_secure === 1,
        sameSite: "Lax",
      })),
    origins: [],
  };
}

// --- Accès système (disque, sqlite3, trousseau) ---

function sqliteJson<T>(dbPath: string, sql: string): T[] {
  const out = execFileSync("sqlite3", ["-json", dbPath, sql], { encoding: "utf8" }).trim();
  return out ? (JSON.parse(out) as T[]) : [];
}

/** Copie la base (Chrome la verrouille) puis lit les cookies auchan.fr. */
function readProfile(profileDir: string): { rows: ChromeCookieRow[]; dbVersion: number } {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "freshdrive-cookies-"));
  try {
    const db = path.join(tmp, "Cookies");
    fs.copyFileSync(path.join(profileDir, "Cookies"), db);
    for (const suffix of ["-journal", "-wal"]) {
      const side = path.join(profileDir, `Cookies${suffix}`);
      if (fs.existsSync(side)) fs.copyFileSync(side, `${db}${suffix}`);
    }
    const [{ value }] = sqliteJson<{ value: string }>(db, "select value from meta where key = 'version'");
    const rows = sqliteJson<ChromeCookieRow>(
      db,
      "select host_key, name, path, expires_utc, is_httponly, is_secure, hex(encrypted_value) as encrypted_hex " +
        "from cookies where host_key = 'www.auchan.fr' or host_key = '.auchan.fr'",
    );
    return { rows, dbVersion: Number(value) };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Profil Chrome qui contient la session Auchan (celui qui a le plus de cookies www.auchan.fr). */
function findProfile(): string {
  if (!fs.existsSync(CHROME_DIR)) throw new Error("Chrome introuvable sur ce Mac.");
  const profiles = fs
    .readdirSync(CHROME_DIR)
    .filter((d) => d === "Default" || d.startsWith("Profile "))
    .map((d) => path.join(CHROME_DIR, d))
    .filter((d) => fs.existsSync(path.join(d, "Cookies")));
  const scored = profiles
    .map((dir) => ({ dir, count: readProfile(dir).rows.length }))
    .sort((a, b) => b.count - a.count);
  if (!scored.length || scored[0].count === 0) {
    throw new Error("Aucune session Auchan trouvée dans Chrome : connecte-toi sur auchan.fr dans Chrome puis relance.");
  }
  return scored[0].dir;
}

function keychainPassword(): string {
  try {
    return execFileSync("security", ["find-generic-password", "-w", "-s", "Chrome Safe Storage"], {
      encoding: "utf8",
    }).trim();
  } catch {
    throw new Error("Accès au trousseau refusé : autorise « Chrome Safe Storage » (Toujours autoriser) puis relance.");
  }
}

/** Écrit la session Auchan de Chrome dans data/auchan-state.json. */
export function importChromeSession(statePath: string = STATE_PATH): { profile: string; cookies: number } {
  const profile = findProfile();
  const { rows, dbVersion } = readProfile(profile);
  const state = toStorageState(rows, deriveKey(keychainPassword()), dbVersion);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
  return { profile: path.basename(profile), cookies: state.cookies.length };
}
