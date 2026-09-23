---
name: MyFresh
description: Les dîners de la semaine choisis avec les promos Auchan Drive, façon box repas.
colors:
  charcoal: "#232323"
  charcoal-hover: "#3d3d3d"
  graphite: "#4b4b4b"
  pebble: "#6b6b6b"
  steel-line: "#8a8a8a"
  cream: "#faf8f3"
  paper: "#fffefa"
  oat: "#efe9de"
  oat-line: "#e0d9cb"
  lime: "#91c11e"
  lime-wash: "#f6fde9"
  mint-wash: "#f2fcf9"
  basil: "#067a46"
  basil-deep: "#055c35"
  tomato: "#b3261e"
  tomato-wash: "#fceeec"
  honey-ink: "#7a4f00"
  honey-wash: "#fff3d6"
  blueberry: "#1b5faa"
  beet: "#c2185b"
  auchan: "#d6001c"
  claude: "#c96442"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Verdana, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Bricolage Grotesque, Verdana, sans-serif"
    fontSize: "2rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Bricolage Grotesque, Verdana, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  card-title:
    fontFamily: "Roboto, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: 1.3
  body:
    fontFamily: "Roboto, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  small:
    fontFamily: "Roboto, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  badge:
    fontFamily: "Roboto, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.04em"
rounded:
  xs: "3px"
  card: "4px"
  control: "8px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  section: "56px"
components:
  button-primary:
    backgroundColor: "{colors.charcoal}"
    textColor: "{colors.cream}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.charcoal-hover}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.charcoal}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.oat}"
  button-danger:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.tomato}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  chip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.charcoal}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
  chip-selected:
    backgroundColor: "{colors.charcoal}"
    textColor: "{colors.cream}"
    rounded: "{rounded.pill}"
  badge-promo:
    backgroundColor: "{colors.beet}"
    textColor: "{colors.paper}"
    typography: "{typography.badge}"
    rounded: "{rounded.xs}"
    padding: "2px 5px"
  badge-lime:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.charcoal}"
    typography: "{typography.badge}"
    rounded: "{rounded.xs}"
    padding: "2px 5px"
  recipe-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.charcoal}"
    rounded: "{rounded.card}"
    padding: "16px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.charcoal}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    height: "44px"
  budget-bar:
    backgroundColor: "{colors.oat}"
    textColor: "{colors.charcoal}"
    rounded: "{rounded.card}"
    padding: "16px 20px"
---

# Design System: MyFresh

## 1. Overview

**Creative North Star: "La box du dimanche"**

MyFresh se lit comme la page menu d'une box repas : une nappe crème, des cartes recettes posées dessus, des titres ronds et très gras qui donnent faim, et un bouton anthracite franc pour passer à l'action. Le système reprend de très près le langage visuel de HelloFresh (fond `#faf8f3`, anthracite `#232323`, vert citron `#91c11e`, pastilles contour, badges en capitales, pied de carte « 25 min | Rapide • Épicé ») parce que la familiarité est le but : on doit se sentir chez une box repas, pas dans un outil.

C'est une interface produit : la couleur reste retenue. Le crème et le blanc cassé portent la page, l'anthracite porte le texte et les actions, et la couleur n'apparaît qu'avec un sens : citron pour la marque et la sélection, basilic pour l'argent économisé et ce qui va bien, tomate pour le budget dépassé et les suppressions, miel pour « à vérifier ». Les badges colorés (betterave, myrtille) sont rares et en capitales, comme les étiquettes « NOUVEAU » de HelloFresh.

Le système rejette explicitement : le tableau de bord SaaS générique (grille de cartes identiques, dégradés, émeraude Tailwind, gris froid), l'appli discount criarde (rouge promo partout), l'interface « outil de dev » et le glassmorphism.

**Key Characteristics:**
- Fond crème chaud, cartes blanc cassé à ombre légère, jamais de gris froid.
- Titres en Bricolage Grotesque 800 serrés ; tout le reste en Roboto.
- Boutons principaux anthracite, secondaires en contour anthracite ; pastilles arrondies pour les filtres et bascules.
- Une couleur = un sens (citron sélection, basilic économie, tomate alerte, miel attention).
- Mode clair uniquement : planification le dimanche en cuisine, puis fiches imprimées.

## 2. Colors: La palette du marché

Un fond de nappe crème, de l'encre anthracite, et quelques couleurs de légumes employées avec parcimonie.

