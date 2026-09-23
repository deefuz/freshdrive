import { describe, expect, it } from "vitest";
import { isAllowedHost } from "./host-guard";

describe("isAllowedHost", () => {
  it("accepte 127.0.0.1:3141 et localhost:3141", () => {
    expect(isAllowedHost("127.0.0.1:3141")).toBe(true);
    expect(isAllowedHost("localhost:3141")).toBe(true);
  });

  it("refuse un autre port, un autre hôte ou l'absence d'en-tête", () => {
    expect(isAllowedHost("127.0.0.1:3000")).toBe(false);
    expect(isAllowedHost("localhost")).toBe(false);
    expect(isAllowedHost("evil.test:3141")).toBe(false);
    expect(isAllowedHost("127.0.0.1:3141.evil.test")).toBe(false);
    expect(isAllowedHost("")).toBe(false);
    expect(isAllowedHost(null)).toBe(false);
  });
});
