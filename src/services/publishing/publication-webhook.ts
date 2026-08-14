import type { PublicationJob } from "./types.js"

/** Notifies the configured external service after a publish run completes. */
export async function notifyPublicationWebhook(
  url: string,
  secret: string,
  jobs: PublicationJob[],
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ event: "publication.completed", jobs })
  })
  if (!response.ok) {
    throw new Error(`Publication webhook failed with HTTP ${response.status}.`)
  }
}
