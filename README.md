# FreshDrive

Une box repas façon HelloFresh, mais avec **ton** drive Auchan ou Leclerc.

Chaque semaine, FreshDrive demande à Claude des recettes de dîner adaptées à ton foyer (allergies, matériel, goûts, budget) et aux promos du moment de ton Drive. Il trouve les produits correspondants sur auchan.fr ou leclercdrive.fr, calcule le coût réel du panier (promos et fidélité comprises : cagnotte Waaoh ou Tickets E.Leclerc), puis remplit ton panier. **Il ne passe jamais commande** : tu choisis ton créneau et tu paies toi-même sur le site du Drive.

Tu choisis le Drive au début de chaque semaine (par défaut, celui de ta semaine précédente).

Tu obtiens aussi des fiches recettes et une liste de courses à imprimer (PDF A4), un suivi de tes dépenses et tes recettes favorites.

> Projet personnel, sans lien avec HelloFresh, Auchan ni E.Leclerc. FreshDrive utilise auchan.fr et leclercdrive.fr avec ton propre compte, comme tu le ferais dans ton navigateur (une requête toutes les 350 ms au plus par site). À utiliser pour toi, à tes risques.

## Ce qu'il te faut

| | |
|---|---|
| **Node.js 20.9 ou plus** | [nodejs.org](https://nodejs.org) (version LTS). Vérifie avec `node -v`. |
| **Un compte Auchan ou Leclerc Drive** | avec un drive (ou une livraison) choisi sur auchan.fr ou leclercdrive.fr. |
| **Claude** | au choix : **Claude Code** connecté à ton abonnement Claude (Pro ou Max), **ou** une clé d'API Anthropic (payante à l'usage). |
| **Git** | pour récupérer le projet. |

Le projet tourne sur macOS, Linux et Windows. Sur macOS, FreshDrive reprend tout seul ta session Auchan ou Leclerc de Google Chrome ; ailleurs, tu te connectes à Auchan une fois dans une fenêtre dédiée (voir plus bas). **Leclerc Drive demande macOS avec Google Chrome.**

## Installation

### 1. Récupérer le projet

```bash
git clone https://github.com/deefuz/freshdrive.git
cd freshdrive
npm install
npx playwright install chromium
```

Chromium (installé par Playwright) sert à produire les PDF et à la connexion Auchan hors macOS.

### 2. Brancher Claude

**Option A, abonnement Claude (recommandée).** Installe [Claude Code](https://claude.com/claude-code), lance `claude` une fois dans un terminal et connecte-toi. FreshDrive l'appelle ensuite tout seul (`claude -p`) : rien d'autre à configurer.

**Option B, clé d'API.** Crée une clé sur [console.anthropic.com](https://console.anthropic.com), puis un fichier `.env.local` à la racine du projet :

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

Si cette variable existe, FreshDrive passe par l'API ; sinon, par Claude Code. La page d'accueil affiche le mode utilisé.

### 3. Connecter ton Drive

Il faut que le site te voie connecté **avec un drive choisi**. Tu peux connecter Auchan, Leclerc, ou les deux.

**Auchan**

- **macOS avec Google Chrome :** connecte-toi sur auchan.fr dans Chrome et choisis ton drive. C'est tout : FreshDrive lit la session de Chrome à chaque fois (macOS peut te demander l'accès au trousseau « Chrome Safe Storage » : accepte). Pour vérifier : `npm run auchan:import-chrome`.
- **Windows, Linux, ou un autre navigateur :** lance `npm run auchan:login`. Une fenêtre Chromium s'ouvre : connecte-toi à ton compte Auchan et choisis ton drive. La fenêtre se ferme toute seule quand c'est bon. À refaire si la session expire.

**Leclerc Drive** (macOS avec Google Chrome)

- Connecte-toi sur leclercdrive.fr dans Chrome et choisis ton drive. FreshDrive lit la session de Chrome à chaque fois et retrouve ton magasin tout seul. Pour vérifier : `npm run leclerc:import-chrome`, ou `npm run leclerc:smoke` (recherche, promos et panier en lecture seule).
- Le site est protégé contre les robots : si FreshDrive annonce une session expirée, rouvre leclercdrive.fr dans Chrome (en étant connecté), puis clique sur « Vérifier ».

Sur l'accueil de l'app, le panneau d'état affiche la connexion de chaque Drive, avec un bouton « Vérifier ».

### 4. Lancer l'app

```bash
npm run dev
```

Puis ouvre **http://127.0.0.1:3141** (ou http://localhost:3141). L'app n'accepte que ces deux adresses.

## Utilisation

