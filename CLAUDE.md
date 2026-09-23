@AGENTS.md

# MyFresh : recettes générées dans Claude Code (sans clé API)

Déroulé d'une semaine sans clé API :
1. L'utilisateur lance `npm run week -- --prepare`, ce qui écrit `data/requests/<date>.md`.
2. Quand il demande « génère les recettes de data/requests/<date>.md » :
   - lire ce fichier en entier et suivre ses consignes (rôle, contexte Auchan, contraintes, nombre de recettes) ;
   - écrire `data/recipes/<date>.json` au format `{ "recipes": [...] }`, conforme au schéma JSON du fichier. Ce schéma est vérifié par `parseRecipesFile` (`src/lib/recipes/handoff.ts`) ;
   - chaque ingrédient a un `searchQuery` court (1 à 3 mots, générique, comme dans le moteur de recherche Auchan). Les quantités sont des totaux pour la recette, en `g`, `ml` ou `pce`. Mettre `pantryStaple: true` pour les basiques de placard ;
   - les identifiants de recette sont uniques, en kebab-case.
3. L'utilisateur lance ensuite `npm run week -- --from-recipes data/recipes/<date>.json` (ajouter `--push` pour remplir le panier).

Si le panier dépasse le budget, l'utilisateur demandera des recettes moins chères : réécrire le même fichier JSON.
