import fs from "node:fs";
import path from "node:path";
import { EMPTY_PROFILE, type Profile, ProfileSchema } from "./profile";

export const PROFILE_FILE = "data/profile.json";

/** Seul module qui lit et écrit data/profile.json. */
export class ProfileStore {
  constructor(private readonly file: string = PROFILE_FILE) {}

  /** Profil enregistré ; un fichier absent ou abîmé donne un profil vide. */
  get(): Profile {
    try {
      const parsed = ProfileSchema.safeParse(JSON.parse(fs.readFileSync(this.file, "utf8")));
      return parsed.success ? parsed.data : EMPTY_PROFILE;
    } catch {
      return EMPTY_PROFILE;
    }
  }

  save(profile: Profile): void {
    const valid = ProfileSchema.parse(profile);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(valid, null, 2));
    fs.renameSync(tmp, this.file);
  }
}
