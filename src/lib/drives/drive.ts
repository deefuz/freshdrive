/** Les Drives pris en charge. Données pures : importable côté client comme côté serveur. */

export const DRIVE_IDS = ["auchan", "leclerc"] as const;
export type DriveId = (typeof DRIVE_IDS)[number];

/** Drive des semaines créées avant la prise en charge de plusieurs enseignes. */
export const DEFAULT_DRIVE: DriveId = "auchan";

export interface DriveInfo {
  id: DriveId;
  /** nom court de l'enseigne : « Auchan », « Leclerc » */
  label: string;
  /** nom du service : « Auchan Drive », « Leclerc Drive » */
  name: string;
  /** site où l'utilisateur se connecte et finalise sa commande */
  siteUrl: string;
  /** domaine affiché dans les messages : « auchan.fr » */
  siteHost: string;
  /** programme de fidélité, tel qu'il est nommé dans les prompts et l'interface */
  loyalty: {
    /** « carte Waaoh », « carte E.Leclerc » */
    card: string;
    /** verbe de crédit : « cagnottés », « en Tickets E.Leclerc » */
    credited: string;
  };
}

export const DRIVES: Record<DriveId, DriveInfo> = {
  auchan: {
    id: "auchan",
    label: "Auchan",
    name: "Auchan Drive",
    siteUrl: "https://www.auchan.fr",
    siteHost: "auchan.fr",
    loyalty: { card: "carte Waaoh", credited: "cagnottés" },
  },
  leclerc: {
    id: "leclerc",
    label: "Leclerc",
    name: "Leclerc Drive",
    siteUrl: "https://www.leclercdrive.fr",
    siteHost: "leclercdrive.fr",
    loyalty: { card: "carte E.Leclerc", credited: "en Tickets E.Leclerc" },
  },
};

export function isDriveId(value: unknown): value is DriveId {
  return typeof value === "string" && (DRIVE_IDS as readonly string[]).includes(value);
}

/** Drive d'une semaine (ou d'un brief) : Auchan pour celles créées avant le choix de l'enseigne. */
export function driveOf(brief: { drive?: DriveId }): DriveId {
  return brief.drive ?? DEFAULT_DRIVE;
}
