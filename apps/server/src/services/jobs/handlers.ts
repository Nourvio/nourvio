import { sendTelemetryJob } from "../../modules/telemetry/send.ts"
import { appImportJob } from "../importers/job.ts"
import { purgeDeletedJob } from "../recipes/deleted.ts"
import { linkImportJob } from "../recipes/import/import-links.ts"
import { tidyRunJob } from "../recipes/tidy/tidy-run.ts"
import { autoplanJob } from "../plan/autoplan.ts"
import { importJob } from "../transfer/import.ts"
import { cleanUpJobsJob } from "./clean-up.ts"
import type { JobHandler, JobSchedule } from "./runner.ts"

// Every kind of job Merran runs (docs/platform.md, "Jobs"). A new kind goes
// here, or the runner fails it as unknown.

export const JOB_HANDLERS: readonly JobHandler[] = [
  purgeDeletedJob,
  cleanUpJobsJob,
  sendTelemetryJob,
  importJob,
  appImportJob,
  linkImportJob,
  autoplanJob,
  tidyRunJob,
]

/** Jobs that come round again, in the server's time. */
export const JOB_SCHEDULES: readonly JobSchedule[] = [
  { kind: purgeDeletedJob.kind, cron: "17 3 * * *" },
  { kind: cleanUpJobsJob.kind, cron: "27 3 * * *" },
  { kind: sendTelemetryJob.kind, cron: "41 4 * * *" },
]
