import type { Database } from "../db/client.js";
import type { ISODate } from "../domain/dates.js";
import type { Settings } from "../services/settings.js";

export interface Deps {
  db: Database;
  now: () => Date;
  settings: Settings;
  /** Today's calendar date in the institution's time zone. */
  today: () => ISODate;
}
