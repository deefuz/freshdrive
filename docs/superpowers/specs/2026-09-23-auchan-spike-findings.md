# Test de faisabilité Auchan Drive : résultats (2026-09-23)

Test mené dans la session Chrome réelle, connectée à mon magasin Auchan Drive.

## Conclusion
C'est faisable, et plus simplement que prévu : **des requêtes HTTP avec les cookies de session suffisent**. On n'a pas besoin de piloter un navigateur page par page.
Aucun anti-robot observé (ni Datadome ni captcha, que ce soit en navigation ou en `fetch`).
Playwright ne sert plus qu'à la connexion (et à récupérer les cookies) et au rendu PDF.

## Recherche : `GET /recherche?text=<requête>`
- Page HTML rendue côté serveur (pas d'appel JSON en arrière-plan), 30 produits par page.
- Chaque produit est un `article[itemtype="http://schema.org/Product"]` avec :
  - attributs `data-id` (productId), `data-current-offer-id` (offerId), `data-current-seller-type` (GROCERY)
  - itemprops `name`, `brand`, `price`, `priceCurrency`, `availability`, `ratingValue`
  - texte : conditionnement (`250g`, `6x1L`, `environ 3-4 fruits`), prix unitaire (`11,96€ / kg`), origine, badges (`C'est de saison !`, `10% Jour W! cagnottés`, `-60% sur le 2ème`, `Prix Choc`)
- Bio : se repère dans la marque ou le nom (`AUCHAN BIO`…).
- Lien vers la fiche : `a[href*="/pr-"]` (par exemple `/mutti-polpa-pulpe-fine-de-tomates/pr-C1236828`).

## Fiche produit : `GET /<slug>/pr-<code>`
- `EAN : <code interne> / <EAN13>` (absent pour les produits frais vendus au poids ou à la pièce)
- Ingrédients et tableau « Valeurs nutritionnelles » pour 100 g
- **Pas de Nutri-Score ni de NOVA** : on les récupère sur Open Food Facts via l'EAN.

## Contexte de la semaine
- `GET /boutique/promos` : environ 132 produits, pages `?page=N`, et un filtre par rayon via `/boutique/promos/<rayon>/ca-<id>` (par exemple `fruits-legumes/ca-n03`, `boucherie-volaille-poissonnerie/ca-n02`, `epicerie-salee/ca-n06`).
- `GET /boutique/anti-gaspi`
- Badge « C'est de saison ! » sur les produits ; bannières thématiques sur l'accueil (« Asie », « Foire à la bière »…).
- Le HTML contient des marqueurs de streaming `Pipe.start(n)`/`Pipe.end(n)`, à nettoyer lors du parsing.

## Panier
- `GET /cart/config` → `{ getCartEndpoint: "/cart", updateCartEndpoint: "/cart/update", ... }`
- `GET /cart` (Accept: application/json) → `cart.cart.{id, items[{productId, offerId, desiredQuantity, ...}], prices.totalPrice.amount (centimes)}`
- `POST /cart/update`, en-têtes `Content-Type: application/json`, `Accept: application/json`, `X-Requested-With: XMLHttpRequest` :
  ```json
  {
    "cartId": "<cart.cart.id>",
    "items": [{
      "productId": "<data-id>",
      "offerId": "<data-current-offer-id>",
      "sellerType": "GROCERY",
      "desiredQuantity": 1,
      "desiredType": "DEFAULT",
      "sellerId": "<sellerId du magasin, présent dans le DOM et dans GET /cart>"
    }],
    "consentId": "<présent dans les cookies>",
    "reservationId": null,
    "mbaAvailabilityNeeded": true
  }
  ```
- `desiredQuantity` est une **quantité absolue** (0 = retirer), pas un incrément. Vérifié : ajout (1) puis retrait (0), et le panier est revenu à l'identique.
- Réponse 200 : le panier complet mis à jour, plus `revisedItems` (produits dont la quantité a été ajustée par Auchan, à surveiller pour les ruptures).

## Impacts sur la spec
- `auchan/` devient un client HTTP (fetch + cookies + parsing HTML avec cheerio), plus un module `session.ts` basé sur Playwright pour la connexion et le rafraîchissement des cookies.
- Il faut lire le `sellerId` et le `consentId` au démarrage de la session (dans le DOM ou dans `GET /cart`, et dans les cookies).
- `addToCart` doit additionner la quantité déjà présente dans le panier avant d'envoyer la quantité absolue.
- Limiter le débit des requêtes (quelques-unes par seconde au maximum) et mettre en cache les résultats de recherche pour la semaine.
