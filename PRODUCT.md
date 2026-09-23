# Product

## Register

product

## Users

Un foyer (parents, enfants) qui fait ses courses au drive Auchan. La personne qui planifie ouvre FreshDrive une fois par semaine, souvent le dimanche après-midi, sur un portable posé sur la table de la cuisine : elle choisit les dîners de la semaine, vérifie le budget, ajuste les produits, puis remplit le panier Auchan. En semaine, le soir, on cuisine à partir des fiches imprimées (PDF A4), parfois avec les enfants.

Le travail à accomplir : « des dîners qui donnent envie, pour toute la famille, dans le budget, sans passer une heure à faire la liste de courses ».

## Product Purpose

FreshDrive reproduit l'expérience d'une box repas type HelloFresh, mais avec les produits et les promos d'Auchan Drive. Claude propose des recettes adaptées à la semaine (promos en cours, saison, contraintes du foyer), FreshDrive associe chaque ingrédient à un produit Auchan, calcule le coût réel du panier, puis l'ajoute au panier Auchan sans jamais passer commande.

Réussir, c'est : choisir sa semaine en quelques minutes, rester dans le budget, savoir exactement ce qui part au panier, et cuisiner sereinement à partir de fiches claires.

## Brand Personality

**Gourmand, malin, rassurant.**

- **Gourmand** : les recettes sont la vedette. Titres généreux, vocabulaire culinaire, on doit avoir envie de cuisiner.
- **Malin** : les économies (promos, cagnotte Waaoh, budget restant) sont visibles et valorisées, jamais cachées dans un coin.
- **Rassurant** : on sait toujours où l'on en est (tâche en cours, panier envoyé ou non, produit introuvable). Aucune action vers Auchan ne part sans confirmation explicite.

Ton : tutoiement, phrases courtes, chaleureux et concret. Pas de jargon technique dans l'interface (on dit « panier », « placard », « dîners », pas « job », « push », « matching »).

Signature visuelle : **la nappe vichy rouge**, familiale et bistrot, qui encadre l'interface.

Référence assumée pour la mise en page : **HelloFresh** (hellofresh.fr), sa page menu et ses cartes recettes : fond crème, titres ronds très gras, boutons anthracite, pastilles contour, badges colorés en capitales, pied de carte « 25 min | Rapide • Épicé ».

## Anti-references

- Un tableau de bord SaaS générique : grille de cartes identiques avec icône + chiffre, dégradés, fond gris froid, vert émeraude de Tailwind par défaut.
- Une appli de courses « discount » criarde : rouge promo partout, bandeaux clignotants, prix en énorme.
- Une interface « outil de dev » : texte technique, états bruts, messages d'erreur copiés du serveur sans contexte.
- Le glassmorphism, le mode sombre « parce que ça fait moderne », les ombres lourdes.

## Design Principles

1. **La recette d'abord.** Chaque écran part de ce qu'on va manger ; les produits, prix et états viennent en soutien.
2. **Les économies se voient.** Budget, reste, promos et cagnotte ont une place fixe et lisible ; le dépassement de budget est dit clairement, sans alarmisme.
3. **Jamais de surprise dans le panier.** Tout ce qui touche Auchan est prévisualisé, confirmé, puis rapporté ligne à ligne.
4. **Familier comme HelloFresh.** On reprend les codes d'une box repas connue (cartes, pastilles, badges) plutôt que d'inventer des affordances.
5. **Du papier à la cuisine.** Les fiches imprimées sont un produit à part entière : lisibles à un mètre, sobres en encre.

## Accessibility & Inclusion

- WCAG 2.2 AA : contraste texte ≥ 4,5:1 sur le fond crème, 3:1 pour les contrôles et bordures utiles.
- Focus clavier toujours visible (anneau anthracite), cibles tactiles ≥ 40 px.
- L'état ne passe jamais par la couleur seule : budget dépassé, recette retenue, produit introuvable ont aussi un libellé.
- `prefers-reduced-motion` respecté ; les seules animations sont des transitions d'état courtes.
- Impression en noir et blanc lisible : aucune information portée uniquement par une teinte.
