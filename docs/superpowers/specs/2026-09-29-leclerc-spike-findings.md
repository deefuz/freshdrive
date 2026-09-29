# Test de faisabilité Leclerc Drive : résultats (2026-09-29)

Test mené dans la session Chrome réelle, connectée au Drive **Orvault / Grand Val** (point de livraison `274401`).

## Conclusion
C'est faisable avec la même architecture qu'Auchan : **des requêtes HTTP avec les cookies de Chrome suffisent**.

Le site est protégé par **DataDome** :
- sans cookies, la réponse est `403` avec un captcha (`captcha-delivery`) ;
- avec les cookies du Chrome habituel, y compris le cookie `datadome`, un `fetch` Node passe, en GET comme en POST.

Mesures faites :
- 12 recherches enchaînées à ~400 ms d'intervalle : 12 réponses 200, aucun captcha ;
- un ajout puis un retrait au panier depuis Node : réponses 200, aucun captcha.

À surveiller : si DataDome finit par demander un captcha (réponse 403 avec `captcha-delivery`), il faut la traiter comme une session expirée. Le message à l'utilisateur est alors « ouvre Leclerc Drive dans Chrome puis relance ». On ne contourne jamais le captcha.

## Magasin et cookies
- Il n'y a pas de domaine unique. Chaque magasin vit sur un serveur `fdNN-courses.leclercdrive.fr` (ici `fd16`, le « silo » 016). Le chemin commence par `/magasin-<noPL>-<slug>/`.
- **Le slug est ignoré** : `/magasin-274401-x/recherche.aspx` fonctionne. En revanche, `/magasin-274401/recherche.aspx` (sans slug) renvoie une erreur 302.
- **Identifiant du magasin** : `GET https://www.leclercdrive.fr/` renvoie `302 Location: https://www.leclercdrive.fr/?mag=274401-274401&…`. Le premier nombre est le point de livraison.
- **Bon serveur** : `GET https://fd1-courses.leclercdrive.fr/magasin-<noPL>-<noPL>.aspx` renvoie `302` vers `https://fd16-courses.leclercdrive.fr/magasin-274401-Orvault-Grand-Val/home.aspx`, quel que soit le `fdN` de départ.
- **Cookies à envoyer** : hôtes `.leclercdrive.fr`, `leclercdrive.fr` et `fdNN-courses.leclercdrive.fr`, tous dans le même profil Chrome. Les plus importants sont `datadome`, `.XPRSDRVAUTH` (authentification), `ASP.NET_SessionId`, les cookies `TS01…` (F5) et `clsWCCD125:@<noPL>`.
- **Connecté ?** Toutes les pages du magasin contiennent `"fClientConnecte":true` quand la session est ouverte.

## Format des pages : JSON embarqué
Les pages sont rendues côté serveur. Les données sont dans des appels
`Utilitaires.widget.initOptions('<idWidget>', { …JSON… });` placés dans un `<script>`.
Pour les lire, on repère l'appel, on extrait l'objet JSON en comptant les accolades, puis on applique `JSON.parse`. On n'a pas besoin de cheerio.

Dans les chaînes de texte, les libellés contiennent des entités HTML (`&#233;`, `&#39;`) : il faut les décoder.

## Recherche : `GET /magasin-<noPL>-x/recherche.aspx?TexteRecherche=<requête>`
- Environ 100 produits par page, sans pagination utile. Une page pèse de 0,3 à 1 Mo.
- Le widget `…_pnlElementProduit` contient `objContenu.lstElements[].objElement`.

Champs utiles d'un produit :

