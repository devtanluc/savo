import { defineRelationsPart, sql } from "drizzle-orm";
import {
	index,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	unique,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { pk, timestamps, tstz } from "./_helpers";
import { user } from "./auth";

/**
 * Feeds là tài nguyên DÙNG CHUNG giữa các user: một URL feed = một dòng `feed`,
 * fetch một lần, nhiều user subscribe qua `feed_subscription`.
 */

export const feedStatus = pgEnum("feed_status", [
	"active", // đang poll bình thường
	"paused", // tạm dừng do lỗi kéo dài hoặc không còn subscriber
	"error", // lỗi vĩnh viễn (410 Gone, không parse được...) cần người dùng xử lý
]);

export const feed = pgTable(
	"feed",
	{
		id: pk(),
		/** URL feed đã chuẩn hoá — khoá nhận diện duy nhất. */
		url: text("url").notNull(),
		siteUrl: text("site_url"),
		title: text("title"),
		description: text("description"),
		iconUrl: text("icon_url"),
		lang: text("lang"),

		// --- trạng thái polling (conditional GET + backoff) ---
		status: feedStatus("status").default("active").notNull(),
		etag: text("etag"),
		lastModified: text("last_modified"),
		lastFetchedAt: tstz("last_fetched_at"),
		lastSuccessAt: tstz("last_success_at"),
		nextFetchAt: tstz("next_fetch_at").defaultNow().notNull(),
		fetchIntervalSec: integer("fetch_interval_sec").default(3600).notNull(),
		errorCount: integer("error_count").default(0).notNull(),
		lastError: text("last_error"),
		...timestamps(),
	},
	(t) => [
		uniqueIndex("feed_url_uq").on(t.url),
		// Scheduler: "feed nào đến hạn?" — partial index chỉ chứa feed active.
		index("feed_due_idx").on(t.nextFetchAt).where(sql`${t.status} = 'active'`),
	],
);

export const feedFolder = pgTable(
	"feed_folder",
	{
		id: pk(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		position: integer("position").default(0).notNull(),
		...timestamps(),
	},
	(t) => [unique("feed_folder_user_name_uq").on(t.userId, t.name)],
);

export const feedSubscription = pgTable(
	"feed_subscription",
	{
		id: pk(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		feedId: text("feed_id")
			.notNull()
			.references(() => feed.id, { onDelete: "cascade" }),
		folderId: text("folder_id").references(() => feedFolder.id, {
			onDelete: "set null",
		}),
		customTitle: text("custom_title"),
		/**
		 * "Đánh dấu tất cả đã đọc" chỉ cần set cột này = now(); không phải ghi N dòng.
		 * Một feed_item là CHƯA ĐỌC khi: published/created sau `readBefore`
		 * VÀ không có dòng trong `feed_item_read`.
		 */
		readBefore: tstz("read_before"),
		...timestamps(),
	},
	(t) => [
		unique("feed_subscription_user_feed_uq").on(t.userId, t.feedId),
		index("feed_subscription_feed_idx").on(t.feedId),
		index("feed_subscription_folder_idx").on(t.folderId),
	],
);

export const feedItem = pgTable(
	"feed_item",
	{
		id: pk(),
		feedId: text("feed_id")
			.notNull()
			.references(() => feed.id, { onDelete: "cascade" }),
		/** guid của feed; nếu feed không có guid thì service dùng hash(url|title). */
		guid: text("guid").notNull(),
		url: text("url"),
		title: text("title"),
		summary: text("summary"),
		/** HTML đã sanitize (nếu feed có full content). Rỗng → khi user lưu mới extract đầy đủ. */
		contentHtml: text("content_html"),
		author: text("author"),
		imageUrl: text("image_url"),
		publishedAt: tstz("published_at"),
		createdAt: tstz("created_at").defaultNow().notNull(),
	},
	(t) => [
		// Dedup khi poll lại: INSERT ... ON CONFLICT DO NOTHING
		unique("feed_item_feed_guid_uq").on(t.feedId, t.guid),
		index("feed_item_feed_published_idx").on(
			t.feedId,
			t.publishedAt.desc(),
			t.createdAt.desc(),
		),
	],
);

/**
 * Sự hiện diện của dòng = bài đã đọc (đánh dấu chưa đọc = xoá dòng).
 * Dòng chỉ được tạo khi user đọc từng bài; mark-all-read dùng feed_subscription.read_before.
 * "Đã lưu vào Library" được suy ra từ link.feed_item_id (không lưu lặp ở đây).
 */
export const feedItemRead = pgTable(
	"feed_item_read",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		feedItemId: text("feed_item_id")
			.notNull()
			.references(() => feedItem.id, { onDelete: "cascade" }),
		readAt: tstz("read_at").defaultNow().notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.userId, t.feedItemId] }),
		// Phục vụ cascade khi job dọn feed_item cũ.
		index("feed_item_read_item_idx").on(t.feedItemId),
	],
);

// Ghi chú: không định nghĩa quan hệ trên key `user` ở part này (key `user` thuộc authRelations,
// spread nhiều part cùng key sẽ ghi đè nhau). Truy vấn luôn bắt đầu từ bảng domain + where userId.
export const feedsRelations = defineRelationsPart(
	{ user, feed, feedFolder, feedSubscription, feedItem, feedItemRead },
	(r) => ({
		feed: {
			subscriptions: r.many.feedSubscription({
				from: r.feed.id,
				to: r.feedSubscription.feedId,
			}),
			items: r.many.feedItem({
				from: r.feed.id,
				to: r.feedItem.feedId,
			}),
		},
		feedFolder: {
			user: r.one.user({ from: r.feedFolder.userId, to: r.user.id }),
			subscriptions: r.many.feedSubscription({
				from: r.feedFolder.id,
				to: r.feedSubscription.folderId,
			}),
		},
		feedSubscription: {
			user: r.one.user({ from: r.feedSubscription.userId, to: r.user.id }),
			feed: r.one.feed({
				from: r.feedSubscription.feedId,
				to: r.feed.id,
			}),
			folder: r.one.feedFolder({
				from: r.feedSubscription.folderId,
				to: r.feedFolder.id,
			}),
		},
		feedItem: {
			feed: r.one.feed({ from: r.feedItem.feedId, to: r.feed.id }),
			reads: r.many.feedItemRead({
				from: r.feedItem.id,
				to: r.feedItemRead.feedItemId,
			}),
		},
		feedItemRead: {
			user: r.one.user({ from: r.feedItemRead.userId, to: r.user.id }),
			feedItem: r.one.feedItem({
				from: r.feedItemRead.feedItemId,
				to: r.feedItem.id,
			}),
		},
	}),
);