### Primary
- **Anthracite** (#232323): texte principal, boutons principaux, pastille active, focus clavier. C'est l'accent d'action, comme les boutons « voir nos prix » de HelloFresh.
- **Citron** (#91c11e): la marque. Logo, bordure et badge « RETENUE » d'une recette choisie, remplissage des barres de progression et de budget. Toujours avec du texte anthracite dessus, jamais comme couleur de texte (2:1 sur crème).

### Secondary
- **Basilic** (#067a46): l'argent qui va bien. Total sous le budget, économies promos, liens, confirmation d'envoi réussi. 5,1:1 sur crème.
- **Basilic profond** (#055c35): texte sur fond `lime-wash`.

### Tertiary
- **Tomate** (#b3261e) sur **Voile tomate** (#fceeec): budget dépassé, erreurs, suppression.
- **Encre miel** (#7a4f00) sur **Voile miel** (#fff3d6): avertissements, quantité à vérifier, étapes « avec les enfants ».
- **Betterave** (#c2185b): badge « PROMO » uniquement.
- **Myrtille** (#1b5faa): badge d'information (« ENVOYÉE »), rare.
- **Rouge Auchan** (#d6001c) et **Terre cuite Claude** (#c96442): uniquement le fond des pastilles-logos 40px des services (panneau d'état de l'accueil), icône blanc cassé dessus. Jamais ailleurs.

### Graphiques
- Dépenses par semaine : colonnes empilées de 24px max, **basilic** = payé, **citron** = économies promos, 2px d'écart entre segments, bout arrondi 4px ; trait anthracite 2px = budget. Légende toujours visible, info-bulle au survol et au focus, tableau équivalent sous le graphique (le citron n'atteint pas 3:1 sur le fond).

### Neutral
- **Crème** (#faf8f3): fond de page (la « nappe »). Aussi la couleur du texte sur anthracite.
- **Blanc cassé** (#fffefa): cartes, champs, listes. Jamais `#fff`.
- **Avoine** (#efe9de): seconde couche, barre budget collante, en-têtes de tableau, survol des boutons secondaires.
- **Trait avoine** (#e0d9cb): séparateurs et bordures décoratives.
- **Trait acier** (#8a8a8a): bordures de champs de formulaire (3,25:1, seuil des contrôles).
- **Graphite** (#4b4b4b): texte secondaire (sous-titres de carte, descriptions).
- **Galet** (#6b6b6b): texte tertiaire (métadonnées, aides). 5:1 sur crème, minimum pour du texte.

### Named Rules
**La règle du citron muet.** Le citron ne porte jamais de texte. Il remplit, il entoure, il marque ; le texte posé dessus est anthracite.

**La règle une couleur, un sens.** Basilic = argent qui va bien, tomate = problème, miel = à vérifier. Une couleur utilisée pour décorer est une couleur qui ment.

## 3. Typography

**Display Font:** Bricolage Grotesque 800 (repli Verdana), substitut libre d'Agrandir Tight de HelloFresh
**Body Font:** Roboto (repli system-ui), comme HelloFresh

**Character:** un grotesque rond et trapu, serré à -0,03em, pour des titres qui ont la générosité d'une étiquette de box ; Roboto neutre et très lisible pour tout ce qui se lit, se compare et se clique.

### Hierarchy
- **Display** (800, 2.5rem, 1.05): titre de page unique (« Mes semaines », « Semaine du 23 septembre »).
- **Headline** (800, 2rem, 1.1): titre des fiches imprimées, titres de sections majeures à l'impression.
- **Title** (700, 1.5rem, 1.2): titres de section (« Recettes », « Produits », « Mes favoris »).
- **Card title** (Roboto 500, 1.125rem, 1.3): nom d'une recette ou d'une semaine dans une carte, comme HelloFresh.
- **Body** (400, 1rem, 1.5): texte courant, 70ch maximum.
- **Small** (400, 0.875rem, 1.45): descriptions, lignes de produits, aides.
- **Badge** (700, 0.6875rem, 0.04em, CAPITALES): badges « RETENUE », « PROMO », « ENVOYÉE ».

### Named Rules
**La règle du titre gourmand.** Bricolage n'apparaît que dans les titres (h1, h2, logo, chiffres du budget). Jamais dans un bouton, un libellé ou un tableau.

## 4. Elevation

Plat avec une seule ombre, celle des cartes HelloFresh : les cartes recettes et les listes sont « posées » sur la nappe par une ombre courte et douce. Les autres niveaux se font par tons (crème → avoine → blanc cassé), pas par ombres.

### Shadow Vocabulary
- **Posée** (`box-shadow: 0 1px 2px rgb(35 35 35 / 0.08), 0 1px 4px rgb(35 35 35 / 0.06)`): cartes, listes, barre budget.
- **Soulevée** (`box-shadow: 0 2px 6px rgb(35 35 35 / 0.1), 0 8px 24px rgb(35 35 35 / 0.08)`): survol d'une carte cliquable uniquement.

### Named Rules
**La règle de la nappe.** Une seule couche d'ombre. Rien ne flotte au-dessus d'une carte ; pas de carte dans une carte.

## 5. Components

### Buttons
Francs et pleins, comme un bouton « Commander ».
- **Shape:** coins de 8px (`rounded.control`), hauteur 44px (principal) ou 40px (secondaire).
- **Primary:** fond anthracite, texte crème, Roboto 700. Une seule action principale par zone.
- **Hover / Focus:** fond `#3d3d3d` en 150ms ; focus par anneau anthracite 2px décalé de 2px sur tous les éléments interactifs.
- **Secondary:** fond blanc cassé, contour anthracite 1.5px, texte anthracite ; survol avoine.
- **Danger:** fond blanc cassé, contour et texte tomate ; la confirmation passe en fond tomate plein.
- **Disabled:** opacité 50 %, curseur interdit.

### Chips
- **Style:** pastille contour anthracite 1.5px, fond blanc cassé, Roboto 500 0.875rem, comme les filtres « Tofu recettes ».
- **State:** cochée = fond anthracite, texte crème, coche ✓. Utilisées pour les contraintes du formulaire, les favoris à reprendre et le bouton « Retenir » d'une recette.

### Badges
- Petites étiquettes rectangulaires (3px), capitales 11px gras : citron « RETENUE », betterave « PROMO », myrtille « ENVOYÉE », miel « AVEC LES ENFANTS ».

### Cards / Containers
- **Corner Style:** 4px, comme les cartes HelloFresh.
- **Background:** blanc cassé sur crème.
- **Shadow Strategy:** ombre « Posée » ; pas de bordure, sauf l'état sélectionné (anneau citron 3px).
- **Internal Padding:** 16px ; pied de carte séparé par un trait avoine, format `25 min | Enfants • Léger`, durée en gras.

### Inputs / Fields
- **Style:** fond blanc cassé, bordure acier 1px, coins 8px, 44px de haut.
- **Focus:** bordure anthracite + anneau anthracite 2px.
- **Error:** message tomate sous le champ, `role="alert"`.

### Navigation
- Barre haute crème, logo citron + « MY FRESH » en Bricolage 800 capitales sur deux lignes, lien « Mes semaines » en Roboto 500, bouton secondaire « Nouvelle semaine ». Masquée à l'impression.

### Illustrations de recettes (signature)
Chaque recette a une illustration SVG dessinée à la main, `data/visuels/<slug-du-titre>.svg` (slug : titre en minuscules sans accents, `œ` → `oe`, tout le reste remplacé par des tirets). Elle occupe le haut de la carte recette (recadrée en 16:7), la miniature des favoris et le bandeau des fiches imprimées.
- **Cadre :** `viewBox="0 0 640 400"`, `width="640" height="400"`, vue de dessus, plat centré ou légèrement décalé, rien d'important à moins de 40px des bords (recadrage 16:7 sur les cartes, 16:6 en aperçu et 16:5 à l'impression).
- **Nappe :** un aplat doux (#dfe6ea, #dce6ee, #dfe8cf, #efe9de, #f1ddd3, #f1e6d6) avec 3 ou 4 fines rayures un ton plus foncé. Varier la nappe d'une recette à l'autre dans une même semaine.
- **Accessoires :** une serviette (vichy tomate, rayures myrtille, rayures citron ou carreaux miel, à 35-55 % d'opacité sur fond clair) coupée par un bord, et des couverts gris (#b9bec2, #c9cdd0) ou des baguettes bois.
- **Vaisselle :** assiette #f4efe4 et fond #fbf8f1 ; ombre = même forme décalée de (8, 10), anthracite à 10 %.
- **Aliments :** formes plates sans contour, 2 à 3 tons par aliment (base, ombre, reflet), petites touches d'herbes vertes (#4f8a2f, #3f7a33). Les ingrédients principaux du titre doivent être reconnaissables à la taille d'une carte.
- **Interdits :** dégradés, contours noirs, texte, visages ou personnages, photoréalisme.

### Budget bar (signature)
- Bandeau avoine collant en haut de la semaine : total en Bricolage 800 (basilic sous le budget, tomate au-dessus), jauge citron sur piste blanc cassé, économies promos en basilic, action principale anthracite à droite. Rappelle la barre « voir nos prix » de HelloFresh.

## 6. Do's and Don'ts

### Do:
- **Do** poser les cartes blanc cassé (#fffefa) sur le fond crème (#faf8f3) avec l'ombre « Posée » et des coins de 4px.
- **Do** écrire les titres en Bricolage Grotesque 800 serré (-0,03em) et tout le reste en Roboto.
- **Do** utiliser l'anthracite (#232323) pour l'action principale et le citron (#91c11e) seulement en remplissage.
- **Do** écrire le pied des cartes au format HelloFresh : `25 min | Enfants • Léger`, durée en gras.
- **Do** doubler chaque état coloré d'un libellé (« au-dessus du budget », « RETENUE », « quantité à vérifier »).
- **Do** garder les fiches imprimées sur fond blanc, texte anthracite, sans ombres.

### Don't:
- **Don't** faire un tableau de bord SaaS générique : pas de grille de cartes identiques avec icône + chiffre, pas de dégradés, pas d'émeraude Tailwind, pas de gris froid (`zinc`, `slate`).
- **Don't** faire une appli discount criarde : pas de rouge promo partout ; la betterave ne sert qu'au badge « PROMO ».
- **Don't** afficher du jargon technique (« job », « push », « matching ») ou une erreur serveur brute sans phrase d'explication.
- **Don't** utiliser le glassmorphism, le mode sombre ou des ombres lourdes.
- **Don't** mettre du texte en citron, ni de bordure latérale colorée de plus de 1px sur une carte ou une alerte.
- **Don't** utiliser `#000` ou `#fff` ; ni d'emoji comme icône d'interface.
