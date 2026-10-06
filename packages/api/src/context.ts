import type { Session } from "@savo/auth";
import type { Database } from "@savo/db";

export type Context = {
  session: Session | null;
  db: Database;
};
