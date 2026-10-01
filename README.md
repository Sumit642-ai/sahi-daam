# Sahi Daam — the right price

Lifecycle pricing for the new-to-online Meesho seller. Team Taraazu's entry for
the Meesho DICE Challenge 3.0, problem statement #4.

An offline seller prices the way they did in their shop: cost plus a markup. A
₹300 kurti costing ₹150 looks like ₹150 of profit. But out of 100 orders
dispatched, ~17 never reach the buyer (RTO, mostly COD refusals) and ~13 come
back after delivery. Forward shipping, reverse shipping, GST, packaging and COD
handling are paid on all of them, and the product itself is lost on unsellable
returns. Spread that over the sales that actually survive and the true floor is
**₹318** — so that seller loses **₹18** on every kurti they sell.

Sahi Daam computes that floor from the seller's own cost and RTO/return drag,
places it against the market band, moves the recommendation through the
product's lifecycle, and tells the seller on WhatsApp when any of it changes.

---

## Running it

Requires Node 20 or newer (built and tested on Node 24).

```bash
npm install
npm run dev          # http://localhost:5173
```

That is the whole setup. There is no backend, no API key and no network call —
every number comes from `src/data/*.json` or is computed in the browser.

The app opens on a sign-in screen. Two demo logins are seeded so you never have
to sign up first:

| Role | Email | Password |
| --- | --- | --- |
| Seller | `ramesh@demo.in` | `sahidaam` |
| Meesho admin | `admin@meesho.demo` | `sahidaam` |

Or press **Enter as Ramesh** / **Enter as admin** on the page.

> **This is not real authentication.** There is no server. Accounts live in this
> browser's localStorage, the password is run through a non-cryptographic
> digest, and anyone with the device can read them. It exists so the demo can
> show *where a seller's numbers come from* — their own signup answers and the
> platform defaults an admin sets — rather than hard-coding them. Do not reuse a
> real password.

### Everything else

```bash
npm test             # the full suite: spec tests 1–9, edge cases, demo path
npm run test:watch   # the same, watching
npm run typecheck    # tsc, no emit
npm run build        # production build into dist/
npm run preview      # serve the production build locally

npm run verify:deck     # print the deck's worked example as a cost table
npm run verify:screen1  # print Screen 1 straight out of the rendered markup
npm run verify:journey  # print the 26-week journey, both strategies

npm run gen:listings    # regenerate the synthetic competitor listings
npm run gen:i18n        # regenerate the EN/हिं dictionaries

npm run shoot -- <url> <out.png> [width] [height] [scale] [yOffset] [clipHeight]
```

`shoot` screenshots the running app at a real device width over the Chrome
DevTools Protocol and reports any horizontal overflow. Chrome's own
`--window-size` is clamped to about 489 CSS px on Windows, which is useless for
checking a mobile-first layout. Set `SHOOT_EVAL` to a JS snippet to capture a
particular state.

---

## Deploying to Vercel

The app is a static single-page build with no server side, so Vercel needs no
configuration beyond its defaults.

