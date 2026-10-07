CREATE TYPE "subscription_interval" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TYPE "subscription_status" AS ENUM('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'revoked', 'unpaid');--> statement-breakpoint
CREATE TYPE "feed_status" AS ENUM('active', 'paused', 'error');--> statement-breakpoint
CREATE TYPE "link_source" AS ENUM('web', 'extension', 'api', 'import', 'feed', 'share');--> statement-breakpoint
CREATE TYPE "link_state" AS ENUM('inbox', 'later', 'archived');--> statement-breakpoint
CREATE TYPE "link_status" AS ENUM('pending', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "import_status" AS ENUM('queued', 'running', 'completed', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "import_type" AS ENUM('browser_html', 'pocket', 'instapaper', 'raindrop_csv', 'omnivore', 'opml', 'savo_json');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"polar_subscription_id" text NOT NULL,
	"polar_customer_id" text NOT NULL,
	"polar_product_id" text NOT NULL,
	"status" "subscription_status" NOT NULL,
	"interval" "subscription_interval",
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_event" (
	"id" text PRIMARY KEY,
	"provider" text DEFAULT 'polar' NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "feed" (
	"id" text PRIMARY KEY,
	"url" text NOT NULL,
	"site_url" text,
	"title" text,
	"description" text,
	"icon_url" text,
	"lang" text,
	"status" "feed_status" DEFAULT 'active'::"feed_status" NOT NULL,
	"etag" text,
	"last_modified" text,
	"last_fetched_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"next_fetch_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fetch_interval_sec" integer DEFAULT 3600 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_folder" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_folder_user_name_uq" UNIQUE("user_id","name")
);
--> statement-breakpoint
CREATE TABLE "feed_item" (
	"id" text PRIMARY KEY,
	"feed_id" text NOT NULL,
	"guid" text NOT NULL,
	"url" text,
	"title" text,
	"summary" text,
	"content_html" text,
	"author" text,
	"image_url" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_item_feed_guid_uq" UNIQUE("feed_id","guid")
);
--> statement-breakpoint
CREATE TABLE "feed_item_read" (
	"user_id" text,
	"feed_item_id" text,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_item_read_pkey" PRIMARY KEY("user_id","feed_item_id")
);
--> statement-breakpoint
CREATE TABLE "feed_subscription" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"feed_id" text NOT NULL,
	"folder_id" text,
	"custom_title" text,
	"read_before" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_subscription_user_feed_uq" UNIQUE("user_id","feed_id")
);
--> statement-breakpoint
CREATE TABLE "link" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"url" text NOT NULL,
	"normalized_url" text NOT NULL,
	"canonical_url" text,
	"domain" text NOT NULL,
	"title" text,
	"description" text,
	"image_url" text,
	"favicon_url" text,
	"author" text,
	"site_name" text,
	"published_at" timestamp with time zone,
	"lang" text,
	"word_count" integer,
	"reading_time_min" integer,
	"status" "link_status" DEFAULT 'pending'::"link_status" NOT NULL,
	"fail_reason" text,
	"extract_attempts" integer DEFAULT 0 NOT NULL,
	"extracted_at" timestamp with time zone,
	"state" "link_state" DEFAULT 'inbox'::"link_state" NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"read_progress" smallint DEFAULT 0 NOT NULL,
	"read_at" timestamp with time zone,
	"note" text,
	"source" "link_source" DEFAULT 'web'::"link_source" NOT NULL,
	"feed_item_id" text,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"search_vector" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', f_unaccent(coalesce(title, ''))), 'A') ||
        setweight(to_tsvector('simple', f_unaccent(coalesce(description, '') || ' ' || coalesce(note, ''))), 'B') ||
        setweight(to_tsvector('simple', f_unaccent(coalesce(author, '') || ' ' || coalesce(site_name, '') || ' ' || coalesce(domain, ''))), 'C')
      ) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "link_read_progress_chk" CHECK ("read_progress" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "link_content" (
	"link_id" text PRIMARY KEY,
	"html_sanitized" text NOT NULL,
	"text" text NOT NULL,
	"content_hash" text,
	"final_url" text,
	"extractor" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_vector" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('simple', left(f_unaccent(coalesce(text, '')), 400000)), 'D')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link_tag" (
	"link_id" text,
	"tag_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "link_tag_pkey" PRIMARY KEY("link_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY,
	"user_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_job" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"type" "import_type" NOT NULL,
	"status" "import_status" DEFAULT 'queued'::"import_status" NOT NULL,
	"file_name" text,
	"source_ref" text,
	"total_count" integer DEFAULT 0 NOT NULL,
	"processed_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"errors" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_polar_id_uq" ON "subscription" ("polar_subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_user_idx" ON "subscription" ("user_id","status");--> statement-breakpoint
CREATE INDEX "subscription_customer_idx" ON "subscription" ("polar_customer_id");--> statement-breakpoint
CREATE INDEX "webhook_event_received_idx" ON "webhook_event" ("received_at");--> statement-breakpoint
CREATE INDEX "webhook_event_type_idx" ON "webhook_event" ("type","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feed_url_uq" ON "feed" ("url");--> statement-breakpoint
CREATE INDEX "feed_due_idx" ON "feed" ("next_fetch_at") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX "feed_item_feed_published_idx" ON "feed_item" ("feed_id","published_at" DESC NULLS LAST,"created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "feed_item_read_item_idx" ON "feed_item_read" ("feed_item_id");--> statement-breakpoint
CREATE INDEX "feed_subscription_feed_idx" ON "feed_subscription" ("feed_id");--> statement-breakpoint
CREATE INDEX "feed_subscription_folder_idx" ON "feed_subscription" ("folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "link_user_normalized_url_uq" ON "link" ("user_id","normalized_url") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "link_user_state_saved_idx" ON "link" ("user_id","state","saved_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "link_user_favorite_idx" ON "link" ("user_id","saved_at" DESC NULLS LAST) WHERE "is_favorite" and "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "link_user_domain_idx" ON "link" ("user_id","domain");--> statement-breakpoint
CREATE INDEX "link_feed_item_idx" ON "link" ("feed_item_id");--> statement-breakpoint
CREATE INDEX "link_deleted_at_idx" ON "link" ("deleted_at") WHERE "deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "link_search_vector_idx" ON "link" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "link_title_trgm_idx" ON "link" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "link_content_search_vector_idx" ON "link_content" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "link_tag_tag_idx" ON "link_tag" ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_user_slug_uq" ON "tag" ("user_id","slug");--> statement-breakpoint
CREATE INDEX "audit_log_user_idx" ON "audit_log" ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" ("action","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "import_job_user_idx" ON "import_job" ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feed_folder" ADD CONSTRAINT "feed_folder_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feed_item" ADD CONSTRAINT "feed_item_feed_id_feed_id_fkey" FOREIGN KEY ("feed_id") REFERENCES "feed"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feed_item_read" ADD CONSTRAINT "feed_item_read_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feed_item_read" ADD CONSTRAINT "feed_item_read_feed_item_id_feed_item_id_fkey" FOREIGN KEY ("feed_item_id") REFERENCES "feed_item"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feed_subscription" ADD CONSTRAINT "feed_subscription_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feed_subscription" ADD CONSTRAINT "feed_subscription_feed_id_feed_id_fkey" FOREIGN KEY ("feed_id") REFERENCES "feed"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feed_subscription" ADD CONSTRAINT "feed_subscription_folder_id_feed_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "feed_folder"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "link" ADD CONSTRAINT "link_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "link" ADD CONSTRAINT "link_feed_item_id_feed_item_id_fkey" FOREIGN KEY ("feed_item_id") REFERENCES "feed_item"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "link_content" ADD CONSTRAINT "link_content_link_id_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "link"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "link_tag" ADD CONSTRAINT "link_tag_link_id_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "link"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "link_tag" ADD CONSTRAINT "link_tag_tag_id_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "import_job" ADD CONSTRAINT "import_job_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;