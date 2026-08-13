/**
 * Sentence banks for the demo corpus.
 *
 * The point of the demo data is that the analysis pipeline has something *true*
 * to find in it. These snippets are written so that topic detection, sentiment,
 * and trend detection all have real signal to work with — not filler text.
 */

export type SnippetBank = {
  positive: string[];
  negative: string[];
};

export const SNIPPETS: Record<string, SnippetBank> = {
  "wait-time": {
    positive: [
      "They took me back right on time, which almost never happens anywhere else.",
      "No wait at all — I was in the chair within five minutes of arriving.",
      "I appreciated that they run on schedule and respect your time.",
      "Was seen promptly even though I arrived a little early.",
    ],
    negative: [
      "I waited almost an hour past my appointment time before anyone came to get me.",
      "My appointment was at 4:30 and I did not get taken back until well after 5.",
      "The wait was long again — this is the third visit in a row where they were running behind.",
      "Sat in the waiting room for a very long time with no update on when I would be seen.",
      "Scheduled for late afternoon and ended up waiting far longer than I expected.",
      "The wait times have gotten noticeably worse over the past few months.",
      "I had to leave and reschedule because they were running so far behind schedule.",
      "Took forever to be seen even though the waiting room was not full.",
    ],
  },
  pricing: {
    positive: [
      "The pricing was fair and they were upfront about the cost before starting.",
      "Reasonable prices for the quality of care you get here.",
      "They gave me an honest estimate and stuck to it exactly.",
    ],
    negative: [
      "The cost was significantly higher than what I was quoted over the phone.",
      "Prices have gone up a lot and nobody mentioned the increase beforehand.",
      "Felt overpriced for what was a fairly routine visit.",
      "I was not told about the additional charge until I was checking out.",
      "The treatment plan they proposed was extremely expensive and felt like an upsell.",
    ],
  },
  billing: {
    positive: [
      "Billing was straightforward and they handled the insurance side without any fuss.",
      "They explained exactly what insurance would cover before we started.",
    ],
    negative: [
      "I received a surprise bill weeks later for something I was told was covered.",
      "The billing office got my insurance information wrong twice.",
      "Still waiting on a refund for an amount I was overcharged.",
      "Nobody could explain what a line item on my statement was actually for.",
      "They billed me for a service I did not receive and it took three calls to sort out.",
    ],
  },
  staff: {
    positive: [
      "Every single person on the team was warm and genuinely welcoming.",
      "The hygienist was incredibly gentle and put me completely at ease.",
      "The front desk staff are friendly and remember you by name.",
      "The whole team is kind, patient, and clearly cares about their patients.",
      "My hygienist was wonderful and made what is usually a stressful visit easy.",
      "Staff went above and beyond to make my anxious kid comfortable.",
      "Everyone here is friendly and professional from the moment you walk in.",
      "The assistant was so caring and checked in with me throughout.",
    ],
    negative: [
      "The person at the front desk was short with me and seemed annoyed by my questions.",
      "Felt rushed and like the staff were not really listening to my concerns.",
    ],
  },
  cleanliness: {
    positive: [
      "The office is spotless — always immaculate every time I come in.",
      "Very clean facility and the equipment all looks well maintained.",
      "Everything was sterile and clearly well cared for.",
      "The cleanliness of this place stands out compared to my last dentist.",
    ],
    negative: [
      "The restroom was not clean when I visited, which was off-putting.",
    ],
  },
  quality: {
    positive: [
      "The work they did was excellent and I have had no issues since.",
      "My crown fits perfectly and looks completely natural.",
      "Best cleaning I have had in years — genuinely thorough.",
      "The filling they did is holding up perfectly months later.",
      "Very thorough exam, they caught something my previous dentist missed.",
    ],
    negative: [
      "I had to come back twice to get the same filling adjusted properly.",
      "The work did not hold up and I am dealing with the same problem again.",
    ],
  },
  communication: {
    positive: [
      "The dentist explained every option clearly and never pushed me toward anything.",
      "They walked me through the treatment plan step by step and answered all my questions.",
      "Really appreciated how clearly everything was explained beforehand.",
    ],
    negative: [
      "No one called me back after I left two messages about my treatment plan.",
      "I was never told what the next step was and had to chase them for an answer.",
      "The explanation of what they were doing was rushed and hard to follow.",
    ],
  },
  scheduling: {
    positive: [
      "They fit me in the same day when I called with a problem.",
      "Booking an appointment online was quick and easy.",
    ],
    negative: [
      "They rescheduled my appointment twice with very little notice.",
      "It took over two months to get a routine cleaning appointment.",
      "My appointment was cancelled the day before and the next opening was weeks out.",
      "Getting anyone on the phone to book an appointment is a challenge.",
    ],
  },
  facilities: {
    positive: [
      "The office is modern and comfortable, and parking is easy.",
      "Nice waiting area and the equipment is clearly up to date.",
    ],
    negative: [
      "The waiting room is cramped and there is never anywhere to park.",
    ],
  },
  professionalism: {
    positive: [
      "Dr. Reyes is clearly experienced and I trust her judgment completely.",
      "Very professional operation from start to finish.",
    ],
    negative: [
      "It felt like they were more interested in selling me treatment than treating me.",
    ],
  },
};

export const OPENERS_POSITIVE = [
  "I have been coming here for years and it never disappoints.",
  "Great experience overall.",
  "Really happy I switched to this practice.",
  "Genuinely one of the better dental experiences I have had.",
  "Cannot say enough good things about this place.",
  "",
];

export const OPENERS_NEGATIVE = [
  "Disappointed with my visit.",
  "Mixed feelings about this practice.",
  "Not what I expected based on the reviews.",
  "I wanted to like this place.",
  "",
];

export const CLOSERS_POSITIVE = [
  "Highly recommend them.",
  "Will definitely be back.",
  "Would recommend to anyone looking for a dentist in the area.",
  "",
  "",
];

export const CLOSERS_NEGATIVE = [
  "Hoping they get this sorted out.",
  "Probably looking for another practice at this point.",
  "Would think twice before booking again.",
  "",
  "",
];

export const FIRST_NAMES = [
  "Sarah", "Michael", "Jessica", "David", "Emily", "James", "Ashley", "Robert",
  "Amanda", "Christopher", "Melissa", "Daniel", "Nicole", "Matthew", "Rachel",
  "Andrew", "Laura", "Joshua", "Megan", "Brian", "Katherine", "Kevin", "Stephanie",
  "Jason", "Rebecca", "Eric", "Lauren", "Ryan", "Christina", "Justin", "Angela",
  "Marcus", "Priya", "Diego", "Aisha", "Tyler", "Nina", "Omar", "Grace", "Victor",
];

export const LAST_INITIALS = "ABCDEFGHIJKLMNOPRSTVW".split("");

export const OWNER_RESPONSES = [
  "Thank you for the feedback. We are sorry your visit did not meet expectations and would like to make it right — please give us a call at the office.",
  "We appreciate you taking the time to write this. We are reviewing our scheduling with the team and would welcome the chance to discuss your experience directly.",
  "Thank you for letting us know. This is not the standard we hold ourselves to. Please contact the office so we can look into what happened.",
];
