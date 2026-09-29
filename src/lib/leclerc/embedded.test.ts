import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeEntities, findWidget, isLoggedIn } from "./embedded";

const fixture = (name: string) => fs.readFileSync(`tests/fixtures/leclerc/${name}`, "utf8");

describe("findWidget", () => {
  it("lit les options JSON d'un widget d'après la fin de son identifiant", () => {
    const w = findWidget<{ objProduit: { sCodeEAN: string } }>(fixture("product.html"), /pnlFicheProduit$/);
    expect(w?.objProduit.sCodeEAN).toBe("3564700005644");
  });

  it("ignore les accolades et guillemets échappés dans les chaînes", () => {
    const html = `<script>Utilitaires.widget.initOptions('a_pnlX',{"s":"} { \\" }","n":{"v":1}});</script>`;
    expect(findWidget(html, /pnlX$/)).toEqual({ s: '} { " }', n: { v: 1 } });
  });

  it("null si le widget est absent ou tronqué", () => {
    expect(findWidget(fixture("product.html"), /pnlInexistant$/)).toBeNull();
    expect(findWidget(`Utilitaires.widget.initOptions('a_pnlX',{"s":1`, /pnlX$/)).toBeNull();
  });
});

describe("decodeEntities", () => {
  it("décode les entités numériques et nommées", () => {
    expect(decodeEntities("Lait demi-&#233;cr&#233;m&#233; &amp; l&#39;&#xE9;t&#233;")).toBe("Lait demi-écrémé & l'été");
  });

  it("laisse les entités inconnues telles quelles", () => {
    expect(decodeEntities("a &foo; b")).toBe("a &foo; b");
  });
});

describe("isLoggedIn", () => {
  it("repère un client connecté", () => {
    expect(isLoggedIn(fixture("home.html"))).toBe(true);
    expect(isLoggedIn(`{"fClientConnecte":false}`)).toBe(false);
  });
});
