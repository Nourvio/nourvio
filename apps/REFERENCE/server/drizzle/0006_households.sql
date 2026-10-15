CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by" uuid,
	CONSTRAINT "invites_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "recipes" DROP CONSTRAINT "recipes_slug_unique";--> statement-breakpoint
ALTER TABLE "recipes" DROP CONSTRAINT "recipes_externalRef_unique";--> statement-breakpoint
DROP INDEX "tags_name_lower_index";--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD COLUMN "household_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "household_id" uuid;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "household_id" uuid;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "household_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "household_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_server_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Hand-written: an existing install's people and recipes become one household,
-- and its admins run the server. A new install has nothing to move.
INSERT INTO "households" ("name") SELECT 'Home' WHERE EXISTS (SELECT 1 FROM "users") OR EXISTS (SELECT 1 FROM "recipes");--> statement-breakpoint
UPDATE "users" SET "household_id" = (SELECT "id" FROM "households" LIMIT 1), "is_server_admin" = ("role" = 'admin');--> statement-breakpoint
UPDATE "recipes" SET "household_id" = (SELECT "id" FROM "households" LIMIT 1);--> statement-breakpoint
UPDATE "tags" SET "household_id" = (SELECT "id" FROM "households" LIMIT 1);--> statement-breakpoint
UPDATE "ai_jobs" SET "household_id" = (SELECT "id" FROM "households" LIMIT 1);--> statement-breakpoint
UPDATE "ai_usage" SET "household_id" = (SELECT "id" FROM "households" LIMIT 1);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "household_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ALTER COLUMN "household_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "household_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_jobs" ALTER COLUMN "household_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invites_household_id_index" ON "invites" USING btree ("household_id");--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recipes_household_slug_index" ON "recipes" USING btree ("household_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "recipes_household_external_ref_index" ON "recipes" USING btree ("household_id","external_ref");--> statement-breakpoint
CREATE INDEX "recipes_household_id_created_at_index" ON "recipes" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_household_name_lower_index" ON "tags" USING btree ("household_id",lower("name"));--> statement-breakpoint
CREATE INDEX "users_household_id_index" ON "users" USING btree ("household_id");