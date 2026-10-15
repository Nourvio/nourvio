CREATE TABLE "store_prices" (
	"household_id" uuid NOT NULL,
	"shop" text NOT NULL,
	"product_id" text NOT NULL,
	"day" date NOT NULL,
	"price" real,
	"sale_price" real,
	"sale_ends" date,
	CONSTRAINT "store_prices_household_id_shop_product_id_day_pk" PRIMARY KEY("household_id","shop","product_id","day")
);
--> statement-breakpoint
ALTER TABLE "shop_connections" ADD COLUMN "prices_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shop_connections" ADD COLUMN "price_searches" jsonb;--> statement-breakpoint
ALTER TABLE "store_prices" ADD CONSTRAINT "store_prices_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;