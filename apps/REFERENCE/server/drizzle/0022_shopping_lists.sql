CREATE TABLE "food_lists" (
	"household_id" uuid NOT NULL,
	"food" text NOT NULL,
	"list_id" text NOT NULL,
	CONSTRAINT "food_lists_household_id_food_pk" PRIMARY KEY("household_id","food")
);
--> statement-breakpoint
ALTER TABLE "shopping_items" ADD COLUMN "list_id" text;--> statement-breakpoint
ALTER TABLE "food_lists" ADD CONSTRAINT "food_lists_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;