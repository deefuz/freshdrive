import { describe, expect, it } from "vitest";
import { appliesToAuchanWww } from "./chrome-cookies";

describe("appliesToAuchanWww", () => {
  it.each([
    ["www.auchan.fr", true],
    [".auchan.fr", true],
    ["compte.auchan.fr", false],
    [".xauchan.fr", false],
  ])("%s → %s", (host, expected) => expect(appliesToAuchanWww(host)).toBe(expected));
});