1. **Mon profil** : ajoute les personnes du foyer (allergies, ce qu'elles n'aiment pas), ton matériel de cuisine et vos habitudes. Claude en tient compte à chaque nouvelle semaine ; les allergies sont des interdits absolus.
2. **Nouvelle semaine** : Drive, nombre de dîners, budget, contraintes. FreshDrive charge les promos du Drive choisi, Claude propose des recettes (deux de plus que de dîners, pour choisir), puis FreshDrive cherche les produits. Compte quelques minutes.
3. **Choisis tes recettes** : retiens-en autant que de dîners. Tu peux changer un produit, cocher ce que tu as déjà au placard, demander à Claude de modifier une recette ou d'en proposer d'autres. La barre du haut suit le budget en direct.
4. **Vérifier le panier** : FreshDrive te montre exactement ce qu'il va ajouter à ton panier Auchan ou Leclerc. Rien ne part sans ta confirmation.
5. **Finalise sur le site du Drive** : créneau et paiement, comme d'habitude.
6. **Imprimer / PDF** : fiches recettes (avec les étapes à faire avec les enfants) et liste de courses.

**Mes dépenses** récapitule ce que tu as dépensé, économisé grâce aux promos et crédité sur tes cartes de fidélité, ainsi que tes produits les plus achetés.

## Sans l'app web : le CLI

Tout peut aussi se faire en ligne de commande :

```bash
npm run week                       # prépare une semaine avec Claude (brief dans data/brief.json)
npm run week -- --push             # … et remplit le panier après confirmation
npm run week -- --drive leclerc    # choisit le Drive (auchan ou leclerc ; sinon celui de data/brief.json, Auchan par défaut)
```

Avec Claude Code, tu peux générer les recettes toi-même dans une session interactive (sans clé d'API) :

```bash
npm run week -- --prepare                                # écrit la demande dans data/requests/<date>.md (ajoute --drive leclerc au besoin)
# dans Claude Code : « génère les recettes de data/requests/<date>.md »
npm run week -- --from-recipes data/recipes/<date>.json  # ajoute --push pour remplir le panier
```

Ne lance pas le CLI et l'app web en même temps sur la même semaine.

## Tes données

Tout reste sur ta machine, dans le dossier `data/` (ignoré par git) :

| Fichier | Contenu |
|---|---|
| `data/profile.json` | ton profil (foyer, allergies, matériel) |
| `data/weeks/` | tes semaines ; celles que tu supprimes vont dans `data/weeks/corbeille/` |
| `data/favorites.json` | tes recettes favorites |
| `data/visuels/` | les illustrations des recettes |
| `data/auchan-state.json`, `data/leclerc-state.json` | **tes sessions Auchan et Leclerc (cookies) : ne les partage jamais** |
| `data/cache/context-<drive>.json` | promos, anti-gaspi et thèmes de chaque Drive (24 h) |

Les illustrations des recettes sont des dessins SVG que Claude réalise automatiquement, en arrière-plan, dès qu'une semaine est prête (compte une à deux minutes par lot de 3 recettes ; la page se met à jour toute seule). Le style suit la section « Illustrations de recettes » de `DESIGN.md`. Pour les désactiver, ajoute `FRESHDRIVE_VISUELS=non` dans `.env.local` (ou `--no-visuels` pour le CLI). Une recette sans illustration s'affiche simplement sans image.

## En cas de souci

| Message ou symptôme | Que faire |
|---|---|
| « Auchan ne voit aucun drive » | Sur auchan.fr, connecte-toi **et** choisis un drive, puis clique sur « Vérifier » sur l'accueil. Hors macOS : relance `npm run auchan:login`. |
| « Leclerc Drive ne voit aucun magasin » ou « Session Leclerc expirée » | Dans Chrome, ouvre leclercdrive.fr, connecte-toi **et** choisis ton drive, puis clique sur « Vérifier » sur l'accueil. |
| « Commande « claude » introuvable » | Installe Claude Code et connecte-toi (`claude`), ou définis `ANTHROPIC_API_KEY` dans `.env.local`. |
| Le PDF ne se télécharge pas | `npx playwright install chromium`, et garde l'app lancée sur le port 3141. |
| « Accès refusé : FreshDrive ne répond qu'à … » | Ouvre l'app sur http://127.0.0.1:3141, pas via une autre adresse. |
| Une tâche est déjà en cours | Une seule préparation ou un seul envoi à la fois : attends la fin (la page se met à jour toute seule). |

## Organisation du code

- `src/app/` : l'interface (Next.js 16, React 19, Tailwind CSS 4).
- `src/lib/` : la logique (connecteurs Auchan et Leclerc, choix des produits, budget, promos, prompts Claude, stockage).
- `PRODUCT.md` et `DESIGN.md` : à qui s'adresse l'app et son système visuel.
- `npm test` lance les tests (Vitest), `npm run lint` le linter.

## Licence

FreshDrive est publié sous la [PolyForm Strict License 1.0.0](LICENSE). En résumé (seul le texte anglais du fichier `LICENSE` fait foi) :

- **Autorisé :** installer et utiliser FreshDrive pour toi, sans but commercial.
- **Interdit :** modifier le code, le redistribuer (le copier ailleurs, le republier, le donner à quelqu'un), en tirer un autre projet, ou en faire un usage commercial.

Pour tout autre usage, demande d'abord l'autorisation à l'auteur.