**From the dashboard.** Push the repository to GitHub, then at
[vercel.com/new](https://vercel.com/new) import it. Vercel detects Vite and
fills in:

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm install` |
| Node version | 20.x or 22.x |

Press **Deploy**. No environment variables are needed.

**From the CLI.**

```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # production
```

`vercel.json` pins that build output and rewrites every path to `index.html`,
which matters if routing is ever added — today the app is a single entry point.

Any other static host works the same way: `npm run build`, then serve `dist/`.

---

## What is where

```
src/
  engine/        pure TypeScript, no React, fully unit-tested
    floor.ts         the floor calculation, with the working for every cost line
    season.ts        the RTO season index, relative to the seller's own baseline
    band.ts          competitor band percentiles and where a price sits in them
    recommend.ts     verdict, NOT_VIABLE fixes, per-stage price, guardrail
    triggers.ts      the six repricing triggers, T1–T6
    nudges.ts        alert → WhatsApp message, English and Hindi
    learner.ts       the price-step learner — zero imports, by design
    simulator.ts     the 26-week world and both strategies
    format.ts        ₹ formatting, Indian digit grouping
  data/          all configuration — every value carries a `source`
  components/    cards, provenance tags, ⓘ panels, charts, the phone mock-up
  pages/         Home and the six screens
  state/         the one product every screen shares
  i18n.tsx       the EN/हिं toggle and Judge mode
tests/           spec tests 1–9, edge cases, the demo path
scripts/         generators and the verification printers
```

The engine imports no React and touches no browser API, which is why all of it
is testable from Node.

---

## The six screens

**Aapki Laagat** — your true floor, from your own cost and your own RTO and
return drag. Every input is tagged with who provides it (*You enter* / *Meesho
fills* / *Assumption*), every auto-filled value is editable in the Advanced
drawer, and every output number opens a ⓘ panel with the formula and the exact
numbers behind it. The default kurti reproduces the deck's cost table:

```
Forward shipping              100 × ₹50              ₹5,000
Reverse shipping              (17.0 + 13.0) × ₹120   ₹3,604
GST on forward shipping       18% × ₹5,000             ₹900
Packaging                     100 × ₹8                 ₹800
COD handling                  100 × 80% × ₹7           ₹560
Unsellable returns            6.0 × ₹150               ₹899
Ad spend                      100 × ₹0                   ₹0
Total overhead                                      ₹11,763
÷ clean sales (70.0)                                ₹168.12
+ product cost (COGS)                                  ₹150
= YOUR TRUE FLOOR                                   ₹318.12
```

**Bazaar Ka Daam** — the floor and the market on one ruler: 40 competitor
listings as dots, p10–p90 shaded, the floor as a magenta line and everything
left of it shaded *loss on every order*. Drag the price and the verdict, the
margin and the band percentile move with it. Four lifecycle stage cards, and no
stage can ever recommend below the floor.

**Ramesh ki Kahani** — 26 weeks of one kurti, played twice on the same world.

```
                        Sahi Daam    Seller instinct
total profit             +₹46,058         −₹33,508
weeks priced below floor     0/26            26/26
units sold                  1,160            1,840
stock left                    236                0
```

₹79,566 apart — and the seller who lost money sold **59% more units**. Volume
was never the problem. The learner recovers **ε̂ = 2.18** against a true ε = 2.2
it never gets to see.

**Daam Badlo** — the six triggers as WhatsApp-style messages on a phone
mock-up, in English or Hindi, each deep-linking back to the band screen with
that alert's numbers loaded. A side panel fires any of T1–T6 on demand.

**Meesho vs Sahi Daam** — what today's Recommended Price Range knows (two of six
things) beside what Sahi Daam adds, and what each end of Meesho's range actually
earns: for the kurti, the bottom of it loses ₹39 an order.

**Numbers & sources** — all 136 configuration values, searchable, each badged
CITED or ASSUMPTION, including the simulator's hidden demand parameters.

**My shop** (seller) — the six signup questions, re-editable. Each one fills a
field Screen 1 would otherwise have to guess at: what you sell picks the return
rate and packaging, your parcel weight picks the shipping slab, and *where your
buyers live* sets your COD share — which moves the floor more than anything
else. A small-town seller's floor comes out genuinely higher than a metro
seller's on the same product.

**Admin** — the platform-wide numbers Meesho sets for every seller: the COD
handling fee, GST on forward shipping, and RTO on COD and prepaid orders. Change
one and the table underneath shows what it does to every registered seller's
floor *before* you apply it.

---

## Data and honesty

Every configuration value in `src/data` carries a `source`: either a citation or
the literal `ASSUMPTION`, and the Numbers & sources screen renders all of them.
The competitor listings are **synthetic sample data** generated by
`scripts/generate-listings.mjs` from a fixed seed — in production they come from
Meesho's own similar-product search. Nothing here is scraped and nothing makes a
network call.

Where the spec and the deck disagreed, or a rule did not survive contact with
real data, the call and its reasoning are written down in
[DECISIONS.md](DECISIONS.md) — including the bugs that only showed up once the
screens were rendered.

---

## Language and Judge mode

**EN / हिं** translates every label and every alert. Numbers stay in Indian digit
grouping (₹1,23,456) in both. "RTO", "COD" and the rupee sign are left as they
are in the Hindi, as a seller would read them.

**Judge mode** opens every ⓘ formula panel at once — 29 of them on Screen 1 —
and reveals the simulator's hidden assumptions, including the true ε = 2.2
beside the 2.18 the learner worked out for itself.
