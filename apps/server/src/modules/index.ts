import { ai } from "./ai/index.ts"
import { errorTracking } from "./error-tracking/index.ts"
import type { Module } from "./module.ts"
import { telemetry } from "./telemetry/index.ts"
import { video } from "./video/index.ts"

/** Every module, in the order Settings lists them. */
export const MODULES: readonly Module[] = [ai, video, errorTracking, telemetry]
