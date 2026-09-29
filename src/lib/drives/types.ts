import type { StoreConnector } from "../types";

/** Session ouverte sur un Drive : connecteur prêt, et d'où vient la session. */
export interface OpenedStore {
  connector: StoreConnector;
  source: "chrome" | "saved";
  warnings: string[];
}
