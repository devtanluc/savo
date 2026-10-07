import { defineRelationsPart } from "drizzle-orm";
import {
	boolean,
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { pk, timestamps, tstz } from "./_helpers";
import { user } from "./auth";

/**
 * Polar là nguồn sự thật (merchant of record). Bảng `subscription` chỉ là BẢN SAO cục bộ,
 * được cập nhật bởi webhook, để getEntitlements() không phải gọi API Polar mỗi request.
 * Không có dòng nào hoặc không còn active → plan Free (xem packages/core/entitlements).
 */

export const subscriptionStatus = pgEnum("subscription_status", [
	"incomplete",
	"trialing",
	"active",
	"past_due",
	"canceled", // đã huỷ nhưng còn hạn đến current_period_end (cancel_at_period_end)
	"revoked", // mất quyền ngay (refund/chargeback/hết hạn)
	"unpaid",
]);

export const subscriptionInterval = pgEnum("subscription_interval", [
	"month",
	"year",
]);

export const subscription = pgTable(
	"subscription",
	{
		id: pk(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		polarSubscriptionId: text("polar_subscription_id").notNull(),
		polarCustomerId: text("polar_customer_id").notNull(),
		polarProductId: text("polar_product_id").notNull(),
		status: subscriptionStatus("status").notNull(),
		interval: subscriptionInterval("interval"),
		currentPeriodStart: tstz("current_period_start"),
		currentPeriodEnd: tstz("current_period_end"),
		cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
		canceledAt: tstz("canceled_at"),
		endedAt: tstz("ended_at"),
		...timestamps(),
	},
	(t) => [
		uniqueIndex("subscription_polar_id_uq").on(t.polarSubscriptionId),
		index("subscription_user_idx").on(t.userId, t.status),
		index("subscription_customer_idx").on(t.polarCustomerId),
	],
);

/**
 * Idempotency cho webhook: PK = id sự kiện (header `webhook-id` của Polar/Standard Webhooks).
 * Luồng: INSERT ... ON CONFLICT DO NOTHING → nếu đã có và processed_at != null thì bỏ qua.
 * Giữ payload để replay/debug; job dọn xoá sau ~90 ngày.
 */
export const webhookEvent = pgTable(
	"webhook_event",
	{
		id: text("id").primaryKey(),
		provider: text("provider").default("polar").notNull(),
		type: text("type").notNull(),
		payload: jsonb("payload").notNull(),
		receivedAt: tstz("received_at").defaultNow().notNull(),
		processedAt: tstz("processed_at"),
		error: text("error"),
	},
	(t) => [
		index("webhook_event_received_idx").on(t.receivedAt),
		index("webhook_event_type_idx").on(t.type, t.receivedAt),
	],
);

export const billingRelations = defineRelationsPart(
	{ user, subscription },
	(r) => ({
		subscription: {
			user: r.one.user({ from: r.subscription.userId, to: r.user.id }),
		},
	}),
);
