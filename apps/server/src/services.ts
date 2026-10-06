import { createAuth } from "@savo/auth";
import { createDb } from "@savo/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
