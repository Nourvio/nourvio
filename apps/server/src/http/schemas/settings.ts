import { z } from "@hono/zod-openapi"

export const SettingStateSchema = z
  .object({
    key: z.string().openapi({ example: "errorTracking.environment" }),
    kind: z.enum(["text", "number", "switch", "choice", "list", "secret"]),
    value: z.unknown().openapi({
      description:
        "Its value, or null for a secret or a setting that isn't set.",
    }),
    default: z.unknown(),
    source: z.enum(["default", "saved", "environment"]),
    lockedBy: z.string().nullable().openapi({
      description:
        "The environment variable that sets it, which means it can't be changed here.",
      example: "MERRAN_SENTRY_ENVIRONMENT",
    }),
    secret: z
      .object({
        set: z.boolean(),
        hint: z.string().nullable().openapi({
          description: "Its last four characters, when it's long enough.",
        }),
        unreadable: z.boolean().openapi({
          description:
            "Sealed with another master key, so it needs entering again.",
        }),
      })
      .optional(),
    choices: z.array(z.string()).optional(),
  })
  .openapi("SettingState")

export const SettingChangesSchema = z
  .record(z.string(), z.unknown())
  .openapi("SettingChanges", {
    description:
      "New values by key. Null puts a setting back to its default, and deletes a secret.",
    example: {
      "errorTracking.environment": "home",
      "errorTracking.dsn": null,
    },
  })

export const ServerSettingsSchema = z
  .object({
    about: z.object({
      version: z.string(),
      installMethod: z.enum(["source", "docker"]),
      database: z.enum(["sqlite", "postgres"]),
      publicUrl: z.string().nullable(),
    }),
    settings: z.array(SettingStateSchema),
  })
  .openapi("ServerSettings")

export const HouseholdSettingsSchema = z
  .object({ settings: z.array(SettingStateSchema) })
  .openapi("HouseholdSettings")

export const CapabilitiesSchema = z
  .object({
    version: z.string(),
    modules: z.array(
      z.object({
        id: z.string().openapi({ example: "errorTracking" }),
        on: z.boolean(),
        needs: z.string().optional().openapi({
          description: "When it's off, what it needs, as a stable code.",
          example: "dsn",
        }),
      })
    ),
    capabilities: z.array(z.string()).openapi({
      description: "What the modules that are on make possible.",
    }),
    client: z.record(z.string(), z.record(z.string(), z.unknown())).openapi({
      description:
        "What the web app needs from each module that's on, by module id.",
    }),
  })
  .openapi("Capabilities")

export const TelemetryReportSchema = z
  .object({
    installId: z.string(),
    version: z.string(),
    install: z.string(),
    arch: z.string(),
    database: z.string().openapi({ example: "postgres 18" }),
    modules: z.record(z.string(), z.boolean()),
    households: z.string().openapi({ example: "2-5" }),
    people: z.string(),
    recipes: z.string(),
  })
  .openapi("TelemetryReport")
