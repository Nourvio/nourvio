CREATE TABLE "fdc_foods" (
	"fdc_id" integer PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"data_type" text NOT NULL,
	"nutrients" jsonb NOT NULL,
	"portions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_matches" (
	"food" text PRIMARY KEY NOT NULL,
	"fdc_id" integer,
	"grams" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
