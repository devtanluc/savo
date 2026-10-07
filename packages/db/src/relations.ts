import { defineRelations } from "drizzle-orm";

import * as schema from "./schema";

export const relations = {
	...defineRelations(schema),
	...schema.authRelations,
	...schema.billingRelations,
	...schema.feedsRelations,
	...schema.libraryRelations,
	...schema.opsRelations,
};
