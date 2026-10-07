import { defineRelationsPart, sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	smallint,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { pk, timestamps, tstz, tsvector } from "./_helpers";
import { user } from "./auth";
import { feedItem } from "./feeds";

/**
 * Yêu cầu hạ tầng (xem migration `extensions`): extension `unaccent`, `pg_trgm`
 * và hàm IMMUTABLE `f_unaccent(text)`. Generated column bên dưới phụ thuộc vào chúng,
 * nên migration đó PHẢI chạy trước migration tạo bảng này.
 */

/** Trạng thái người dùng đặt cho link (tương đương folder inbox/archive của Omnivore). */
export const linkState = pgEnum("link_state", ["inbox", "later", "archived"]);

/** Trạng thái pipeline lấy nội dung (chạy nền ở worker). */
export const linkStatus = pgEnum("link_status", [
	"pending",
	"processing",
	"ready",
	"failed",
]);

export const linkSource = pgEnum("link_source", [
	"web",
	"extension",
	"api",
	"import",
	"feed",
	"share", // PWA share target
]);

export const link = pgTable(
	"link",
	{
		id: pk(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),

		// --- danh tính URL ---
		/** URL người dùng nhập, giữ nguyên để hiển thị/"mở bản gốc". */
		url: text("url").notNull(),
		/** URL sau normalizeUrl() (bỏ tracking params, lowercase host...) — dùng chống trùng. */
		normalizedUrl: text("normalized_url").notNull(),
		/** `<link rel=canonical>` nếu extract được. */
		canonicalUrl: text("canonical_url"),
		domain: text("domain").notNull(),

		// --- metadata (điền bởi worker, người dùng có thể sửa title) ---
		title: text("title"),
		description: text("description"),
		imageUrl: text("image_url"),
		faviconUrl: text("favicon_url"),
		author: text("author"),
		siteName: text("site_name"),
		publishedAt: tstz("published_at"),
		lang: text("lang"),
		wordCount: integer("word_count"),
		readingTimeMin: integer("reading_time_min"),

		// --- pipeline ---
		status: linkStatus("status").default("pending").notNull(),
		failReason: text("fail_reason"),
		extractAttempts: integer("extract_attempts").default(0).notNull(),
		extractedAt: tstz("extracted_at"),

		// --- trạng thái người dùng ---
		state: linkState("state").default("inbox").notNull(),
		isFavorite: boolean("is_favorite").default(false).notNull(),
		/** 0–100. Vị trí đọc chi tiết (anchor) để dành cho Phase reader. */
		readProgress: smallint("read_progress").default(0).notNull(),
		readAt: tstz("read_at"),
		note: text("note"),
		source: linkSource("source").default("web").notNull(),
		/** Nếu link được lưu từ một bài trong feed. */
		feedItemId: text("feed_item_id").references(() => feedItem.id, {
			onDelete: "set null",
		}),

		/**
		 * Thời điểm "lưu" — tách khỏi created_at để import giữ được ngày lưu gốc
		 * và là khoá sắp xếp mặc định của thư viện.
		 */
		savedAt: tstz("saved_at").defaultNow().notNull(),
		archivedAt: tstz("archived_at"),
		/** Soft delete (undo, sync với extension/mobile). Job nền xoá cứng sau N ngày. */
		deletedAt: tstz("deleted_at"),

		/**
		 * Search vector cho metadata (miễn phí cho gói Free).
		 * A: title · B: description + note · C: author/site/domain.
		 * Nội dung bài (trọng số D) nằm ở link_content.search_vector.
		 * Config 'simple' + f_unaccent: không stemming, nhưng đúng cho tiếng Việt có/không dấu và đa ngôn ngữ.
		 * Dùng tên cột raw trong SQL để tránh vòng tham chiếu kiểu TS khi tự tham chiếu bảng.
		 */
		searchVector: tsvector("search_vector").generatedAlwaysAs(
			sql`
        setweight(to_tsvector('simple', f_unaccent(coalesce(title, ''))), 'A') ||
        setweight(to_tsvector('simple', f_unaccent(coalesce(description, '') || ' ' || coalesce(note, ''))), 'B') ||
        setweight(to_tsvector('simple', f_unaccent(coalesce(author, '') || ' ' || coalesce(site_name, '') || ' ' || coalesce(domain, ''))), 'C')
      `,
		),

		...timestamps(),
	},
	(t) => [
		// Chống trùng, nhưng cho phép lưu lại link đã xoá mềm.
		uniqueIndex("link_user_normalized_url_uq")
			.on(t.userId, t.normalizedUrl)
			.where(sql`${t.deletedAt} is null`),
		// Danh sách chính: lọc state, sắp xếp saved_at desc, cursor (saved_at, id).
		index("link_user_state_saved_idx")
			.on(t.userId, t.state, t.savedAt.desc(), t.id.desc())
			.where(sql`${t.deletedAt} is null`),
		index("link_user_favorite_idx")
			.on(t.userId, t.savedAt.desc())
			.where(sql`${t.isFavorite} and ${t.deletedAt} is null`),
		index("link_user_domain_idx").on(t.userId, t.domain),
		index("link_feed_item_idx").on(t.feedItemId),
		// Job dọn xoá cứng.
		index("link_deleted_at_idx")
			.on(t.deletedAt)
			.where(sql`${t.deletedAt} is not null`),
		index("link_search_vector_idx").using("gin", t.searchVector),
		// Gõ gần đúng title (pg_trgm). Biến thể có unaccent: thêm expression index ở migration tay khi cần.
		index("link_title_trgm_idx").using("gin", t.title.op("gin_trgm_ops")),
		check("link_read_progress_chk", sql`${t.readProgress} between 0 and 100`),
	],
);

/**
 * Nội dung nặng tách riêng để query danh sách không kéo theo HTML/text.
 * 1–1 với link (PK = link_id).
 */
export const linkContent = pgTable(
	"link_content",
	{
		linkId: text("link_id")
			.primaryKey()
			.references(() => link.id, { onDelete: "cascade" }),
		/** HTML đã sanitize bằng allowlist — an toàn để render trong reader. */
		htmlSanitized: text("html_sanitized").notNull(),
		/** Text thuần, dùng cho search (Pro) & AI sau này. */
		text: text("text").notNull(),
		/** Hash nội dung để bỏ qua ghi lại khi extract lần nữa không đổi. */
		contentHash: text("content_hash"),
		/** URL cuối cùng sau redirect. */
		finalUrl: text("final_url"),
		/** vd "readability@0.6" — để biết bài nào cần extract lại khi nâng cấp extractor. */
		extractor: text("extractor"),
		fetchedAt: tstz("fetched_at").defaultNow().notNull(),

		/** Trọng số D. Giới hạn 400k ký tự (tsvector tối đa 1MB). */
		searchVector: tsvector("search_vector").generatedAlwaysAs(
			sql`setweight(to_tsvector('simple', left(f_unaccent(coalesce(text, '')), 400000)), 'D')`,
		),
		...timestamps(),
	},
	(t) => [index("link_content_search_vector_idx").using("gin", t.searchVector)],
);

export const tag = pgTable(
	"tag",
	{
		id: pk(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		/** slug đã bỏ dấu/lowercase — khoá duy nhất theo user ("Đọc Sau" và "doc sau" là một). */
		slug: text("slug").notNull(),
		color: text("color"),
		...timestamps(),
	},
	(t) => [uniqueIndex("tag_user_slug_uq").on(t.userId, t.slug)],
);

export const linkTag = pgTable(
	"link_tag",
	{
		linkId: text("link_id")
			.notNull()
			.references(() => link.id, { onDelete: "cascade" }),
		tagId: text("tag_id")
			.notNull()
			.references(() => tag.id, { onDelete: "cascade" }),
		createdAt: tstz("created_at").defaultNow().notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.linkId, t.tagId] }),
		// "tất cả link của tag X"
		index("link_tag_tag_idx").on(t.tagId),
	],
);

