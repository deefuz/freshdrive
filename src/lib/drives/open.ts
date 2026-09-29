import { openAuchan } from "../auchan/open";
import { openLeclerc } from "../leclerc/open";
import type { DriveId } from "./drive";
import type { OpenedStore } from "./types";

/** Ouvre la session du Drive demandé (reprise de Chrome, repli sur la session enregistrée). */
export function openDrive(drive: DriveId, opts: { importChrome?: boolean } = {}): Promise<OpenedStore> {
  switch (drive) {
    case "auchan":
      return openAuchan(opts);
    case "leclerc":
      return openLeclerc(opts);
  }
}