| Champ Leclerc | Usage FreshDrive |
|---|---|
| `iIdProduit` | `productId` |
| `sNoPointLivraison` | `sellerId` (identique pour tout le Drive) |
| `sLibelleLigne1` | nom |
| `sLibelleLigne2` | « marque - format » (`Candia+ - 6x1L`, `Bouteille - 6x1L`, `Sachet de 2kg`) : la marque est le texte avant ` - `, quand il y en a un |
| `nrPVUnitaireTTC` | prix |
| `sPrixPromo` | prix promo (`"0,00 €"` s'il n'y en a pas) |
| `nrPVParUniteDeMesureTTC` et `sUniteMesureTotale` (`kg`, `l`, `pce`…) | prix unitaire |
| `nrContenanceTotale`, `nrContenanceUnitaire` et `sUniteMesure` (`GR`, `KG`, `L`, `CL`, `ML`, `P`) | contenance |
| `iQteDisponible` et `eDisponibilite` (0 = disponible, 1 = indisponible) | stock |
| `sTexteLogoBRII` | promo immédiate (`kind: "price"`) |
| `sTexteLogoTel` | Ticket E.Leclerc (`kind: "loyalty"`) |
| `fEstAntiGaspi` | anti-gaspi |
| `sUrlPageProduit` | fiche (URL absolue) |
| `iQuantitePanier` | quantité déjà dans le panier |

- **Bio** : il n'y a pas de champ dédié. Il se repère dans le nom (« Bio »).

## Fiche produit : `GET /magasin-<noPL>-x/fiche-produits-<iIdProduit>-x.aspx`
- Widget `…_pnlFicheProduit`, objet `objProduit` :
  - `sCodeEAN` : EAN13, qui sert pour Open Food Facts et le contrôle NOVA ;
  - `sComposition` : ingrédients.
- Attention : `objProduit.lstOperationTrade[].lstProduits[]` contient **d'autres** produits avec leur propre `sCodeEAN`. Il faut lire `objProduit.sCodeEAN` directement.

## Contexte de la semaine
- **Promos** : `GET /magasin-<noPL>-x/promotions.aspx`.
  - Environ 570 produits en une seule page de 8 Mo. À garder dans le cache de 24 h.
  - Widget `…_pnlElementProduitsPromos`, avec la liste des produits dans `objContenu.objFiltres.lstProduits[]`.
  - Ces produits sont en format léger : `iIdProduit`, `sLibelleLigne1`, `sLibelleLigne2`, `nrPVUnitaireTTC`, `sCodeEAN`, `iIdRayon`, `objBrii.sLibelle1` et `objTel.sLibelle1`.
  - `objFiltres.lstFiltreValeurs[]` avec `iIdBloc === 4` donne les rayons, sous la forme `{iIdValeur, sLibelle}`. Il faut filtrer sur les libellés alimentaires : Laitier, Epicerie, Fruits Légumes, Viandes Poissons, Charcuterie Traiteur, Surgelés, Saveurs du monde.
- **Formats de promo observés** :
  - immédiates (`objBrii`, ou `sTexteLogoBRII` dans la recherche) :
    - `Avantage immédiat de 34%` ;
    - `Le 2ème est à -60% (le moins cher des 2), profitez-en !` ;
    - `Le 2ème article à -40% (…)` ;
    - `Le 3ème est offert (le moins cher des 3), profitez-en !` ;
  - fidélité (`objTel`, ou `sTexteLogoTel` dans la recherche) :
    - `Recevez 30% en Ticket E.Leclerc. Offre réservée aux porteurs de la Carte E.Leclerc.` ;
    - `Le 2ème à -50% en ticket E.LECLERC (le moins cher des 2). …` ;
    - `Recevez 80% en Ticket E.Leclerc dès 2 produits achetés (…)` ;
    - `Recevez 0.40 € en Ticket E.Leclerc. …`.
- **Thèmes** : les liens `/magasin-<noPL>-<slug>/offres-<id>-<Nom>.aspx` de `home.aspx` (« Chocolats », « Déjeuner Bio Village Bébé », « Le Grand Jeu »…).
- **Anti-gaspi** : ni rayon ni page dédiés pour ce magasin. Un produit anti-gaspi porte `fEstAntiGaspi: true` (aucun ce jour-là). Le contexte reprendra les produits flaggés parmi les promos. La liste sera souvent vide.