// Lưu ý: link_tag không có user_id → service BẮT BUỘC kiểm tra link và tag cùng user
// trước khi gán (và có test IDOR).
export const libraryRelations = defineRelationsPart(
	{ user, link, linkContent, tag, linkTag, feedItem },
	(r) => ({
		link: {
			user: r.one.user({ from: r.link.userId, to: r.user.id }),
			content: r.one.linkContent({
				from: r.link.id,
				to: r.linkContent.linkId,
			}),
			feedItem: r.one.feedItem({
				from: r.link.feedItemId,
				to: r.feedItem.id,
			}),
			tags: r.many.tag({
				from: r.link.id.through(r.linkTag.linkId),
				to: r.tag.id.through(r.linkTag.tagId),
			}),
		},
		linkContent: {
			link: r.one.link({ from: r.linkContent.linkId, to: r.link.id }),
		},
		tag: {
			user: r.one.user({ from: r.tag.userId, to: r.user.id }),
			links: r.many.link({
				from: r.tag.id.through(r.linkTag.tagId),
				to: r.link.id.through(r.linkTag.linkId),
			}),
		},
		linkTag: {
			link: r.one.link({ from: r.linkTag.linkId, to: r.link.id }),
			tag: r.one.tag({ from: r.linkTag.tagId, to: r.tag.id }),
		},
	}),
);
