import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  appliesToAuchanWww,
  chromeTimeToUnix,
  type ChromeCookieRow,
  decryptCookieValue,
  deriveKey,
  toStorageState,
} from "./chrome-cookies";

const key = deriveKey("mot-de-passe-trousseau");

/** Chiffre comme Chrome macOS : "v10" + AES-128-CBC(IV = 16 espaces), avec l'empreinte du domaine si version ≥ 24. */
function encrypt(value: string, hostKey: string, dbVersion: number): Buffer {
  const plain =
    dbVersion >= 24
      ? Buffer.concat([crypto.createHash("sha256").update(hostKey).digest(), Buffer.from(value)])
      : Buffer.from(value);
  const cipher = crypto.createCipheriv("aes-128-cbc", key, Buffer.alloc(16, " "));
  return Buffer.concat([Buffer.from("v10"), cipher.update(plain), cipher.final()]);
}

describe("decryptCookieValue", () => {
  it("déchiffre une valeur v10 et retire l'empreinte du domaine (version 24)", () => {
    expect(decryptCookieValue(encrypt("abc123", "www.auchan.fr", 24), key, "www.auchan.fr", 24)).toBe("abc123");
  });

  it("déchiffre sans empreinte pour les anciennes versions", () => {
    expect(decryptCookieValue(encrypt("abc123", "www.auchan.fr", 23), key, "www.auchan.fr", 23)).toBe("abc123");
  });

  it("refuse une empreinte qui ne correspond pas au domaine", () => {
    expect(() => decryptCookieValue(encrypt("x", "autre.fr", 24), key, "www.auchan.fr", 24)).toThrow(/empreinte/);
  });

  it("refuse un format inconnu", () => {
    expect(() => decryptCookieValue(Buffer.from("v11xxxxxxxxxxxxxxxx"), key, "www.auchan.fr", 24)).toThrow(/format/);
  });
});

describe("chromeTimeToUnix", () => {
  it("convertit les microsecondes depuis 1601 en secondes Unix", () => {
    expect(chromeTimeToUnix(13_400_000_000_000_000)).toBe(1_755_526_400);
  });
  it("0 = cookie de session", () => expect(chromeTimeToUnix(0)).toBe(-1));
});

describe("appliesToAuchanWww", () => {
  it.each([
    ["www.auchan.fr", true],
    [".auchan.fr", true],
    ["compte.auchan.fr", false],
    [".xauchan.fr", false],
  ])("%s → %s", (host, expected) => expect(appliesToAuchanWww(host)).toBe(expected));
});

describe("toStorageState", () => {
  it("ne garde que les cookies valables pour www.auchan.fr, déchiffrés", () => {
    const row = (host_key: string, name: string, value: string): ChromeCookieRow => ({
      host_key,
      name,
      path: "/",
      expires_utc: 0,
      is_httponly: 1,
      is_secure: 1,
      encrypted_hex: encrypt(value, host_key, 24).toString("hex"),
    });
    const state = toStorageState(
      [row("www.auchan.fr", "connect.sid", "s1"), row(".auchan.fr", "lark-consentId", "c1"), row("compte.auchan.fr", "KEYCLOAK_IDENTITY", "k")],
      key,
      24,
    );
    expect(state.cookies.map((c) => [c.domain, c.name, c.value, c.expires])).toEqual([
      ["www.auchan.fr", "connect.sid", "s1", -1],
      [".auchan.fr", "lark-consentId", "c1", -1],
    ]);
  });
});
