# MyFresh

Une box repas façon HelloFresh, mais avec **ton** drive Auchan.

Chaque semaine, MyFresh demande à Claude des recettes de dîner adaptées à ton foyer (allergies, matériel, goûts, budget) et aux promos Auchan du moment. Il trouve les produits correspondants sur auchan.fr, calcule le coût réel du panier (promos et cagnotte Waaoh comprises), puis remplit ton panier Auchan. **Il ne passe jamais commande** : tu choisis ton créneau et tu paies toi-même sur auchan.fr.

Tu obtiens aussi des fiches recettes et une liste de courses à imprimer (PDF A4), un suivi de tes dépenses et tes recettes favorites.

> Projet personnel, sans lien avec HelloFresh ni Auchan. MyFresh utilise le site auchan.fr avec ton propre compte, comme tu le ferais dans ton navigateur (une requête toutes les 350 ms au plus). À utiliser pour toi, à tes risques.

## Ce qu'il te faut

| | |
|---|---|
| **Node.js 20.9 ou plus** | [nodejs.org](https://nodejs.org) (version LTS). Vérifie avec `node -v`. |
| **Un compte Auchan** | avec un drive (ou une livraison) choisi sur auchan.fr. |
| **Claude** | au choix : **Claude Code** connecté à ton abonnement Claude (Pro ou Max), **ou** une clé d'API Anthropic (payante à l'usage). |
| **Git** | pour récupérer le projet. |

Le projet tourne sur macOS, Linux et Windows. Sur macOS, MyFresh reprend tout seul ta session Auchan de Google Chrome ; ailleurs, tu te connectes une fois dans une fenêtre dédiée (voir plus bas).

## Installation

### 1. Récupérer le projet

```bash
git clone https://github.com/<ton-pseudo-github>/myfresh.git
cd myfresh
npm install
npx playwright install chromium
```

Chromium (installé par Playwright) sert à produire les PDF et à la connexion Auchan hors macOS.

### 2. Brancher Claude

**Option A, abonnement Claude (recommandée).** Installe [Claude Code](https://claude.com/claude-code), lance `claude` une fois dans un terminal et connecte-toi. MyFresh l'appelle ensuite tout seul (`claude -p`) : rien d'autre à configurer.

**Option B, clé d'API.** Crée une clé sur [console.anthropic.com](https://console.anthropic.com), puis un fichier `.env.local` à la racine du projet :

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

Si cette variable existe, MyFresh passe par l'API ; sinon, par Claude Code. La page d'accueil affiche le mode utilisé.

### 3. Connecter Auchan

Il faut que auchan.fr te voie connecté **avec un drive choisi**.

- **macOS avec Google Chrome :** connecte-toi sur auchan.fr dans Chrome et choisis ton drive. C'est tout : MyFresh lit la session de Chrome à chaque fois (macOS peut te demander l'accès au trousseau « Chrome Safe Storage » : accepte). Pour vérifier : `npm run auchan:import-chrome`.
- **Windows, Linux, ou un autre navigateur :** lance `npm run auchan:login`. Une fenêtre Chromium s'ouvre : connecte-toi à ton compte Auchan et choisis ton drive. La fenêtre se ferme toute seule quand c'est bon. À refaire si la session expire.

### 4. Lancer l'app

```bash
npm run dev
```

Puis ouvre **http://127.0.0.1:3141** (ou http://localhost:3141). L'app n'accepte que ces deux adresses.

## Utilisation

1. **Mon profil** : ajoute les personnes du foyer (allergies, ce qu'elles n'aiment pas), ton matériel de cuisine et vos habitudes. Claude en tient compte à chaque nouvelle semaine ; les allergies sont des interdits absolus.
2. **Nouvelle semaine** : nombre de dîners, budget, contraintes. MyFresh charge les promos Auchan, Claude propose des recettes (deux de plus que de dîners, pour choisir), puis MyFresh cherche les produits. Compte quelques minutes.
3. **Choisis tes recettes** : retiens-en autant que de dîners. Tu peux changer un produit, cocher ce que tu as déjà au placard, demander à Claude de modifier une recette ou d'en proposer d'autres. La barre du haut suit le budget en direct.
4. **Vérifier le panier** : MyFresh te montre exactement ce qu'il va ajouter à ton panier Auchan. Rien ne part sans ta confirmation.
5. **Finalise sur auchan.fr** : créneau et paiement, comme d'habitude.
6. **Imprimer / PDF** : fiches recettes (avec les étapes à faire avec les enfants) et liste de courses.

**Mes dépenses** récapitule ce que tu as dépensé, économisé grâce aux promos et cagnotté sur ta carte Waaoh, ainsi que tes produits les plus achetés.

## Sans l'app web : le CLI

Tout peut aussi se faire en ligne de commande :

```bash
npm run week                       # prépare une semaine avec Claude (brief dans data/brief.json)
npm run week -- --push             # … et remplit le panier Auchan après confirmation
```

Avec Claude Code, tu peux générer les recettes toi-même dans une session interactive (sans clé d'API) :

```bash
npm run week -- --prepare                                # écrit la demande dans data/requests/<date>.md
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
| `data/auchan-state.json` | **ta session Auchan (cookies) : ne la partage jamais** |

Les illustrations des recettes sont des dessins SVG que Claude Code réalise à la demande (« dessine les visuels de la semaine du … ») en suivant le style décrit dans `DESIGN.md`. Une recette sans illustration s'affiche simplement sans image.

## En cas de souci

| Message ou symptôme | Que faire |
|---|---|
| « Auchan ne voit aucun drive » | Sur auchan.fr, connecte-toi **et** choisis un drive, puis clique sur « Vérifier » sur l'accueil. Hors macOS : relance `npm run auchan:login`. |
| « Commande « claude » introuvable » | Installe Claude Code et connecte-toi (`claude`), ou définis `ANTHROPIC_API_KEY` dans `.env.local`. |
| Le PDF ne se télécharge pas | `npx playwright install chromium`, et garde l'app lancée sur le port 3141. |
| « Accès refusé : MyFresh ne répond qu'à … » | Ouvre l'app sur http://127.0.0.1:3141, pas via une autre adresse. |
| Une tâche est déjà en cours | Une seule préparation ou un seul envoi à la fois : attends la fin (la page se met à jour toute seule). |

## Pour bidouiller

```bash
npm test          # tests (Vitest)
npm run lint      # ESLint
```

- `src/app/` : l'interface (Next.js 16, React 19, Tailwind CSS 4).
- `src/lib/` : la logique (connecteur Auchan, choix des produits, budget, promos, prompts Claude, stockage).
- `PRODUCT.md` et `DESIGN.md` : à qui s'adresse l'app et son système visuel, à lire avant de toucher à l'interface.
