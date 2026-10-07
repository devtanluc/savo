import { createId } from "@paralleldrive/cuid2";
import { customType, text, timestamp } from "drizzle-orm/pg-core";

export const pk = () =>
	text("id")
		.primaryKey()
		.$defaultFn(() => createId());

/** timestamptz luôn luôn (bảng auth do Better Auth sinh ra dùng timestamp không tz, để nguyên). */
export const tstz = (name: string) =>
	timestamp(name, { withTimezone: true, mode: "date" });

export const timestamps = () => ({
	createdAt: tstz("created_at").defaultNow().notNull(),
	updatedAt: tstz("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});

/** Postgres full-text search vector. Chỉ dùng làm generated column (read-only từ app). */
export const tsvector = customType<{ data: string }>({
	dataType() {
		return "tsvector";
	},
});
