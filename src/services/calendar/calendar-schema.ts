import { z } from "zod"

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date YYYY-MM-DD")
const isoMonthSchema = z.string().regex(/^\d{4}-\d{2}$/, "Expected ISO month YYYY-MM")
const publicationTimeSchema = z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "Expected time HH:MM")
const nonEmptyStringSchema = z.string().min(1)

const sourceReferenceSchema = z.object({
  jahr_endpoint: z.url(),
  json_pfad: nonEmptyStringSchema,
  datum: isoDateSchema,
  hinweis: nonEmptyStringSchema
})

/** Zod schema for a liturgical source reference embedded in calendar data. */
export const calendarSourceReferenceSchema = sourceReferenceSchema

const sourceDefinitionSchema = z.object({
  name: nonEmptyStringSchema,
  url: z.url(),
  verwendung: z.array(nonEmptyStringSchema).min(1)
})

const platformDefaultSchema = z.object({
  formats: z.array(nonEmptyStringSchema).min(1),
  text_length: nonEmptyStringSchema,
  notes: nonEmptyStringSchema
})

const workflowBlockSchema = z.object({
  aufgaben: z.array(nonEmptyStringSchema),
  dauer: nonEmptyStringSchema.optional(),
  empfohlener_zeitpunkt: nonEmptyStringSchema.optional()
})

const liturgicalReferenceSchema = z.object({
  sonntag: isoDateSchema,
  bezeichnung: nonEmptyStringSchema,
  quelle: sourceReferenceSchema,
  felder_aus_quelle: z.array(nonEmptyStringSchema).min(1)
})

const editorialFieldsSchema = z.object({
  arbeitstitel: z.string(),
  facebook_text: z.string(),
  instagram_caption: z.string(),
  mastodon_text: z.string(),
  bluesky_text: z.string().optional().default(""),
  story_ablauf: z.array(z.string()),
  reel_skript: z.string(),
  bildidee: z.string(),
  ki_bildprompt: z.string(),
  alt_text: z.string(),
  hashtags: z.array(z.string()),
  veroeffentlichungszeit: z.string(),
  asset_pfade: z.array(z.string()),
  notizen: z.string()
})

const platformFormatsSchema = z.object({
  facebook: z.array(nonEmptyStringSchema).min(1),
  instagram: z.array(nonEmptyStringSchema).min(1),
  mastodon: z.array(nonEmptyStringSchema).min(1)
})

const statusSchema = z.enum([
  "Idee",
  "in Arbeit",
  "zur Prüfung",
  "freigegeben",
  "terminiert",
  "veröffentlicht",
  "verworfen"
])

const specialFormatSchema = z.object({
  typ: nonEmptyStringSchema,
  monatsthema: nonEmptyStringSchema,
  monatslied: nonEmptyStringSchema,
  hinweis: nonEmptyStringSchema
})

/** Zod schema for a single editorial post in the annual calendar. */
export const calendarPostSchema = z.object({
  id: nonEmptyStringSchema,
  datum: isoDateSchema,
  wochentag: nonEmptyStringSchema,
  rubrik: nonEmptyStringSchema,
  saeule: nonEmptyStringSchema,
  ziel: nonEmptyStringSchema,
  vorproduktion: nonEmptyStringSchema,
  plattformen_und_formate: platformFormatsSchema,
  struktur: z.array(nonEmptyStringSchema).min(1),
  ki_hilfe: z.array(nonEmptyStringSchema).min(1),
  status: statusSchema,
  veroeffentlichungszeit: publicationTimeSchema.optional(),
  redaktionsfelder: editorialFieldsSchema,
  thema: nonEmptyStringSchema,
  konkrete_idee: nonEmptyStringSchema,
  liturgische_quelle: sourceReferenceSchema.optional(),
  aktuelle_eingaben: z.array(nonEmptyStringSchema).min(1).optional(),
  sonderformat: specialFormatSchema.optional()
})

/** Zod schema for a single week in the annual calendar. */
export const calendarWeekSchema = z.object({
  id: nonEmptyStringSchema,
  iso_kw: nonEmptyStringSchema,
  zeitraum: z.object({
    von: isoDateSchema,
    bis: isoDateSchema
  }),
  monatsschwerpunkt: nonEmptyStringSchema,
  monatslied_vorschlag: nonEmptyStringSchema,
  liturgischer_bezug_montag_bis_samstag: liturgicalReferenceSchema,
  neuer_liturgischer_bezug_ab_sonntag: liturgicalReferenceSchema,
  redaktioneller_fokus: nonEmptyStringSchema,
  beitraege: z.array(calendarPostSchema).min(1)
})

/** Zod schema for the full annual editorial calendar file. */
export const calendarSchema = z.object({
  meta: z.object({
    titel: nonEmptyStringSchema,
    inhaber: nonEmptyStringSchema,
    version: nonEmptyStringSchema,
    erstellt_am: isoDateSchema,
    zeitraum: z.object({
      von: isoDateSchema,
      bis: isoDateSchema
    }),
    umfang: z.object({
      wochen: z.number().int().nonnegative(),
      beitraege: z.number().int().nonnegative()
    }),
    zeitzone: nonEmptyStringSchema,
    sprache: nonEmptyStringSchema,
    ziel: nonEmptyStringSchema,
    hinweis_zur_liturgie: nonEmptyStringSchema,
    copyright_hinweis: nonEmptyStringSchema
  }),
  quellen: z.array(sourceDefinitionSchema),
  plattform_defaults: z.object({
    facebook: platformDefaultSchema,
    instagram: platformDefaultSchema,
    mastodon: platformDefaultSchema
  }),
  workflow: z.object({
    monatlicher_block: workflowBlockSchema,
    woechentlicher_block: workflowBlockSchema,
    samstag: workflowBlockSchema
  }),
  statuswerte: z.array(statusSchema).min(1),
  wochen: z.array(calendarWeekSchema)
})

/** Zod schema for `YYYY-MM` month input accepted by the CLI. */
export const isoMonthInputSchema = isoMonthSchema
