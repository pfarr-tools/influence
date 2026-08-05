import { z } from "zod"

const nonEmptyStringSchema = z.string().min(1)
const statusSchema = z.enum([
  "Idee",
  "in Arbeit",
  "zur Prüfung",
  "freigegeben",
  "terminiert",
  "veröffentlicht",
  "verworfen"
])

const storySlideSchema = z.object({
  text: z.string()
})

const carouselCardSchema = z.object({
  type: z.string(),
  text: z.string()
})

/** Zod schema for a locally scaffolded content package. */
export const contentPackageSchema = z.object({
  id: nonEmptyStringSchema,
  status: statusSchema,
  needs_input: z.boolean(),
  source: z.object({
    calendar_post_id: nonEmptyStringSchema,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    rubric: nonEmptyStringSchema,
    liturgical_source: z.string()
  }),
  editorial_core: z.object({
    title: z.string(),
    main_message: z.string(),
    audience: z.string(),
    tone: z.array(nonEmptyStringSchema).min(1),
    source_notes: z.array(z.string())
  }),
  platforms: z.object({
    facebook: z.object({
      text: z.string(),
      headline: z.string()
    }),
    instagram: z.object({
      caption: z.string(),
      carousel: z.array(carouselCardSchema)
    }),
    mastodon: z.object({
      text: z.string()
    }),
    story: z.object({
      slides: z.array(storySlideSchema)
    }),
    reel: z.object({
      hook: z.string(),
      script: z.string(),
      shots: z.array(z.string()),
      duration_seconds: z.number().int().min(0)
    })
  }),
  visual: z.object({
    concept: z.string(),
    flux_prompt: z.string(),
    negative_prompt: nonEmptyStringSchema,
    formats: z.array(nonEmptyStringSchema).min(1),
    alt_text: z.string()
  }),
  qa: z.object({
    warnings: z.array(z.string()),
    approved: z.literal(false)
  }),
  metadata: z.object({
    model: z.string(),
    generated_at: z.string(),
    prompt_version: nonEmptyStringSchema,
    assets: z.array(z.string())
  })
})
