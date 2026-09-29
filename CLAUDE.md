@AGENTS.md

# FreshDrive : recettes générées dans Claude Code (sans clé API)

FreshDrive gère deux Drives : Auchan et Leclerc. Le Drive d'une semaine est `brief.drive` (`"auchan"` ou `"leclerc"`, Auchan si absent : voir `driveOf` dans `src/lib/drives/drive.ts`). Le CLI le prend de `--drive`, sinon de `data/brief.json`.

Déroulé d'une semaine sans clé API :
1. L'utilisateur lance `npm run week -- --prepare` (plus `--drive leclerc` pour Leclerc), ce qui écrit `data/requests/<date>.md`. La session est reprise automatiquement du Chrome habituel (cookies auchan.fr ou leclercdrive.fr) ; si le Drive ne voit aucun magasin, il faut se connecter sur son site dans Chrome et y choisir un drive.
2. Quand il demande « génère les recettes de data/requests/<date>.md » :
   - lire ce fichier en entier et suivre ses consignes (rôle, contexte du Drive, contraintes, nombre de recettes) ;
   - écrire `data/recipes/<date>.json` au format `{ "recipes": [...] }`, conforme au schéma JSON du fichier. Ce schéma est vérifié par `parseRecipesFile` (`src/lib/recipes/handoff.ts`) ;
   - chaque ingrédient a un `searchQuery` court (1 à 3 mots, générique, comme dans le moteur de recherche du Drive). Les quantités sont des totaux pour la recette, en `g`, `ml` ou `pce`. Mettre `pantryStaple: true` pour les basiques de placard ;
   - les identifiants de recette sont uniques, en kebab-case.
3. L'utilisateur lance ensuite `npm run week -- --from-recipes data/recipes/<date>.json` (la commande exacte, avec `--drive` si besoin, est à la fin du fichier de demande ; ajouter `--push` pour remplir le panier). Le choix des produits est vérifié par un appel groupé à `claude -p` (sauter avec `--no-arbiter`). La semaine est enregistrée dans `data/weeks/<id>.json` et visible dans l'app (`npm run dev`, puis http://127.0.0.1:3141).

Si le panier dépasse le budget, l'utilisateur demandera des recettes moins chères : réécrire le même fichier JSON.

Le CLI et l'app web sont deux processus séparés : ils ne partagent ni la garde-fou « une tâche à la fois » ni les portes des 350 ms (une par Drive, `sharedGate` dans `src/lib/drives/gate.ts`). Ne lance pas le CLI et l'app web en même temps sur la même semaine.

Impression : `/semaines/<id>/imprimer` (fiches recettes et liste de courses), puis « Télécharger le PDF ». Le PDF est rendu par le Chromium de Playwright (`npx playwright install chromium` s'il manque), qui charge la page sur http://127.0.0.1:3141 : l'app doit tourner sur ce port.

Visuels des recettes : l'app les dessine automatiquement en arrière-plan quand une semaine est prête (et après un ajout ou une modification de recette), par lots de 3 via le même backend Claude (`drawVisuals`, prompt dans `src/lib/illustrate.ts`, qui lit la section « Illustrations de recettes » de DESIGN.md). Le CLI fait de même après `npm run week` (sauf `--no-visuels`) ; `FRESHDRIVE_VISUELS=non` les désactive dans l'app. Sur demande (« redessine les visuels de la semaine … »), dessiner à la main un SVG par recette dans `data/visuels/<slug-du-titre>.svg` en suivant la même section de DESIGN.md (`visualSlug` dans `src/lib/visuals.ts` donne le nom du fichier) ; un fichier existant n'est jamais redessiné automatiquement.

Leclerc Drive : le site est protégé par DataDome ; des requêtes avec les cookies du Chrome habituel passent, sans jamais contourner de captcha (un captcha = session expirée, l'utilisateur rouvre le site dans Chrome). Les endpoints sont décrits dans `docs/superpowers/specs/2026-09-29-leclerc-spike-findings.md`. `npm run leclerc:smoke` vérifie la session en lecture seule.
