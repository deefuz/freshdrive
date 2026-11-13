import { describe, expect, it, vi } from "vitest";
import { fetchPexelsPhoto, photoQuery } from "./pexels";

describe("photoQuery", () => {
  it("garde les mots utiles du titre", () => {
    expect(photoQuery("Galettes de sarrasin à l'œuf, champignons et épinards")).toBe("galettes sarrasin oeuf champignons");
  });
});

describe("fetchPexelsPhoto", () => {
  const search = { photos: [{ url: "https://pexels.com/photo/1", photographer: "Ada", src: { large: "https://img/1.jpg" } }] };

  it("renvoie null sans clé, sans appeler le réseau", async () => {
    const f = vi.fn();
    expect(await fetchPexelsPhoto("Dahl doux", undefined, f as never)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("télécharge la première photo avec le crédit", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => search })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
    const photo = await fetchPexelsPhoto("Dahl doux", "clé", f as never);
    expect(photo?.photographer).toBe("Ada");
    expect(photo?.bytes.length).toBe(3);
    expect(f.mock.calls[0][1]).toEqual({ headers: { Authorization: "clé" } });
  });

  it("renvoie null si rien ne correspond ou si Pexels échoue", async () => {
    const none = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ photos: [] }) });
    expect(await fetchPexelsPhoto("Dahl doux", "clé", none as never)).toBeNull();
    const boom = vi.fn().mockRejectedValue(new Error("réseau"));
    expect(await fetchPexelsPhoto("Dahl doux", "clé", boom as never)).toBeNull();
  });
});
