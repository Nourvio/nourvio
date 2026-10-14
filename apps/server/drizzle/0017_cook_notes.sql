CREATE TABLE "cook_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"user_id" uuid,
	"rating" smallint,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cook_notes_rating_check" CHECK ("cook_notes"."rating" is null or "cook_notes"."rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "cook_notes" ADD CONSTRAINT "cook_notes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cook_notes" ADD CONSTRAINT "cook_notes_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cook_notes" ADD CONSTRAINT "cook_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cook_notes_recipe_id_created_at_index" ON "cook_notes" USING btree ("recipe_id","created_at");