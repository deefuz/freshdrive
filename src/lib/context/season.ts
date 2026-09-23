export type Season = "hiver" | "printemps" | "été" | "automne";

export function getSeason(d: Date): Season {
  const m = d.getMonth() + 1;
  if (m === 12 || m <= 2) return "hiver";
  if (m <= 5) return "printemps";
  if (m <= 8) return "été";
  return "automne";
}

const PRODUCE: Record<number, string[]> = {
  1: ["poireau", "chou", "carotte", "céleri", "endive", "mâche", "navet", "panais", "potiron", "orange", "clémentine", "kiwi", "pomme", "poire"],
  2: ["poireau", "chou", "carotte", "endive", "mâche", "navet", "panais", "orange", "kiwi", "pomme", "poire"],
  3: ["poireau", "chou", "carotte", "endive", "épinard", "radis", "kiwi", "pomme"],
  4: ["asperge", "épinard", "radis", "petits pois", "blette", "carotte nouvelle"],
  5: ["asperge", "petits pois", "fraise", "radis", "artichaut", "courgette", "concombre"],
  6: ["courgette", "tomate", "concombre", "haricot vert", "fraise", "cerise", "abricot", "melon"],
  7: ["tomate", "courgette", "aubergine", "poivron", "haricot vert", "melon", "pêche", "abricot", "framboise"],
  8: ["tomate", "courgette", "aubergine", "poivron", "maïs", "melon", "pêche", "prune", "mûre"],
  9: ["tomate", "courgette", "aubergine", "poivron", "potiron", "champignon", "raisin", "pomme", "poire", "prune", "figue"],
  10: ["potiron", "potimarron", "courge butternut", "champignon", "chou", "poireau", "céleri", "raisin", "pomme", "poire", "châtaigne", "coing"],
  11: ["potiron", "potimarron", "courge butternut", "chou", "poireau", "endive", "céleri", "panais", "pomme", "poire", "clémentine", "kiwi"],
  12: ["potiron", "chou", "poireau", "endive", "mâche", "panais", "topinambour", "clémentine", "orange", "pomme", "poire", "kiwi"],
};

export function seasonalProduceFor(d: Date): string[] {
  return PRODUCE[d.getMonth() + 1];
}
