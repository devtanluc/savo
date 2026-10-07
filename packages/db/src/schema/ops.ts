import { defineRelationsPart } from "drizzle-orm";
import {
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
} from "drizzle-orm/pg-core";

import { pk, timestamps, tstz } from "./_helpers";
import { user } from "./auth";

export const importType = pgEnum("import_type", [
	"browser_html", // Netscape bookmarks (Chrome/Firefox/Safari)
	"pocket",
	"instapaper",
	"raindrop_csv",
	"omnivore", // export JSON của Omnivore — nhiều người dùng cũ đang cần chỗ chuyển đến
	"opml", // feeds
	"savo_json", // export của chính Savo
]);

export const importStatus = pgEnum("import_status", [
	"queued",
	"running",
	"completed",
	"failed",
	"canceled",
]);

export type ImportRowError = { row: number; value?: string; reason: string };

export const importJob = pgTable(
	"import_job",
	{
		id: pk(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		type: importType("type").notNull(),
		status: importStatus("status").default("queued").notNull(),
		fileName: text("file_name"),
		/** Tham chiếu tới file nguồn đã upload (object storage / bảng tạm). Xoá khi job xong. */
		sourceRef: text("source_ref"),
		totalCount: integer("total_count").default(0).notNull(),
		processedCount: integer("processed_count").default(0).notNull(),
		successCount: integer("success_count").default(0).notNull(),
		skippedCount: integer("skipped_count").default(0).notNull(), // trùng URL / vượt quota
		failedCount: integer("failed_count").default(0).notNull(),
		/** Báo cáo lỗi từng dòng; giới hạn ~500 phần tử ở tầng service. */
		errors: jsonb("errors").$type<ImportRowError[]>(),
		startedAt: tstz("started_at"),
		finishedAt: tstz("finished_at"),
		...timestamps(),
	},
	(t) => [index("import_job_user_idx").on(t.userId, t.createdAt.desc())],
);

/**
 * Hành động nhạy cảm (đổi email/mật khẩu, tạo/thu hồi API key, export, xoá tài khoản, đổi gói).
 * user_id KHÔNG cascade: khi xoá tài khoản vẫn giữ bằng chứng "đã xoá" (user_id về null).
 * Không lưu nội dung người dùng ở đây.
 */
export const auditLog = pgTable(
	"audit_log",
	{
		id: pk(),
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
		action: text("action").notNull(), // vd "apikey.create", "account.delete"
		targetType: text("target_type"),
		targetId: text("target_id"),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		createdAt: tstz("created_at").defaultNow().notNull(),
	},
	(t) => [
		index("audit_log_user_idx").on(t.userId, t.createdAt.desc()),
		index("audit_log_action_idx").on(t.action, t.createdAt.desc()),
	],
);

export const opsRelations = defineRelationsPart(
	{ user, importJob, auditLog },
	(r) => ({
		importJob: {
			user: r.one.user({ from: r.importJob.userId, to: r.user.id }),
		},
		auditLog: {
			user: r.one.user({ from: r.auditLog.userId, to: r.user.id }),
		},
	}),
);
