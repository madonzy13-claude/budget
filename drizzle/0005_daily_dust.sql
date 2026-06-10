CREATE TABLE "budgeting"."supported_currencies" (
	"iso_code" varchar(10) PRIMARY KEY NOT NULL,
	"iso_numeric" integer,
	"name" text NOT NULL,
	"symbol" text,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgeting"."fx_rates" (
	"base" char(3) NOT NULL,
	"quote" char(3) NOT NULL,
	"date" date NOT NULL,
	"rate" numeric(19, 8) NOT NULL,
	"provider" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rates_base_quote_date_pk" PRIMARY KEY("base","quote","date")
);
