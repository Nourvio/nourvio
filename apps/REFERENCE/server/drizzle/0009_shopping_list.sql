CREATE TABLE "food_sections" (
	"household_id" uuid NOT NULL,
	"food" text NOT NULL,
	"section_id" text NOT NULL,
	CONSTRAINT "food_sections_household_id_food_pk" PRIMARY KEY("household_id","food")
);
--> statement-breakpoint
CREATE TABLE "shopping_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"quantity" real,
	"unit_id" text,
	"amount_text" text,
	"section_id" text DEFAULT 'other' NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"checked_at" timestamp with time zone,
	"source" text NOT NULL,
	"recipes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount" text,
	"section_id" text DEFAULT 'other' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD COLUMN "listed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "food_sections" ADD CONSTRAINT "food_sections_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_sections" ADD CONSTRAINT "food_sections_section_id_store_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."store_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_section_id_store_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."store_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_items" ADD CONSTRAINT "weekly_items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_items" ADD CONSTRAINT "weekly_items_section_id_store_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."store_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shopping_items_household_id_checked_index" ON "shopping_items" USING btree ("household_id","checked");--> statement-breakpoint
CREATE INDEX "weekly_items_household_id_index" ON "weekly_items" USING btree ("household_id");