# Sahi Daam — the right price

A free, phone-first web app for the new-to-online Meesho seller. Upload your
Meesho payment report (or type in one product) and it shows what you actually
keep on every product after RTO, returns and shipping, your floor price, what
to do about it, the price to charge next, whether to join a sale, and what
changed since last week. Everything runs on the phone; the report never leaves
it. English and Hindi, installable, works offline.

Team Taraazu's entry for the Meesho DICE Challenge 3.0, problem statement #4.

**Live:** [sahi-daam-beta.vercel.app](https://sahi-daam-beta.vercel.app)

## Try it with the sample report

1. Open the live link (or run it locally, below) and tap **Try with a sample report**.
2. Pick a language and answer the four shop questions.
3. Two weeks of made-up orders for five products load, marked **SAMPLE** everywhere
   they appear. Type a cost for a product (₹150 for the Blue Rayon Kurti) to see
   what you keep on it.
4. Open **Checks**: in week 2 the kurti's returns rose 16% → 23% and the
   jhumka's RTO 22% → 28%.

The sample files are in [`public/samples/`](public/samples/). They are synthetic:
no real seller, order or buyer. Sample uploads are sent as `sample: true`, never
count as an activated seller, and are left out of `/stats`.

## The worked example

A ₹300 kurti that costs ₹150, at typical rates (mixed buyers, no prepaid
discount, 350 g parcel). The seller thinks they make ₹150 (price − cost):

|                    | GST-registered | Not registered |
| ------------------ | -------------: | -------------: |
| You keep per sale  | **₹30**        | **₹29**        |
| Your floor         | **₹269**       | **₹271**       |

Out of 100 orders dispatched, about 17 never reach the buyer (RTO, mostly COD
refusals) and about 13 come back after delivery. Under Meesho's published
supplier policy the seller pays no COD fee and no shipping on RTOs, but does pay
forward shipping on delivered orders, return shipping on customer returns,
packaging on every order, and loses the product on unsellable returns. Spread
over the ~70 sales that survive, that is the gap between ₹150 and ₹30. Floors
are always shown rounded up, so a price at the floor never loses money. How the
numbers work: [`ENGINE.md`](ENGINE.md). Every judgement call:
[`DECISIONS.md`](DECISIONS.md).

## What's in it

- **Seller app** at `/`: landing, onboarding, report upload with column
  matching, profit leak finder, floor card, price helper, sale check, weekly
  checks, price step planner, Me (backup / restore, delete everything, opt-in
  sharing). Spec: [`SAHI_DAAM_MVP_SPEC.md`](SAHI_DAAM_MVP_SPEC.md) (v2).
- **The prototype** for judges, unchanged, at `/how-it-works`
  (`?demo=ramesh` skips its sign-in).
- **Concept**: how it could look inside a marketplace seller panel, at `/concept`.

Checks you can run:

```bash
npm test                 # unit, flow and backend-SQL tests
npm run build && npm run check:bundle      # initial JS must stay under 250 KB gzipped
npx vite preview --port 4173               # then, in another terminal:
npm run check:layout     # phone / tablet / laptop, Hindi, landscape, 125% text
npm run check:upload     # report upload end to end
npm run check:pricing    # floor card, price helper, sale check
npm run check:phase-d    # checks, Me, backup, delete everything, offline, manifest
```

### Optional backend (anonymous counters, Pro waitlist, `/stats`)

The app works fully without it: counters and waitlist sign-ups stay queued on
the phone, and `/stats` says there are no shared numbers yet. To turn it on:

1. Create a Supabase project and run the files in [`supabase/migrations/`](supabase/migrations/)
   in order (`0001`, then `0002`) in its SQL editor. The public key can then
   only *insert* events, waitlist, feedback and opt-in benchmark rows; it can't
   read anything. Events are capped at 200 per device per day.
2. Set the stats secret **inside the database**, never in the app:
   `insert into private.settings (name, value) values ('stats_key', '<long random string>');`
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see [`.env.example`](.env.example)) in Vercel or `.env.local`.
4. Open `/stats?key=<your secret>`. The key is checked by the database function `sahi_daam_stats`; the page removes it from the address bar.

Team devices: open the app once with `?team=1` and that device's events and
waitlist sign-ups are excluded from `/stats` (the flag survives "Delete everything").

## Running it

Requires Node 20 or newer (built and tested on Node 24).

```bash
npm install
npm run dev          # http://localhost:5173
```

No API key is needed: every number comes from `src/data/*.json`, the seller's
own report, or is computed in the browser. The seller app's data lives in this
browser's IndexedDB. The only network calls are the optional backend above.

The prototype at **`/how-it-works`** opens on a sign-in screen. Two demo logins
are seeded so you never have to sign up first:

| Role | Email | Password |
| --- | --- | --- |
| Seller | `ramesh@demo.in` | `sahidaam` |
| Meesho admin | `admin@meesho.demo` | `sahidaam` |

Or press **Enter as Ramesh**, the first button on the page — or open
`/how-it-works?demo=ramesh` (for example
`http://localhost:5173/how-it-works?demo=ramesh`) to skip the sign-in screen
entirely. Either way Ramesh's profile is reset to the seeded one: no prepaid
discount, so 80% COD and the deck's ₹318 floor, with his ₹300 planned price
filled in (₹318 is the full cost to serve, including the ₹51 per sale Meesho
absorbs; the seller app prices on the seller's own floor). The admin console is
reached by signing in as `admin@meesho.demo`.

> **This is not real authentication.** There is no server behind these accounts.
> They live in this browser's localStorage, the password is run through a
> non-cryptographic digest, and anyone with the device can read them. It exists
> so the demo can show *where a seller's numbers come from* — their own signup
> answers and the platform defaults an admin sets — rather than hard-coding
> them. Do not reuse a real password.

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

npm run export:sim      # run the journey + robustness sweep + tests, write sim_results.json

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

Press **Deploy**. Environment variables are only needed for the optional
backend: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see above).

**From the CLI.**

```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # production
```

`vercel.json` pins that build output and rewrites every path to `index.html`,
so deep links like `/products/…` or `/how-it-works` load the app.

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
Meesho's own similar-product search. Nothing here is scraped, and the only network calls are the optional
anonymous counters and waitlist (off unless a backend is configured).

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
