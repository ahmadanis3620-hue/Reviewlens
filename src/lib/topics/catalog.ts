/**
 * Starter topic catalog.
 *
 * These are seeded per business so topic naming stays consistent across
 * tenants and verticals. They are *not* a closed set: the analyzer may return
 * a key that isn't here, and it gets upserted into the business's dictionary
 * with `isCustom = true`. Nothing in the aggregation or scoring layer branches
 * on a specific key.
 *
 * The cue terms drive the local heuristic analyzer only. The OpenAI adapter
 * receives the catalog as a *hint*, not a constraint.
 */

export type TopicDefinition = {
  key: string;
  label: string;
  description: string;
  /** Phrases that indicate the topic is being discussed at all. */
  cues: string[];
  /** Phrases that, near a cue, push the topic's sentiment negative. */
  negativeCues?: string[];
  /** Phrases that push it positive. */
  positiveCues?: string[];
};

export const STARTER_TOPICS: TopicDefinition[] = [
  {
    key: "wait-time",
    label: "Wait Time",
    description: "How long customers wait to be seen or served.",
    cues: [
      "wait", "waited", "waiting", "wait time", "on time", "late", "delay",
      "delayed", "queue", "line", "sat in the", "took forever", "punctual",
      "behind schedule", "running late", "minutes late", "prompt",
    ],
    negativeCues: [
      "long wait", "waited over", "waited almost", "waited an hour", "took forever",
      "always late", "behind schedule", "running late", "running behind",
      "so far behind", "an hour late", "delayed", "past my appointment",
      "the wait was long", "wait was long", "far longer", "still waiting",
      "gotten worse", "gotten noticeably worse", "no update on when",
      "did not get taken back", "had to leave and reschedule",
    ],
    positiveCues: ["no wait", "right on time", "seen immediately", "prompt", "punctual", "minimal wait"],
  },
  {
    key: "pricing",
    label: "Pricing",
    description: "Cost, value for money, and price transparency.",
    cues: [
      "price", "prices", "pricing", "cost", "costs", "expensive", "cheap",
      "affordable", "overpriced", "value", "worth", "fee", "fees", "quote",
      "estimate", "charge", "charged", "rate",
    ],
    negativeCues: [
      "overpriced", "too expensive", "way too much", "rip off", "ripoff",
      "not worth", "hidden fee", "upcharge", "gouging", "price went up",
      "prices have gone up", "higher than", "extremely expensive",
      "additional charge", "felt like an upsell", "more than what i was quoted",
    ],
    positiveCues: ["fair price", "reasonable", "affordable", "great value", "worth every", "honest pricing"],
  },
  {
    key: "billing",
    label: "Billing & Insurance",
    description: "Invoicing, insurance claims, and payment handling.",
    cues: [
      "bill", "billing", "billed", "invoice", "insurance", "claim", "copay",
      "co-pay", "deductible", "statement", "refund", "charged me",
    ],
    negativeCues: [
      "billing error", "billed twice", "surprise bill", "unexpected charge",
      "wrong amount", "still waiting on a refund", "still waiting for a refund",
      "insurance nightmare", "denied the claim", "didn't tell me", "got my insurance",
      "billed me for", "overcharged", "could not explain", "nobody could explain",
      "i was told was covered", "took three calls",
    ],
    positiveCues: ["billing was clear", "handled my insurance", "no surprises", "explained the cost"],
  },
  {
    key: "staff",
    label: "Staff & Friendliness",
    description: "Attitude and helpfulness of the people customers meet.",
    cues: [
      "staff", "team", "receptionist", "front desk", "hygienist", "nurse",
      "technician", "crew", "assistant", "employee", "everyone",
      "friendly", "rude", "polite", "welcoming", "attitude",
    ],
    negativeCues: ["rude", "unfriendly", "dismissive", "condescending", "ignored me", "attitude", "unhelpful"],
    positiveCues: ["friendly", "so kind", "welcoming", "warm", "went above and beyond", "made me feel", "patient with"],
  },
  {
    key: "professionalism",
    label: "Professionalism",
    description: "Competence, thoroughness, and conduct of the provider.",
    cues: [
      "professional", "unprofessional", "knowledgeable", "expertise", "thorough",
      "competent", "careless", "sloppy", "experienced", "skilled",
    ],
    negativeCues: ["unprofessional", "careless", "sloppy", "didn't know what", "incompetent", "rushed through"],
    positiveCues: ["very professional", "knowledgeable", "thorough", "clearly experienced", "skilled"],
  },
  {
    key: "communication",
    label: "Communication",
    description: "How clearly things are explained and follow-through on updates.",
    cues: [
      "explained", "explain", "communication", "communicate", "told me",
      "informed", "answered my questions", "kept me updated", "clear about",
      "never called", "no one called", "walked me through",
    ],
    negativeCues: [
      "never explained", "no one called", "never called back", "left in the dark",
      "poor communication", "didn't tell me", "no update", "hard to reach",
    ],
    positiveCues: ["explained everything", "walked me through", "kept me informed", "answered all my questions", "very clear"],
  },
  {
    key: "scheduling",
    label: "Scheduling & Booking",
    description: "Ease of getting an appointment and how bookings are handled.",
    // Bare "appointment" is deliberately absent. It appears in almost every
    // wait-time complaint ("waited an hour past my appointment time"), so
    // matching it attributed wait-time sentiment to Scheduling and inflated a
    // theme the reviewer never raised. Scheduling is about *arranging* a visit,
    // so the cues name that act specifically.
    cues: [
      "schedule", "scheduling", "booking", "book", "booked", "reschedul",
      "cancel", "canceled", "cancelled", "availability", "fit me in",
      "double booked", "get an appointment", "getting an appointment",
      "cleaning appointment", "appointment was cancel", "appointment was moved",
      "months out", "next opening", "no availability",
    ],
    negativeCues: [
      "canceled my appointment", "rescheduled twice", "double booked",
      "couldn't get an appointment", "months out", "hard to schedule", "no availability",
    ],
    positiveCues: ["easy to book", "fit me in", "same day", "flexible scheduling", "got me in quickly"],
  },
  {
    key: "quality",
    label: "Quality of Work",
    description: "The outcome and durability of the service delivered.",
    cues: [
      "quality", "work", "job", "result", "results", "fixed", "repair",
      "repaired", "installation", "installed", "workmanship", "done right",
      "had to come back", "still broken",
    ],
    negativeCues: [
      "had to come back", "still broken", "poor quality", "shoddy", "botched",
      "did not fix", "didn't fix", "made it worse", "fell apart",
    ],
    positiveCues: ["excellent work", "did a great job", "fixed it", "quality work", "done right", "no issues since"],
  },
  {
    key: "cleanliness",
    label: "Cleanliness",
    description: "Hygiene and tidiness of the premises and equipment.",
    cues: [
      "clean", "cleanliness", "spotless", "dirty", "filthy", "sanitary",
      "hygiene", "sterile", "tidy", "mess", "smelled",
    ],
    negativeCues: ["dirty", "filthy", "not clean", "unsanitary", "smelled", "left a mess"],
    positiveCues: ["spotless", "very clean", "immaculate", "always clean"],
  },
  {
    key: "facilities",
    label: "Facilities",
    description: "The physical space: waiting area, equipment, comfort.",
    // "waiting room" and "chair" are deliberately absent: they appear far more
    // often inside wait-time complaints ("sat in the waiting room for an
    // hour", "in the chair within five minutes") than in remarks about the
    // premises, and matching them attributed wait-time sentiment to Facilities.
    cues: [
      "office", "waiting area", "lobby", "equipment", "facility",
      "building", "parking", "restroom", "modern", "outdated",
      "state of the art",
    ],
    negativeCues: ["outdated", "uncomfortable", "cramped", "no parking", "old equipment"],
    positiveCues: ["modern", "comfortable", "beautiful office", "state of the art", "easy parking"],
  },
  {
    key: "availability",
    label: "Availability & Responsiveness",
    description: "Reachability, emergency response, and turnaround.",
    cues: [
      "called", "phone", "voicemail", "emergency", "same day", "responded",
      "response time", "got back to me", "answered the phone", "on hold",
    ],
    negativeCues: [
      "never got back", "no one answered", "on hold for", "left a voicemail",
      "took days to respond", "couldn't reach",
    ],
    positiveCues: ["answered right away", "came out same day", "responded quickly", "available on a weekend"],
  },
  {
    key: "follow-up",
    label: "Follow-up & Aftercare",
    description: "What happens after the service is delivered.",
    // Bare "checked in" and "after the" are deliberately absent: "the hygienist
    // checked in with me the entire time" is about attentiveness during the
    // visit, not aftercare, and "after the" matches almost any narration. Both
    // attributed in-visit praise to a theme the reviewer never raised.
    cues: [
      "follow up", "follow-up", "followed up", "checked in on me",
      "checked in after", "checked on me after", "aftercare",
      "warranty", "guarantee", "post-op", "post op",
    ],
    negativeCues: ["never followed up", "no follow up", "wouldn't honor the warranty", "left me on my own"],
    positiveCues: ["followed up", "checked in on me", "honored the warranty", "called to make sure"],
  },
  {
    key: "value",
    label: "Overall Value",
    description: "Whether the total experience justified what was paid.",
    // "recommend" is deliberately absent: a closing "highly recommend them!" is
    // a sentiment signal about the whole visit, not a statement about value.
    // Treating it as a topic cue made Overall Value fire on almost every
    // positive review and crowd out the themes the reviewer actually discussed.
    cues: ["worth it", "value for money", "money well spent", "waste of money", "worth every penny"],
    negativeCues: ["waste of money", "not worth it"],
    positiveCues: ["worth every penny", "money well spent", "worth it"],
  },
  {
    key: "location",
    label: "Location & Access",
    description: "Convenience of getting there.",
    // "close to" and "drive" matched ordinary prose far too readily.
    cues: ["location", "convenient location", "commute", "parking", "hard to find", "too far"],
    negativeCues: ["hard to find", "too far", "inconvenient", "never anywhere to park"],
    positiveCues: ["convenient location", "easy to find", "parking is easy"],
  },
];

export const STARTER_TOPIC_KEYS = STARTER_TOPICS.map((t) => t.key);

const BY_KEY = new Map(STARTER_TOPICS.map((t) => [t.key, t]));

export function getTopicDefinition(key: string): TopicDefinition | undefined {
  return BY_KEY.get(key);
}

/**
 * Human label for a topic key, including keys the AI invented that aren't in
 * the catalog ("appointment-reminders" -> "Appointment Reminders").
 */
export function labelForTopicKey(key: string): string {
  const known = BY_KEY.get(key);
  if (known) return known.label;
  return key
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
