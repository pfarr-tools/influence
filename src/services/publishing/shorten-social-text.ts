import { PublicationJobStore } from "./job-store.js"
import { limitSocialText } from "./text-utils.js"

/** Shortens all currently scheduled Threads and Bluesky jobs in the queue. */
export async function shortenScheduledSocialText(outputRoot: string): Promise<{ updated: number; skipped: number }> {
  const store = new PublicationJobStore(outputRoot)
  const jobs = await store.list()
  let updated = 0
  let skipped = 0
  for (const job of jobs) {
    if (job.status !== "scheduled" || (job.platform !== "threads" && job.platform !== "bluesky")) {
      skipped++
      continue
    }
    const text = limitSocialText(job.text)
    if (text === job.text) {
      skipped++
      continue
    }
    await store.save({ ...job, text, updatedAt: new Date().toISOString() })
    updated++
  }
  return { updated, skipped }
}
