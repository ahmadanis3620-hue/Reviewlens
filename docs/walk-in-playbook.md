# Walk-in playbook

For door-to-door prospecting of local businesses. Written after trying, and
failing, to build a remote list of low-rated businesses.

---

## Why there is no prospect list in this document

Star ratings cannot be gathered programmatically at any useful scale. Google and
Yelp both refuse automated access, and the aggregators that *are* readable
(CARFAX, Carwise, Yellow Pages) publish **"top rated" pages** — they surface the
best businesses in a category, never the struggling ones. Two rounds of
searching Cordova, TN returned exactly one business in the 3.5–4.3 band.

This is the same wall the product hits when it tries to read a customer's
reviews, and it is not going to move without official API access.

**The good news is that it does not matter for walk-ins.** You are standing in
front of the business with a phone. Google Maps gives you complete, current,
verified data in about sixty seconds — better data than any remote list, and
with no risk of showing an owner a number that turns out to be wrong.

---

## Qualifying in 60 seconds, from the parking lot

Open Google Maps, search the business, and check four things in this order.

**1. Rating and count.** You want roughly **3.5 to 4.3 stars with 40+ reviews.**

- Above 4.5: skip. The analysis will tell them they are doing fine, which is
  true and worth nothing to them. (Verified: a 4.7-star practice scored 91/100
  with a single recommendation, and that recommendation was "keep it up".)
- Below 3.2: usually skip. They know they are in trouble and generally have a
  problem bigger than analytics.
- Under ~40 reviews: too thin. A month may only bring 5 reviews, and the product
  will honestly refuse to call a trend on that.

**2. Sort reviews by newest and read three.** If the recent ones are angrier
than the average, the rating is lagging behind a real decline — that is the
strongest possible opening, and you can say it out loud with confidence because
you just read it.

**3. Do they reply to reviews?** Scroll for owner responses. **No replies is the
best signal on this list.** It means nobody is minding the channel, which is
exactly the gap you fill, and it is a fact you can name without having analyzed
anything.

**4. Is there a website link?** No link, or a link to a dead page or a
Facebook page only — that is the free-website hook, and it gets you in the door
at places that will not engage on analytics alone.

Two of four is enough to walk in.

---

## Where to go near Cordova, TN 38016

Highest business density within a short drive. Confirm times in Maps — these are
corridors, not measured routes.

- **N Germantown Pkwy / Wolfchase** — the densest retail strip in the area.
  Salons, nail bars, auto service, restaurants, med spas. Start here.
- **Macon Road** and **Trinity Commons** — neighborhood service businesses.
- **Bartlett** (Stage Rd, Bartlett Blvd) — independent shops, less chain-heavy.
- **Germantown** (Poplar Ave) — higher-end salons, med spas, dental.
- **Appling Rd / Berryhill** — smaller independents.

**Prefer independents over chains.** A franchise manager cannot buy anything;
corporate handles reviews. A multi-location group is bought at head office, not
at the counter — a bigger contract eventually, but not a walk-in sale.

Best verticals for walking in: **nail and hair salons, auto repair and body
shops, restaurants, med spas, pet groomers, independent retail.** Dentists and
HVAC are good customers but poor walk-ins — the decision-maker is rarely at the
front desk.

---

## What to say

Ask for the owner or manager by role, not by name. If they are out, leave the
one-pager and get a name for next time.

> "I do one thing: I read every review a business gets and send back one page a
> month on what to fix. I noticed you have [X] reviews and nobody's replying to
> them — that's usually the cheapest thing to fix. First report is free, takes
> me two days, and if it tells you nothing you didn't know, we're done."

Then stop talking.

**Only say what you have actually checked.** "You've got 180 reviews and no
replies" is verifiable and lands. "Your customers are complaining about wait
times" is not something you know yet, and an owner who reads their own reviews
will catch it — and then nothing else you say counts.

If they have no website: *"Separately — you don't have a site. I'll build you a
one-pager, free, whether or not you take the reports."* That converts on its own.

---

## The leave-behind

```bash
npm run onepager                       # generic, print a stack
npm run onepager -- --business "Name" --rating 3.6 --reviews 210
```

Fill in your name, phone, and email once via flags or `SALES_NAME`,
`SALES_PHONE`, `SALES_EMAIL`. The personalized version prints their name and
their **public** rating in a header strip — a fact anyone can look up. It never
claims to have analyzed their reviews, and the report shown is always labelled a
sample. Keep it that way.

## The website offer

```bash
npm run website -- --business "Name" --category "Nail Salon" \
  --phone "(901) 555-0142" --address "1234 Example Rd" --city "Cordova, TN"
```

One self-contained `index.html`. Drag the folder onto Netlify Drop and it is
live in under a minute — you can do it in the car and text them the link before
you have driven home. That follow-through is the whole pitch.

---

## After the visit

Log four things per business: **name, rating, review count, whether they reply.**
That list becomes your first real dataset, and unlike anything scraped it is
accurate. Fifty rows in and you will know which vertical converts, which is the
question that actually decides where this goes next.
