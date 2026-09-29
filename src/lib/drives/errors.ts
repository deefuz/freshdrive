/** Erreurs communes aux connecteurs des Drives. */

export class SessionExpiredError extends Error {
  constructor(message = "Session du Drive expirée : reconnecte-toi dans Chrome puis relance.") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

/** La session est valide mais aucun magasin n'est visible (drive non choisi). */
export class NoStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoStoreError";
  }
}
