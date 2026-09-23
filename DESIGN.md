---
name: FreshDrive
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
  vichy: "#c8372d"
  vichy-deep: "#a52a22"
  vichy-wash: "#fbeceb"
  lime-wash: "#f6fde9"
  mint-wash: "#f2fcf9"
  basil: "#067a46"
  basil-deep: "#055c35"
  bordeaux: "#8f1d1d"
  bordeaux-wash: "#fceeec"
  honey: "#e0a526"
  honey-ink: "#7a4f00"
  honey-wash: "#fff3d6"
  blueberry: "#1b5faa"
  beet: "#c2185b"
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
    textColor: "{colors.bordeaux}"
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
  badge-vichy:
    backgroundColor: "{colors.vichy}"
    textColor: "{colors.paper}"
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

# Design System: FreshDrive

## 1. Overview

**Creative North Star: "La box du dimanche"**

FreshDrive se lit comme une table dressée pour la semaine : une nappe vichy rouge en bordure, un fond crème, des cartes recettes posées dessus, des titres ronds et très gras qui donnent faim, et un bouton anthracite franc pour passer à l'action. La mise en page reprend de près les codes des box repas type HelloFresh (cartes recettes, pastilles contour, badges en capitales, pied de carte « 25 min | Rapide • Épicé ») parce que la familiarité est le but ; la nappe vichy lui donne son identité propre, familiale et bistrot.

C'est une interface produit : la couleur reste retenue. Le vichy tient les bords (bandeau du haut, liseré du bas, logo), le crème et le blanc cassé portent le contenu, l'anthracite porte le texte et les actions, et la couleur n'apparaît qu'avec un sens : rouge vichy pour la marque, la sélection et la progression, basilic pour l'argent qui va bien, bordeaux pour le budget dépassé et les suppressions, miel pour « à vérifier ». Les badges colorés (betterave, myrtille) sont rares et en capitales.

Le système rejette explicitement : le tableau de bord SaaS générique (grille de cartes identiques, dégradés, émeraude Tailwind, gris froid), l'appli discount criarde (rouge promo partout), l'interface « outil de dev » et le glassmorphism.

**Key Characteristics:**
- Nappe vichy rouge en bandeau et en liseré, fond crème chaud, cartes blanc cassé à ombre légère, jamais de gris froid.
- Titres en Bricolage Grotesque 800 serrés ; tout le reste en Roboto.
- Boutons principaux anthracite, secondaires en contour anthracite ; pastilles arrondies pour les filtres et bascules.
- Une couleur = un sens (vichy marque et sélection, basilic économie, bordeaux alerte, miel attention).
- Mode clair uniquement : planification le dimanche en cuisine, puis fiches imprimées.

## 2. Colors: La palette de la nappe

Une nappe vichy rouge sur les bords, un fond crème, de l'encre anthracite, et quelques couleurs de légumes employées avec parcimonie.

