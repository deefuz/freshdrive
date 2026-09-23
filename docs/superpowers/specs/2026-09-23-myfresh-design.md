# « MyFresh » : HelloFresh perso branché sur Auchan Drive

## Contexte
Sébastien veut une version personnelle et améliorée de HelloFresh. Chaque semaine, l'app génère des dîners adaptés à sa famille (kids friendly, peu calorique, vegan, sans produits transformés, budget, précisions libres), en s'appuyant sur ce qu'Auchan Drive propose **à ce moment-là** : promos, mises en avant, saison, événements. Après validation, elle remplit le panier Auchan Drive et produit des fiches PDF imprimables.
Le dossier `/Users/deefuz/Local Sites/PERSO/hellofresh` est vide : c'est un nouveau projet.

## Décisions validées
- **Usage** : personnel/familial, en local sur le Mac. Pas de multi-utilisateurs.
- **Connecteur** : client HTTP (fetch avec les cookies de session, parsing avec cheerio) ; Playwright uniquement pour la connexion et le rafraîchissement des cookies (voir `2026-09-23-auchan-spike-findings.md`). Les identifiants sont stockés dans le trousseau macOS. L'app **remplit le panier sans jamais passer commande** : le paiement se fait sur le site Auchan.
- **Recettes** : générées par Claude chaque semaine à partir du contexte Auchan. Aucune liste fixe.
- **Interface** : web app Next.js locale (localhost, accessible depuis le téléphone via le wifi).
- **Rythme** : un menu par semaine (N dîners × M personnes, dont des enfants), un seul panier.
- **Placard** : au cas par cas. Les ingrédients se décochent au moment de la validation, sans liste enregistrée.
- **Choix des produits** : prix au kilo le plus bas, bio de préférence, Nutri-Score et NOVA (pour le filtre « sans produits transformés »), et moins de gaspillage (un même produit réutilisé dans plusieurs recettes).

## Stack
- Next.js (App Router) + TypeScript, Tailwind
- SQLite + Drizzle : préférences, historique des menus, cache des produits et du contexte hebdo
- Playwright (Chromium, profil persistant) : connexion Auchan et rendu PDF uniquement
- cheerio : parsing du HTML Auchan (balises schema.org des produits)
- SDK Anthropic (`claude-opus-5-5` pour la génération, `claude-haiku-4-5` pour le matching produit), sorties structurées via tool use et schémas Zod
- Open Food Facts API (recherche par EAN) : NOVA et Nutri-Score quand Auchan ne les affiche pas
- PDF : rendu HTML avec CSS print, puis `page.pdf()` de Playwright (on réutilise la dépendance)
- `keytar` (trousseau macOS) pour les identifiants Auchan et la clé API

## Architecture (modules isolés)
```
src/
  auchan/        # connecteur : seule partie qui parle à auchan.fr (client HTTP)
    session.ts   # login Playwright -> cookies, cartId, sellerId, consentId
    catalog.ts   # searchProducts(query) -> Product[] (prix, prix/kg, EAN, bio, nutriscore, promo)
    context.ts   # getWeeklyContext() -> promos, mises en avant, rayons saison
    cart.ts      # addToCart(items) via POST /cart/update (quantité absolue) -> {added, failed, revised}
  context/       # WeeklyContext = contexte Auchan + date/saison + calendrier des événements FR (Chandeleur, Halloween, Noël…)
  recipes/       # generateMenu(prefs, context) et reviseRecipe(recipe, instruction) via Claude, validés par Zod
  matching/      # ingrédient -> produit Auchan : scoring (prix/kg, bio, NOVA/nutriscore, taille du paquet vs quantité, promo, mutualisation)
  budget/        # calcul du coût réel et boucle de rééquilibrage si le budget est dépassé
  pdf/           # templates HTML des fiches recettes + liste de courses, puis PDF
  app/           # pages Next.js
```
Le type `Product` et les interfaces du connecteur sont définis dès le départ. Le reste de l'app ne dépend que de ces interfaces, ce qui permet de tester avec un faux connecteur (fixtures) et de changer d'enseigne plus tard.

## Déroulé d'une semaine
1. **Contexte** : `getWeeklyContext()` récupère les promos et mises en avant du magasin (mis en cache pour la semaine), ajoute la date, les produits de saison et les événements.
2. **Brief** : nombre de dîners, adultes/enfants, budget, filtres (kids friendly, peu calorique, vegan, sans produits transformés…), précisions libres.
3. **Génération** : Claude propose N+2 recettes (pour pouvoir en écarter), qui privilégient les produits en promo et de saison et partagent des ingrédients. Chaque ingrédient est normalisé (nom générique, quantité, unité).
4. **Matching** : recherche Auchan pour chaque ingrédient, puis scoring. Les cas ambigus sont arbitrés par Haiku. On en tire le coût réel. Si le budget est dépassé, Claude remplace ou ajuste les recettes.
5. **Validation** (interface) : choisir les recettes, ajuster les portions, demander des modifications en texte libre (« moins épicé », « sans four »), changer de produit, décocher ce qui est déjà au placard. Total en direct face au budget, avec un badge promo.
6. **Panier** : `addToCart`, puis rapport des produits ajoutés et en échec (avec un lien vers la fiche produit Auchan).
7. **PDF** : une fiche par recette (ingrédients, quantités, produit Auchan correspondant, étapes, temps, estimation nutritionnelle, badges kids/vegan) et une liste de courses récapitulative. Personnalisable : nom de la famille, portions, notes, choix des sections à imprimer.

## Ordre de réalisation
0. ~~Test de faisabilité du connecteur~~ : **fait, concluant** (voir `2026-09-23-auchan-spike-findings.md`).
1. Scaffold, types, faux connecteur, base SQLite
2. Contexte, génération des recettes, écran de brief
3. Matching et budget, écran de validation
4. Vrai connecteur Auchan (recherche, contexte, panier)
5. Export PDF
6. Finitions : historique, pas deux fois le même plat, plats favoris

Après validation de ce plan : écrire la spec dans `docs/superpowers/specs/2026-09-23-myfresh-design.md` (avec `git init`), puis utiliser le skill writing-plans pour le plan d'implémentation détaillé.

## Risques
- Anti-bot ou changements du site Auchan : le connecteur est isolé et on utilise des sélecteurs robustes. En cas de captcha, on bascule en mode « headed » pour que l'utilisateur le résolve.
- CGU : usage strictement personnel, faible volume de requêtes, pas de passage de commande automatique.
- Les valeurs nutritionnelles restent des estimations de Claude (affichées comme telles).

## Vérification
- Tests unitaires (Vitest) : scoring du matching, calcul du budget, validation des schémas de recette (fixtures)
- Tests d'intégration avec le faux connecteur : semaine complète du brief au PDF
- Test manuel réel : générer une semaine de 4 dîners pour 2 adultes et 2 enfants avec un budget de 60 €, vérifier le panier sur auchan.fr, puis imprimer le PDF
