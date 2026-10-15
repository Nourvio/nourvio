CREATE TABLE "shop_connections" (
	"household_id" uuid NOT NULL,
	"shop" text NOT NULL,
	"store" jsonb,
	"modality" text DEFAULT 'PICKUP' NOT NULL,
	"account" jsonb,
	"last_sent" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_connections_household_id_shop_pk" PRIMARY KEY("household_id","shop")
);
--> statement-breakpoint
CREATE TABLE "store_products" (
	"household_id" uuid NOT NULL,
	"shop" text NOT NULL,
	"food" text NOT NULL,
	"product" jsonb NOT NULL,
	"chosen" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_products_household_id_shop_food_pk" PRIMARY KEY("household_id","shop","food")
);
--> statement-breakpoint
ALTER TABLE "shop_connections" ADD CONSTRAINT "shop_connections_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;