CREATE TABLE "recipe_pairings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"paired_recipe_id" uuid,
	"tag" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipe_pairings" ADD CONSTRAINT "recipe_pairings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_pairings" ADD CONSTRAINT "recipe_pairings_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_pairings" ADD CONSTRAINT "recipe_pairings_paired_recipe_id_recipes_id_fk" FOREIGN KEY ("paired_recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_pairings_recipe_id_index" ON "recipe_pairings" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_pairings_paired_recipe_id_index" ON "recipe_pairings" USING btree ("paired_recipe_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_pairings_recipe_unique" ON "recipe_pairings" USING btree ("recipe_id","paired_recipe_id") WHERE "recipe_pairings"."paired_recipe_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_pairings_tag_unique" ON "recipe_pairings" USING btree ("recipe_id",lower("tag")) WHERE "recipe_pairings"."tag" is not null;