### Primary
- **Anthracite** (#232323): texte principal, boutons principaux, pastille active, focus clavier. C'est l'accent d'action, comme les boutons « voir nos prix » de HelloFresh.
- **Rouge vichy** (#c8372d): la marque. Motif `.vichy` (carreaux à 55 % d'opacité sur blanc cassé) du bandeau du haut et du liseré du bas, logo, anneau et badge « RETENUE » d'une recette choisie, barres de progression, pastille du contexte. Texte blanc cassé dessus (5,2:1). **Vichy profond** (#a52a22) pour un texte rouge ; **voile vichy** (#fbeceb) pour la sélection de texte.

### Secondary
- **Basilic** (#067a46): l'argent qui va bien. Total sous le budget, économies promos, liens, confirmation d'envoi réussi. 5,1:1 sur crème.
- **Basilic profond** (#055c35): texte sur fond `lime-wash`.

### Tertiary
- **Bordeaux** (#8f1d1d) sur **Voile bordeaux** (#fceeec): budget dépassé, erreurs, suppression. Plus sombre que le rouge vichy pour que l'alerte ne se confonde jamais avec la marque.
- **Encre miel** (#7a4f00) sur **Voile miel** (#fff3d6): avertissements, quantité à vérifier, étapes « avec les enfants ».
- **Betterave** (#c2185b): badge « PROMO » uniquement.
- **Myrtille** (#1b5faa): badge d'information (« ENVOYÉE »), rare.
- **Terre cuite Claude** (#c96442): uniquement le fond de la pastille-logo 40px de Claude (panneau d'état de l'accueil), icône blanc cassé dessus. Jamais ailleurs. La pastille Auchan montre le logo officiel (chargé depuis auchan.fr) sur blanc cassé.

### Graphiques
- Dépenses par semaine : colonnes empilées de 24px max, **basilic** = payé, **miel** (#e0a526) = économies promos, 2px d'écart entre segments, bout arrondi 4px ; trait anthracite 2px = budget. Légende toujours visible, info-bulle au survol et au focus, tableau équivalent sous le graphique (le miel n'atteint pas 3:1 sur le fond).

### Neutral
- **Crème** (#faf8f3): fond de page, sous la nappe vichy. Aussi la couleur du texte sur anthracite.
- **Blanc cassé** (#fffefa): cartes, champs, listes. Jamais `#fff`.
- **Avoine** (#efe9de): seconde couche, barre budget collante, en-têtes de tableau, survol des boutons secondaires.
- **Trait avoine** (#e0d9cb): séparateurs et bordures décoratives.
- **Trait acier** (#8a8a8a): bordures de champs de formulaire (3,25:1, seuil des contrôles).
- **Graphite** (#4b4b4b): texte secondaire (sous-titres de carte, descriptions).
- **Galet** (#6b6b6b): texte tertiaire (métadonnées, aides). 5:1 sur crème, minimum pour du texte.

### Named Rules
**La règle de la nappe en bordure.** Le motif vichy habille les bords (bandeau, liseré, logo, serviettes des illustrations) et ne passe jamais sous du texte à lire : le contenu est toujours posé sur une surface unie.

**La règle une couleur, un sens.** Basilic = argent qui va bien, bordeaux = problème, miel = à vérifier. Une couleur utilisée pour décorer est une couleur qui ment.

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
- **Danger:** fond blanc cassé, contour et texte bordeaux ; la confirmation passe en fond bordeaux plein.
- **Disabled:** opacité 50 %, curseur interdit.

### Chips
- **Style:** pastille contour anthracite 1.5px, fond blanc cassé, Roboto 500 0.875rem, comme les filtres « Tofu recettes ».
- **State:** cochée = fond anthracite, texte crème, coche ✓. Utilisées pour les contraintes du formulaire, les favoris à reprendre et le bouton « Retenir » d'une recette.

### Badges
- Petites étiquettes rectangulaires (3px), capitales 11px gras : rouge vichy « RETENUE », betterave « PROMO », myrtille « ENVOYÉE », miel « AVEC LES ENFANTS ».

### Cards / Containers
- **Corner Style:** 4px, comme les cartes HelloFresh.
- **Background:** blanc cassé sur crème.
- **Shadow Strategy:** ombre « Posée » ; pas de bordure, sauf l'état sélectionné (anneau rouge vichy 3px).
- **Internal Padding:** 16px ; pied de carte séparé par un trait avoine, format `25 min | Enfants • Léger`, durée en gras.

### Inputs / Fields
- **Style:** fond blanc cassé, bordure acier 1px, coins 8px, 44px de haut.
- **Focus:** bordure anthracite + anneau anthracite 2px.
- **Error:** message bordeaux sous le champ, `role="alert"`.

### Navigation
- Bandeau vichy pleine largeur ; dessus, une barre blanc cassé arrondie (8px, ombre « Posée ») avec le logo (carré vichy, assiette et feuille de basilic, puis « FRESH / DRIVE » en Bricolage 800 capitales sur deux lignes), les liens « Mes semaines », « Mes dépenses », « Mon profil » en Roboto 500 et le bouton secondaire « Nouvelle semaine ». Un liseré vichy de 16px ferme la page. Masqués à l'impression.

### Illustrations de recettes (signature)
Chaque recette a une illustration SVG, dessinée automatiquement par Claude quand la semaine est prête (cette section sert de consigne au prompt, voir `src/lib/illustrate.ts`) ou à la main sur demande, `data/visuels/<slug-du-titre>.svg` (slug : titre en minuscules sans accents, `œ` → `oe`, tout le reste remplacé par des tirets). Elle occupe le haut de la carte recette (recadrée en 16:7), la miniature des favoris et le bandeau des fiches imprimées.
- **Cadre :** `viewBox="0 0 640 400"`, `width="640" height="400"`, vue de dessus, plat centré ou légèrement décalé, rien d'important à moins de 40px des bords (recadrage 16:7 sur les cartes, 16:6 en aperçu et 16:5 à l'impression).
- **Nappe :** un aplat doux (#dfe6ea, #dce6ee, #dfe8cf, #efe9de, #f1ddd3, #f1e6d6) avec 3 ou 4 fines rayures un ton plus foncé. Varier la nappe d'une recette à l'autre dans une même semaine.
- **Accessoires :** une serviette (vichy rouge, rayures myrtille, rayures vertes ou carreaux miel, à 35-55 % d'opacité sur fond clair) coupée par un bord, et des couverts gris (#b9bec2, #c9cdd0) ou des baguettes bois.
- **Vaisselle :** assiette #f4efe4 et fond #fbf8f1 ; ombre = même forme décalée de (8, 10), anthracite à 10 %.
- **Aliments :** formes plates sans contour, 2 à 3 tons par aliment (base, ombre, reflet), petites touches d'herbes vertes (#4f8a2f, #3f7a33). Les ingrédients principaux du titre doivent être reconnaissables à la taille d'une carte.
- **Interdits :** dégradés, contours noirs, texte, visages ou personnages, photoréalisme.

### Budget bar (signature)
- Bandeau avoine collant en haut de la semaine : total en Bricolage 800 (basilic sous le budget, bordeaux au-dessus), jauge basilic (bordeaux si dépassement) sur piste blanc cassé, économies promos en basilic, action principale anthracite à droite. Rappelle la barre « voir nos prix » de HelloFresh.

## 6. Do's and Don'ts

### Do:
- **Do** poser les cartes blanc cassé (#fffefa) sur le fond crème (#faf8f3) avec l'ombre « Posée » et des coins de 4px.
- **Do** écrire les titres en Bricolage Grotesque 800 serré (-0,03em) et tout le reste en Roboto.
- **Do** utiliser l'anthracite (#232323) pour l'action principale, et le rouge vichy (#c8372d) pour la marque, la sélection et la progression.
- **Do** écrire le pied des cartes au format HelloFresh : `25 min | Enfants • Léger`, durée en gras.
- **Do** doubler chaque état coloré d'un libellé (« au-dessus du budget », « RETENUE », « quantité à vérifier »).
- **Do** garder les fiches imprimées sur fond blanc, texte anthracite, sans ombres.

### Don't:
- **Don't** faire un tableau de bord SaaS générique : pas de grille de cartes identiques avec icône + chiffre, pas de dégradés, pas d'émeraude Tailwind, pas de gris froid (`zinc`, `slate`).
- **Don't** faire une appli discount criarde : pas de rouge promo partout ; la betterave ne sert qu'au badge « PROMO ».
- **Don't** afficher du jargon technique (« job », « push », « matching ») ou une erreur serveur brute sans phrase d'explication.
- **Don't** utiliser le glassmorphism, le mode sombre ou des ombres lourdes.
- **Don't** poser du texte sur le motif vichy, ni utiliser le rouge vichy pour une erreur (c'est le bordeaux), ni de bordure latérale colorée de plus de 1px sur une carte ou une alerte.
- **Don't** utiliser `#000` ou `#fff` ; ni d'emoji comme icône d'interface.