## Panier
- **Lecture** : `GET /magasin-<noPL>-x/detail-panier.aspx`.
  - Le widget `…_ucDetailPanier_pnlDetailPanier` contient `objContenu.lstElements[]`, un arbre rayon → famille → … → `lstEnfants[].objElement`.
  - Les feuilles ont la même forme qu'un produit de recherche, plus `iQuantitePanier` et `rTotalAPayer`.
  - Le total du panier est dans l'événement panier (voir plus bas) ou dans le widget `…_ucResumePanier_pnlResumePanier`.
- **Écriture** : `POST /magasin-<noPL>/panier.aspx?op=1`.
  - En-têtes : `Content-Type: application/x-www-form-urlencoded; charset=UTF-8` et `X-Requested-With: XMLHttpRequest`.
  - Corps :
    ```
    d={"eTypeAction":1,"iIdProduit":"2613","iQuantite":2,"sNoPointLivraison":"274401"}
    ```
  - `iQuantite` est une **quantité absolue** (0 pour retirer). `eTypeAction` vaut 1 pour augmenter et 2 pour diminuer.
  - Il n'y a **pas de jeton anti-CSRF**. Le navigateur envoie aussi `objContexteProvenanceArticle` (suivi de provenance), qui n'est pas nécessaire.
  - Vérifié : ajout (1), passage à 2, puis retrait (0), dans Chrome puis depuis Node. Le panier est revenu vide.
- **Réponse** : un tableau d'événements `{eTypeEvenement, sIdUnique, objElement}` :
  - `103` ou `101` : le produit, avec `iQuantitePanier` ;
  - `503` ou `501` : le rayon ;
  - `1` : le panier, avec `iQuantitePanier` (nombre d'articles), `fEstVide`, `sTotalAPayer`, `rMontantTEL` et `lstProduitsLight[{iIdProduit, iQtePanier, iQteDisponible, fQuantiteMax, rTotalAPayer}]`.
  - Si le Drive plafonne la quantité, `iQtePanier` est inférieur à la demande et `fQuantiteMax` vaut `true`.

## Impacts sur le plan
- `LeclercConnector` fait un GET par recherche (JSON embarqué), un GET pour la fiche, un GET `detail-panier.aspx` pour `getCart`, et un POST `panier.aspx?op=1` par ligne pour `setCartQuantities`.
- Correspondance des champs :
  - `sellerId` reçoit `sNoPointLivraison`, ce qui satisfait le filtre `match.ts:31` ;
  - `offerId` reçoit `iIdProduit` ;
  - `sellerType` reçoit `"DRIVE"`.
- `openLeclerc` :
  1. importe les cookies Chrome (`*.leclercdrive.fr`) ;
  2. résout le point de livraison (`www` → `?mag=`) ;
  3. résout le serveur `fdNN` (redirection `fd1-courses`) ;
  4. mémorise `{noPL, baseUrl}` dans `data/leclerc-state.json` ;
  5. vérifie `fClientConnecte` et une recherche « lait » non vide.
- Session expirée : 401, 403, `captcha-delivery`, redirection vers `www.leclercdrive.fr` ou `fClientConnecte:false`.
- Le cache de contexte est indispensable : la page promos pèse 8 Mo.

## Fixtures
`tests/fixtures/leclerc/` contient des extraits réduits et anonymisés des vraies pages, au même format `initOptions` :

| Fichier | Contenu |
|---|---|
| `search.html` | 5 produits : standard, promo immédiate, indisponible, vrac au kg, conserve |
| `promotions.html` | 4 formats de promo alimentaire, 1 produit non alimentaire, les rayons |
| `home.html` | liens de thèmes |
| `product.html` | EAN et composition |
| `cart.html` | détail du panier avec 1 article |
| `cart-update.json` | réponse de `panier.aspx?op=1` |
