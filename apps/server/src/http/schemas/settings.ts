import { z } from "@hono/zod-openapi"
import { SECRET_SETTING, SETTING } from "./examples.ts"

export const SettingStateSchema = z
  .object({
    key: z.string().openapi({ example: "errorTracking.environment" }),
    kind: z.enum([
      "text",
      "number",
      "switch",
      "choice",
      "list",
      "secret",
      "json",
    ]),
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
  .openapi("SettingState", { example: SETTING })

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
  .openapi("ServerSettings", {
    example: {
      about: {
        version: "0.1.0",
        installMethod: "docker",
        database: "sqlite",
        publicUrl: "https://merran.example.com",
      },
      settings: [SETTING, SECRET_SETTING],
    },
  })

export const HouseholdSettingsSchema = z
  .object({ settings: z.array(SettingStateSchema) })
  .openapi("HouseholdSettings", {
    description: "No module has household settings yet, so the list is empty.",
    example: { settings: [] },
  })

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
  .openapi("Capabilities", {
    example: {
      version: "0.1.0",
      modules: [
        { id: "errorTracking", on: true },
        { id: "telemetry", on: true },
      ],
      capabilities: [],
      client: {
        errorTracking: {
          dsn: "https://public-key@errors.example.com/1",
          environment: "home",
          sampleRate: 1,
          release: "0.1.0",
        },
      },
    },
  })

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
  .openapi("TelemetryReport", {
    example: {
      installId: "0199e8b0-5a10-7a01-8b00-0000000000ff",
      version: "0.1.0",
      install: "docker",
      arch: "x64",
      database: "sqlite",
      modules: { errorTracking: true, telemetry: true },
      households: "1",
      people: "2-5",
      recipes: "100-499",
    },
  })
