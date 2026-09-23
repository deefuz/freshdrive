@AGENTS.md

# MyFresh : recettes générées dans Claude Code (sans clé API)

Déroulé d'une semaine sans clé API :
1. L'utilisateur lance `npm run week -- --prepare`, ce qui écrit `data/requests/<date>.md`. La session Auchan est reprise automatiquement du Chrome habituel (cookies auchan.fr) ; si Auchan ne voit aucun drive, il faut se connecter sur auchan.fr dans Chrome.
2. Quand il demande « génère les recettes de data/requests/<date>.md » :
   - lire ce fichier en entier et suivre ses consignes (rôle, contexte Auchan, contraintes, nombre de recettes) ;
   - écrire `data/recipes/<date>.json` au format `{ "recipes": [...] }`, conforme au schéma JSON du fichier. Ce schéma est vérifié par `parseRecipesFile` (`src/lib/recipes/handoff.ts`) ;
   - chaque ingrédient a un `searchQuery` court (1 à 3 mots, générique, comme dans le moteur de recherche Auchan). Les quantités sont des totaux pour la recette, en `g`, `ml` ou `pce`. Mettre `pantryStaple: true` pour les basiques de placard ;
   - les identifiants de recette sont uniques, en kebab-case.
3. L'utilisateur lance ensuite `npm run week -- --from-recipes data/recipes/<date>.json` (ajouter `--push` pour remplir le panier). Le choix des produits est vérifié par un appel groupé à `claude -p` (sauter avec `--no-arbiter`). La semaine est enregistrée dans `data/weeks/<id>.json` et visible dans l'app (`npm run dev`, puis http://127.0.0.1:3141).

Si le panier dépasse le budget, l'utilisateur demandera des recettes moins chères : réécrire le même fichier JSON.

Le CLI et l'app web sont deux processus séparés : ils ne partagent ni la garde-fou « une tâche à la fois » ni la porte des 350 ms vers auchan.fr. Ne lance pas le CLI et l'app web en même temps sur la même semaine.

Impression : `/semaines/<id>/imprimer` (fiches recettes et liste de courses), puis « Télécharger le PDF ». Le PDF est rendu par le Chromium de Playwright (`npx playwright install chromium` s'il manque), qui charge la page sur http://127.0.0.1:3141 : l'app doit tourner sur ce port.
