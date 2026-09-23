# MyFresh : conception des plans 2 (app web) et 3 (PDF et finitions)

Complète `2026-09-23-myfresh-design.md`. Validée par l'utilisateur le 2026-09-23.

## Décisions
- **Accès** : l'app n'est accessible que depuis le Mac. Le serveur Next.js écoute sur `127.0.0.1` uniquement, sans authentification.
- **Session Auchan** : reprise automatiquement des cookies auchan.fr du Chrome habituel (`importChromeSession`), à chaque démarrage de tâche Auchan. La connexion via Chromium (`auchan:login`) reste disponible en secours.
- **Accès à Claude, derrière une interface unique `LlmBackend`** (`generateMenu`, `reviseMenu`, `reviseRecipe`, `arbitrate`) :
  - par défaut, **Claude Code en mode non interactif**, sur l'abonnement de l'utilisateur : `claude -p <prompt> --output-format json --json-schema <schéma> --model claude-opus-5-5 --tools ""`. On lit l'événement `type: "result"` et son champ `structured_output`, puis on valide avec Zod. Si `is_error` vaut true ou si la sortie n'est pas conforme, on lève une `LlmError` ;
  - si `ANTHROPIC_API_KEY` est défini, on passe par l'API (le code du plan 1).
  - Le CLI `npm run week` utilise la même interface, le mode `--prepare`/`--from-recipes` reste disponible.
- **Tâches longues** (contexte Auchan, recettes, choix des produits, envoi au panier) : exécutées dans le processus serveur. L'état de chaque tâche (étape, progression, erreur) est conservé en mémoire et dans le fichier de la semaine. L'interface interroge l'état toutes les 2 s. Une seule tâche à la fois.
- **Stockage** : un fichier JSON par semaine, `data/weeks/<id>.json`, où `id` est la date suivie d'un suffixe. Il est lu et écrit par un module unique (`src/lib/store/weeks.ts`). Les favoris sont dans `data/favorites.json`. Pas de SQLite (YAGNI, un seul utilisateur).
- **Semaine (modèle)** : `brief`, résumé du contexte, `recipes` (N+2), `selectedRecipeIds`, `matches` (produit choisi et autres choix possibles par ingrédient), `overrides` (produit choisi par l'utilisateur, ingrédients décochés), `status` (`draft` | `generating` | `ready` | `pushed`), `pushReport`.
- **Écrans** (App Router, composants serveur + server actions, Tailwind, en français) :
  1. `/` : accueil. État de la session Auchan, contexte de la semaine, « Nouvelle semaine », historique.
  2. `/semaines/nouvelle` : brief, pré-rempli avec le dernier.
  3. `/semaines/[id]` : progression si la génération est en cours, écran de validation sinon :
     - cartes des N+2 recettes, à cocher, dans la limite de N ;
     - détail d'une recette (ingrédients, étapes, étapes enfants mises en évidence, nutrition estimée) ;
     - « Modifier cette recette » avec une consigne en texte libre, qui relance la recherche des produits de cette recette uniquement ;
     - liste des produits : produit choisi, sélecteur parmi les autres choix possibles, case « déjà au placard » ;
     - total en direct face au budget, économies sur les promos.
  4. `/semaines/[id]/panier` : récapitulatif des lignes (quantités cumulées avec le panier actuel), bouton de confirmation, puis rapport ajoutés / ajustés / échecs et lien vers auchan.fr.
- **Plan 3** :
  - `/semaines/[id]/imprimer` : page HTML d'impression (CSS print). Une fiche par recette retenue, plus la liste de courses. Options : nom de la famille, sections, notes.
  - Export PDF par une route qui rend cette page avec Playwright (`page.pdf()`, format A4).
  - Favoris : une étoile sur une recette. On peut réutiliser un favori dans une nouvelle semaine.
  - Pas de répétition : les titres des recettes retenues sur les 4 dernières semaines sont transmis au prompt (« à éviter »).
  - Thèmes de la semaine : corriger `parseThemes` à partir de la page d'accueil réelle. Aujourd'hui il ne trouve rien ; capturer une fixture réelle.

## Invariants (inchangés)
- L'app ne passe jamais commande. Le panier n'est écrit qu'après une confirmation explicite dans l'interface, avec des quantités absolues cumulées avec le panier existant.
- Au plus une requête toutes les 350 ms vers auchan.fr. Aucun secret journalisé ni écrit en dehors de `data/`.
