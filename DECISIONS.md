# Decisions

Every judgement call made while building Sahi Daam, with the reasoning. Spec
section numbers refer to `SAHI_DAAM_SPEC.md`.

---

## Phase 1 — engine, data, tests 1–4

### 1. ethnic_women's expected return rate is 13/83 = 0.157, read off the deck — RESOLVED in Phase 2

**The problem (found in Phase 1).** Spec section 5.3 gives ethnic_women a return
rate of `0.15 / 0.20 / 0.25`, but no numeric target anywhere in the spec is
reachable at the expected 0.20:

| Spec target | At 0.20 | At the rate that actually produces it |
| --- | --- | --- |
| Test 2: floor ≈ ₹315.2 | ₹337.31 | 0.15 → **₹315.17** |
| Test 2: ≈ ₹362.5 "at return rate 0.25" | — | 0.25 → **₹362.40** |
| Test 3: November ≈ ₹374 | ₹399.94 | 0.15 → **₹374.12** |
| Test 3: January ≈ ₹328 | ₹350.93 | 0.15 → **₹327.99** |
| Acceptance 1: "floor ₹315–₹362 **and the cost table matches the deck lines**" | ₹337, table off by 6% | low–high = 0.15–0.25 |
| Acceptance 2: at ₹300, "about −₹15 to −₹18" | −₹37.31 | 0.15 → −₹15.17; deck → −₹18 |

I verified algebraically that nothing else works: solving section 6.1 for the
rate that yields ₹315.2 gives r = 0.15006, and no value of `writeOffShare` can
reach ₹315.2 at r = 0.20.

**Why it had to be resolved in Phase 2.** Acceptance item 1 requires the
*default* Screen 1 cost table to match the deck lines. At 0.20 it did not: the
rendered default showed ₹12,437 ÷ 66.4 → ₹337.31 against the deck's
₹11,760 ÷ 70 → ₹318, with reverse shipping and the write-off line each ~12% out.

**The resolution.** `returnRateExpected` for ethnic_women is now **0.157**, which
is the deck's own worked example read directly: **13 returns out of 83 delivered
orders = 0.157**. This is the same move the spec itself makes for `writeOffShare`
— section 5.3 derives 0.46 as "6 of 13 returns from the deck's worked example" —
applied to the other number in the same table. It is the one value in the
category row that the deck actually pins, so it is now the best-sourced of the
three rather than an ASSUMPTION.

The payoff is that the **continuous** model reproduces the deck table to the
rupee, with no unit overrides at all:

| | Deck | Continuous at 0.157 |
| --- | --- | --- |
| Forward / GST / packaging / COD / ad | ₹5,000 / ₹900 / ₹800 / ₹560 / ₹0 | identical |
| Reverse shipping | ₹3,600 | ₹3,604 |
| Unsellable returns | ₹900 | ₹899 |
| Total overhead | ₹11,760 | ₹11,763 |
| Clean sales | 70 | 70.0 |
| ÷ clean sales | ₹168 | ₹168.12 |
| **Floor** | **₹318** | **₹318.12** |

Every acceptance target now lands: the headline reads ₹315 – ₹362 most likely
₹318 (item 1), ₹300 shows −₹18.12 with −₹15.17 at the low end (item 2), and
November moves the range to ₹374.12 – ₹430 (item 3).

**What changed, and how to revert.** One value and its source string in
`src/data/categories.json` under `ethnic_women.returnRateExpected`. No engine
code. Setting it back to 0.2 restores the old behaviour and breaks only the two
test cases that name 0.157 explicitly. The other seven categories are untouched;
their expected rates remain the spec's ASSUMPTIONs.

I considered and rejected two alternatives. Defaulting Screen 1's scenario
selector to the *low* return rate would also show the deck lines, but it makes
the optimistic end of the range the number the product defends — the exact
mistake Sahi Daam exists to stop sellers making. Keeping 0.20 and restating the
deck hook as −₹37 is internally consistent but contradicts the deck the judges
will already have seen.

### 2. Config JSON wraps every value, with a typed unwrapper for the engine

Section 5 requires a `source` on every config value, and section 9.7 renders all
of them. So each value in `fees.json`, `weightSlabs.json`, `categories.json` and
`season.json` is an object:

```json
{ "value": 0.8, "unit": "share of orders", "label_en": "…", "label_hi": "…", "source": "Valmo DICE data pack" }
```

Writing engine code against `fees.codShare.value` everywhere would be noisy, so
`src/data/index.ts` unwraps the JSON once into plain typed objects (`fees`,
`categories`, `seasonMonths`) and separately exposes `sourcedEntries()` — a flat
list of every value with its source and an `isAssumption` flag — which is what
Screen 6 will render. Hindi labels are in the data from the start so the Phase 6
language toggle does not need a second pass over the config.

### 3. `floorRange()` ignores `input.returnRate`

Section 6.1 says `floorRange(input)` runs the floor at the category's low,
expected and high return rates. Any `returnRate` already on the input would
therefore be meaningless, so it is overwritten rather than silently respected.
The function returns the three floors as plain numbers (so `floorRange(x).expected`
reads as a number, as section 6.2 assumes), plus `results` holding the full
`FloorResult` behind each one for the Show-working panels, plus `returnRates` so
the UI can label which rate produced which figure.

### 4. `unitOverrides` cascade instead of standing alone

Test 1 pins `rtoUnits`, `returnUnits`, `writeOffUnits` and `cleanSales` to the
deck's rounded whole units. Each count falls back to the one above it
(`deliveredUnits` defaults to `N − rtoUnits`, `returnUnits` to
`deliveredUnits × returnRate`, and so on), so pinning only `rtoUnits` still
flows correctly through the rest. `deliveredUnits` is overridable too, for
completeness, though the deck example does not need it.

### 5. No surviving sale gives an infinite floor, not a thrown error

When `cleanSales <= 0` there is genuinely no price that covers the overhead, so
`floor` is `Number.POSITIVE_INFINITY` and `viable` is `false`. Throwing would
break the what-if sliders on Screen 1 (section 9.2 lets the seller drag the
return rate to 100%), and clamping to a large finite number would be a lie. The
formatters render non-finite values as an em dash, so the UI degrades cleanly.

For the same reason `marginPct(price, floor)` returns `-Infinity` at a price of
zero or less rather than `NaN`, so the section 6.2 verdict comparisons read it
as a loss instead of falling through every branch.

### 6. The RTO cap lives in `season.ts`

Section 6.1 caps `rto` at 0.90. Since the cap exists because of the season
multiplier, `seasonalRto(baselineRto, index)` in `season.ts` owns it and
`floor.ts` calls through, so there is one place to change it. `MAX_RTO` is
re-exported from `floor.ts` for callers that only import the floor module.

### 7. `season.ts` API, which section 6.1 does not specify

Section 6.1 only names `seasonIndex` as a floor input, so the module shape was
mine to choose:

- `seasonIndex(month)` takes either a `'Nov'`-style key or a **0-based** month
  number, matching `Date.prototype.getMonth()`, so the simulator can pass dates
  straight through without an off-by-one.
- `seasonalRto(baselineRto, index)` applies the index and the cap. Seasonality
  is relative to the seller's own baseline, so a prepaid-heavy seller at 10%
  RTO sees 18.7% in November, not the COD-heavy seller's 31.7%. There is a test
  for exactly this, because treating the index as an absolute RTO is the obvious
  way to get it wrong.
- `peakSeasonIndexBetween(from, to)` exists for trigger T2, which asks for "the
  season index for the next 2 weeks" — a span that can cross a month boundary,
  so it cannot be a single lookup. It steps a day at a time rather than doing
  month arithmetic, which cannot skip a short month.

### 8. Unknown ids throw rather than defaulting

`getCategory('typo')` and `seasonIndex(12)` throw with a message listing the
valid values. A silent fallback to the first category or to index 1.0 would
turn a typo into a plausible-looking wrong floor, which is the worst failure
mode for this particular product.

### 9. Weight slabs beyond 2000 g

Section 5.2 lists four slabs and then "each extra 500 g: +₹20 / +₹30". Read as
continuing the same pattern from the 1501–2000 g slab, so 2001–2500 g is
₹130 / ₹240, 2501–3000 g is ₹150 / ₹270, and so on without limit. `slabFor()`
synthesises a label for these (`"2501–3000 g"`) so the UI can name the slab it
used. Only footwear (800 g) and home & kitchen (900 g) leave the first slab by
default, but the weight field is seller-editable.

### 10. Synthetic listings: seeded, committed, and sourced at file level

Section 5.5 asks for a fixed seed so output is stable. `scripts/generate-listings.mjs`
uses mulberry32 seeded from an FNV-1a hash of the category id, so each category
is stable and distinct, and `npm run gen:listings` is byte-for-byte reproducible
(verified by regenerating and diffing hashes). The generated JSON is committed
so the app has no build step dependency and the demo cannot drift.

Specific choices inside the generator:

- **Spread.** "bandSpread ≈ ±35%" is read as the 10th-to-90th percentile band:
  `sigma = ln(1 + 0.35) / z90`, which puts p10 at `median / 1.35` and p90 at
  `median × 1.35`. For the kurti that is a ₹225–₹456 band around ₹320, which is
  a believable Meesho spread.
- **Prices** are rounded to ₹1 with a ₹29 floor, so percentile maths stays
  meaningful.
- **Ratings** are weakly correlated with price (cheaper listings rate slightly
  worse), bounded to 3.1–4.8, with `ratingCount` log-distributed from 5 to
  ~6,000. Both are cosmetic — nothing in the engine reads them yet — but they
  make the Screen 2 dot plot look like a real search result.
- **`source` sits at file level**, not on each of the 40 listings. Section 5's
  per-value `source` rule is about *config*; listings are generated sample data,
  so each file carries `"synthetic": true`, a `generator` block recording the
  seed and distribution, and the `_note` wording section 5.5 mandates for the UI
  label.

No website was scraped. No network call happens anywhere in the project.

### 11. `format.ts` was built in Phase 1

It is listed in section 4 but not in the Phase 1 scope. `floor.ts` needs it: the
`working` strings on the cost lines (`"100 × ₹50"`, `"18% × ₹5,000"`) are
₹-formatted, and section 3 requires Indian digit grouping via
`Intl.NumberFormat('en-IN')`. Writing it twice would be worse than writing it
now. Non-finite inputs render as an em dash, for decision 5.

### 12. `journey.json` was built in Phase 1; `i18n/` was not

Section 7.2 specifies the journey events completely, and section 4 lists
`journey.json` as a data file, so it is cheap to get right now and the simulator
in Phase 5 will not have to invent it. It also carries the section 7.1 hidden
demand parameters (ε = 2.2 and friends) with `source: "ASSUMPTION"`, kept in one
clearly labelled `hiddenDemand` block — the spec is emphatic that `learner.ts`
must never read these, and keeping them in one named block makes that boundary
easy to enforce and to test (test 9).

`src/data/i18n/` is left empty. Section 4 lists it, but the translation keys
depend on the component tree, which does not exist yet; filling it now would
mean guessing keys and rewriting them in Phase 6.

### 13. Cost lines carry an English `label` plus a `labelKey`

The engine must not depend on a React i18n context, but Screen 1's cost table
needs translatable row labels. Each `CostLine` therefore has both a plain
English `label` (usable immediately, and in tests) and a `labelKey` like
`"cost.forward"` for the Phase 6 Hindi toggle to resolve.

### 14. Toolchain versions

- **Tailwind 3.4, not 4.x.** Tailwind 4 moves theme configuration into CSS and
  drops `tailwind.config.js`. Section 3 pins a specific palette and Poppins, and
  the v3 config file is the most predictable way to express that.
- **Vite 6 and Vitest 3**, upgraded from the 5/2 pair `npm install` first
  resolved. The 5/2 tree carried a high-severity Vite dev-server path-traversal
  advisory and a critical Vitest UI advisory, two of them Windows-specific —
  worth clearing on a Windows dev machine even though they are dev-server only.
  One moderate advisory remains (`@vitest/mocker`, affecting every Vitest from
  2.1 to 4.1.10, so there is no version to move to); it concerns mock
  redirection, and this project uses no mocking.
- **Vitest `environment: 'node'`.** The engine is pure TypeScript with no DOM,
  per section 3. Component tests in later phases can opt into jsdom per file.
- **TypeScript strict, plus `noUncheckedIndexedAccess`.** Array indexing in the
  engine and the generator is then forced to be explicit about `undefined`,
  which is what caught the slab-extrapolation edge while writing it.

### 15. `src/App.tsx` is a placeholder

Phase 1 is engine-only, but the stack has to demonstrably boot and build. App
renders the default kurti's floor range through the real engine, which proves
the data layer, the engine, Tailwind and the palette are all wired up.
`npm run build` succeeds. Screens 1–6 replace it from Phase 2.

### 16. `npm run verify:deck`

A small script that prints the deck's worked example as the cost table Screen 1
will render, so the ₹11,760 → ₹168 → ₹318 chain can be checked by eye against
the deck without reading test assertions. Useful when wiring Screen 1 in Phase 2.

---

## Phase 2 — Screen 1, the Floor Calculator

### 17. The month defaults to the baseline (March), not the current month

Section 9.2 says the Month field defaults to the current month. Today is October,
whose season index is 1.60, so a literal reading would open the screen on a floor
of about ₹425 — which contradicts acceptance item 1 ("the default kurti shows
floor ₹315–₹362 and the cost table matches the deck lines") and acceptance item 3
("switching month to November moves the floor to about ₹374", which only reads as
a change if the screen did not already open on a festive month). The section 13
demo path has the same shape: open on the deck numbers, *then* slide the month to
November to show the jump.

So the default is March, the index baseline, which is also the honest reading of
the model: the seller's auto-filled "expected RTO" from their pincode mix **is**
their un-seasoned baseline, and March is the month where the index does not move
it. The field labels every option with its multiplier (`March — RTO ×1.00
(baseline)`), so nothing is concealed, and the what-if slider is immediately below.

### 18. The provenance tag is derived from the value's own `source`, not hard-coded

Section 9 names three tags — *Aap bhariye*, *Meesho ne bhara*, *Assumption* — and
the third is not decoration: a value Meesho would genuinely auto-fill from its own
data is a different claim from a placeholder the team invented. So Screen 1 reads
each field's `source` string and tags it `Assumption` when `isAssumption(source)`
is true, `Meesho fills` otherwise. A new `categorySource(categoryId, field)`
helper in `src/data/index.ts` exposes the strings.

This makes the tags move correctly on their own: the default kurti shows one
Assumption tag (packaging), beauty shows three (its return rate and unsellable
share are ASSUMPTIONs where ethnic wear's are cited to the deck and IBEF), and
footwear shows four because its 800 g default leaves the one shipping slab the
Valmo data pack actually covers. Hard-coding the tags would have quietly lied in
five of the eight categories.

### 19. Three return-rate scenario tabs, defaulting to "most likely"

The headline is a range (₹315 – ₹362), but the funnel, the cost table and the
overhead bars each have to show one scenario. Rather than pick silently, there is
a Low / Most likely / High selector showing all three floors at once, which drives
all three panels together. It defaults to "most likely", never to the optimistic
end.

### 20. The what-if sliders and the Advanced drawer share one state

COD share and return rate appear both as auto-filled values (editable in the
Advanced drawer) and as what-if sliders. They bind to the same state, so there is
never a stale copy — dragging a slider updates the drawer field and vice versa.
The return-rate slider moves the *expected* rate and carries low and high with it
by the same delta, clamped so `low ≤ expected ≤ high` always holds; the drawer is
where the three are set independently.

### 21. The ⓘ panel is split into `InfoButton` + `WorkingPanel`

`ShowWorking` is the all-in-one disclosure used almost everywhere. The cost table
cannot use it, because the button lives in a `<th>` while the panel has to span
the full table width as its own `<tr>`. So the pieces are also exported
separately, with `useWorkingDisclosure()` holding the shared open state. Thirty
panels are wired up on the default screen.

A page-level "Show all workings" switch in the top bar opens every panel at once.
Section 9 assigns that behaviour to Judge mode in Phase 6; the switch is the same
mechanism, so Phase 6 only has to rename it and add the hidden-assumption reveal.

### 22. The deck comparison is shown only while the inputs still are the deck's kurti

The deck's rounded unit counts (17 / 13 / 6 / 70) are only coherent at 17% RTO and
a ~16% return rate. Applied to a beauty product at 3% RTO they would be nonsense,
so the ⓘ panels carry the ₹318 comparison only while category, COGS, weight, COD
mix, packaging, unsellable share, ad spend and season index all still match the
deck. Change any of them and the comparison disappears rather than misleading.

### 23. No borders anywhere, so tables are striped and inputs are filled

The design system forbids borders and drop shadows. That removes the two usual
ways to make a data table and a form input legible, so: table rows alternate
`bg-lilac/60`, the summary block uses `bg-peach` and the floor row `bg-plum`, and
inputs are white fills on tinted cards with a `focus:ring` rather than an outline.
A focus ring is kept deliberately — it is an accessibility requirement, not
decoration.

### 24. Layout: hero number full width, then inputs beside outputs

The floor headline and the you-think/you-actually pair run full width at the top,
then a two-column grid puts inputs left and the funnel, cost table and bars right.
Mobile-first, this means the hero number is the first thing on screen rather than
something the seller scrolls past three input cards to reach — and the defaults
are pre-filled, so it is meaningful immediately. The cost table drops its separate
"working" column below `sm` and prints the working under each amount instead.

### 25. `NumberField` holds its own text

A controlled `type="number"` bound straight to a number coerces a cleared or
half-typed value to 0 mid-keystroke. `NumberField` therefore keeps the raw string,
emits `null` when empty, clamps to `min`/`max` on each keystroke, and snaps the
text back to the canonical value on blur. The page treats `null` as 0 for the
engine, except for the planned price, where `null` correctly means "not entered
yet" and the stat pair stays hidden.

### 26. `floorRange()` gained an optional return-rate override

The Advanced drawer lets the seller edit all three return rates, but
`floorRange(input)` read them from `categories.json`. It now takes an optional
second argument, so the screen can pass the edited triple. Backward compatible —
the Phase 1 tests call it unchanged.

### 27. Screen 1 is verified by rendering it, not by eye

`tests/floorCalculator.test.tsx` renders the real component tree with
`renderToStaticMarkup` and asserts on the markup: the seven deck cost lines with
their working and amounts, the ₹11,763 / ₹168.12 / ₹318.12 chain, the
₹315 – ₹362 headline, the provenance tags, the Advanced drawer, the sliders, and
that every ⓘ panel is collapsed in seller mode and open with the page switch on.
No new dependency — `react-dom/server` needs no DOM, so the tests stay in the
`node` environment.

`npm run verify:screen1` prints the same rendered markup back as a text table, so
the deck reproduction can be checked against the deck without a browser. This was
how the 0.20-vs-0.157 problem in decision 1 was actually caught: the engine tests
passed, and the rendered default table still did not match the deck.

### 28. Not built in Phase 2

No router (Screen 1 renders directly from `App`), no EN/हिं toggle and no Judge
mode — all Phase 6. `src/data/i18n/` is still empty for the reason given in
decision 12. The `labelKey` fields on the cost lines and the `hi` strings in
`SourceTag` are already in place for that phase.

---

## Phase 3 — band, recommendation, verdict, Screen 2

### 29. The listings generator now samples stratified, not independently

Test 6 requires a ₹120 beauty product to come out NOT_VIABLE, which means its
floor must exceed the band's 90th percentile. It did not: floor ₹251.85 against
a p90 of ₹272.

The cause was the generator, not the test. Forty *independent* log-normal draws
give a sample whose p90 can land 10–12% away from the distribution it was drawn
from — ordinary sampling noise at n = 40. But `bandMedian` and `bandSpread` are
**configuration**, not an experiment: a category that declares a median of ₹180
and a spread of ±35% should produce a band whose p10 and p90 really are ₹180/1.35
and ₹180×1.35.

So listing *i* now sits at quantile (i + 0.5)/40 of that log-normal, with a small
jitter so the set does not look mechanically spaced (Acklam's inverse-normal
approximation supplies the quantile). Every band now lands within 5% of its
configured median and 10% of its configured p90 — there is a test for it — and
beauty's p90 falls to ₹240, below the ₹251.85 floor, so test 6's premise holds on
the data the spec specifies rather than by luck.

Still fully seeded and byte-for-byte reproducible. This regenerated all eight
listings files.

### 30. The guardrail checks the stage's RAW target, not the final price

The first version applied the guardrail to the price each stage had already
computed. Since `LAUNCH` was doing `max(band.p30, floor + minMargin)` itself, the
number reaching the guardrail was never below the floor, so the required warning
("You are priced above most of the market…") could never fire — the guardrail
passed its own test while doing nothing.

Each stage now hands the guardrail its **unprotected** target — for Launch that
is `band.p30` itself — and the guardrail is the single place that lifts a price
and attaches the warning. The default kurti exercises this: its floor of ₹318
sits above the band's 30th percentile of ₹282, so Launch is lifted to ₹324 and
says why.

### 31. Decline rests on the floor; every other stage gets floor + minMargin

Section 6.4 says the markdown ladder "stops at floor.expected", while the
guardrail paragraph says a target below the floor returns "floor.expected +
minMargin". Both are honoured by distinguishing them: the ladder is not a band
target, so it stops exactly at the floor, and a `ladderStop` flag tells the
guardrail which rule applies. The seller still gets the warning either way, and
`price >= floor.expected` holds in both — which is what test 5 actually checks.

### 32. NOT_VIABLE is a commercial test, and the wording now says so

The first wording read "even at the very top of the band you would lose money on
every order". The screenshot showed that to be false: the beauty product at ₹257
sits at the 95th percentile and clears ₹5, while the card beside it claimed no
price could make money. NOT_VIABLE is `floor.expected > band.p90` — a statement
about *where you would have to price to break even*, not about arithmetic
impossibility. The text now says you would have to list above almost every
competitor, where buyers barely see you, so raising the price is not a way out.

### 33. `percentileOf` inverts `quantile`, except on ties — and says so

They are deliberately the same definition read in opposite directions, so
`percentileOf(band, band.p50)` returns exactly 50. But listing prices are whole
rupees, so ties occur, and on a tie `quantile` is a step function with a flat —
and a flat has no unique inverse. On a tie `percentileOf` returns the **first**
matching rank, which keeps it monotonic in price. The tests pin exact inversion
on a strictly-increasing array, and a one-rank tolerance (2.6 percentile points
at n = 40) on the real bands, rather than pretending the round trip is exact.

### 34. Verdict and the NOT_VIABLE fixes live in `recommend.ts`

Section 6.2 is its own numbered section, but section 4's file list has no
`verdict.ts`, and the verdict needs the band (so it cannot sit in `floor.ts`)
while the guardrail and the fixes both read it. Keeping it in `recommend.ts`
matches the spec's file list and avoids a file the spec did not ask for.

### 35. The bundle-of-2 fix keeps the same weight slab, and admits it

Section 6.2 says to compute the bundle floor with "COGS ×2, same per-order costs,
divide by 2". Taken literally that holds the parcel weight fixed, even though two
units plainly weigh more and could tip into the next shipping slab. The fix
follows the spec, and the caveat is shown on the card and in its ⓘ panel rather
than buried: "Assumes the pair still ships in the same weight slab."

It is the largest lever by far — ₹252 to ₹188 for the beauty product — precisely
because the per-order costs are what make a cheap product unviable in the first
place.

### 36. Ramp implements section 6.5's step size, but not the learner

Section 6.4 says Ramp "follows the learner", which is section 6.5 and Phase 5.
Rather than show nothing, Ramp applies the step *rule* section 6.5 states (+₹20
below the band median, +₹10 at or above it) and explains the keep/revert test in
its rationale. `RecommendContext` already carries `learnedBestPrice`, so Phase 5
plugs the learner in without touching the stage logic.

### 37. The band chart is CSS, not SVG and not Recharts

An SVG `viewBox` scales its own text down with the chart, and at 390 px the axis
labels, the floor badge and the price marker would be unreadable — fatal for a
chart whose entire job is to put the floor and the market on one legible ruler.
Recharts has no natural form for a 1-D price strip with a shaded loss zone, and
would have cost more code than it saved. So the chart is absolutely-positioned
divs on a percentage scale: the text is ordinary HTML and stays at its proper
size at every width. Recharts earns its place in Phase 5, where Screen 3 has
three real time series.

The loss zone is drawn **over** the p10–p90 band, not under it. Underneath, the
overlap read as ambiguous lilac; the seller needs that overlap to say "this part
of the market is underwater", which is the most important thing the chart has to
communicate.

### 38. One product, shared by both screens

Section 9.3 says Screen 2's inputs are "carried from Screen 1", so the product
moved out of `FloorCalculator` into `src/state/productInputs.tsx`, which also
memoises everything derived from it (floor range, band, slab, season, the deck
comparison). Two screens computing their own floor would eventually disagree.

Screen 2's price slider writes to the same `plannedPrice` that Screen 1's field
does — it is one value with two controls, not a second price. When it is unset,
Screen 2 falls back to the Launch recommendation so the slider always has a
sensible starting point.

Navigation is two tabs in the top bar. Still no router: Home and real routing are
Phase 6, and the active tab is deliberately not in the URL yet.

### 39. `npm run shoot` — screenshots at real device widths

Chrome's `--headless --screenshot` clamps the layout viewport to about 489 CSS px
on this Windows machine (`--window-size=390` and `--window-size=500` both report
489; 800 reports 767). A 390-wide capture of a 489-wide layout looks exactly like
a broken mobile layout, which is what it appeared to be at first — the page was
fine. `--force-device-scale-factor` does not move the CSS viewport either.

`scripts/shoot.mjs` drives Chrome over the DevTools Protocol and uses
`Emulation.setDeviceMetricsOverride`, which honours any width. It also reports
horizontal overflow and names the offending elements, and `SHOOT_EVAL` runs a
snippet before the capture so a screenshot can be taken of a particular state
(Screen 2, a category switched to beauty, a slider dragged). It is built on
Node's own `WebSocket` and `fetch`, so it adds no dependency.

### 40. `num()` was allocating an `Intl.NumberFormat` per call

Found by test 5 timing out at 5 s. Every `floor()` builds a `working` string for
each of seven cost lines, and `units()` routed fractional values through `num()`,
which constructed a fresh formatter every time — roughly 20,000 of them in the
1,000-input sweep. They are now cached by decimal count. The sweep went from
5.9 s (timing out) to 1.0 s, and the same cost was being paid on every keystroke
in the UI.

---

## Phase 4 — triggers, nudges, Screen 4

### 41. T3 tracks the competitors you had, not whoever is nearest now

Spec section 6.6 defines T3 as "median of the 5 closest listings drops > 8%
below your price". Read literally — recompute the five closest every week — the
trigger can essentially never fire, and it took the UI to show it: "Fire all
six" produced five bubbles.

The reason is that "the five closest listings to your price" is self-correcting.
Whatever your price is, five listings cluster around it, so their median sits
*at* your price by construction. I tried modelling the undercut as a wider
market move — cutting every listing within ±5%, ±10%, ±20%, ±50% of the price by
10% — and the measured drop went 7.1%, 7.1%, −1.5%, −1.5%: the further the
nearby listings fell, the more the next ones up slid down to take their place.
In a dense band the nearest-5 median simply cannot sit 8% below you.

An undercut is not "the market is cheaper than me". It is "the sellers I was
competing with cut their prices". That needs memory, so `TriggerContext` now
carries an optional `competitorCohort` — the ids of the five nearest listings at
the time the price was set — and T3 reads those listings' current prices. With
the cohort, the journey's week-12 event (nearest five drop 10%) fires at a 9.9%
drop and reports a median of ₹292 against a ₹318 floor: "Matching to ₹292 would
lose ₹26 per order." Without a cohort it falls back to the literal reading, so
nothing that already worked changed.

This matters for Phase 5: the simulator must record the cohort when the seller
prices, not recompute it each week.

### 42. Each nudge is a body plus a cta, so the seller is not told twice

Spec section 8's Hindi template ends with "दाम जाँचें →", and section 9.5 puts a
"Daam check karein" button on every bubble — the same instruction twice. Each
template is therefore stored as a `body` and a `cta`: the bubble renders the
body, the button carries the cta, and `nudgeText()` concatenates them back into
exactly the string section 8 specifies. There is a test asserting the Hindi T2
message matches the spec verbatim, character for character.

### 43. The phone mock-up is Sahi Daam's, not a pretend WhatsApp

The chat metaphor is right — WhatsApp is where a Meesho seller actually reads
notifications — but reproducing WhatsApp's green bubbles and branding would be
imitating a company we are not. The frame uses the deck's own palette (plum
header, lilac canvas, white bubbles), the sender is "Sahi Daam · Business
account", and a line under the chat says it is a mock-up, not a real WhatsApp
integration.

### 44. Each trigger is probed on the comparison its own rule uses

Test 7 asks that each trigger "fires at its threshold and does not fire just
below it", but the six rules are not written with the same comparison. T1
("≥ baseline + 5pp"), T2 ("≥ 1.4") and T4 ("−20%") fire exactly at the
threshold. T3 ("drops > 8%") and T5 ("changes by > 5%") are strict, so the
threshold value itself must *not* fire — the test asserts silence at exactly 8%
and 5% and firing a hair above. T6 has no numeric threshold at all; its boundary
is "a price changed or it did not", so it is tested at a one-rupee change.

Writing all six as `>=` would have made the test read more uniformly while
quietly contradicting two of the spec's own rules.

### 45. The Fire T1–T6 buttons build honest contexts

Each button runs the real rule — none of the six is forced to return an alert.
What the button supplies is the scenario: T1 gets two weeks of returns 6 points
above baseline (the journey's week-16 event), T3 cuts the five nearest listings
10% and remembers the cohort (week 12), T5 raises COGS 6% (week 14), T2 looks
two weeks out from the November peak, T4 drops impressions a quarter with the
category flat, T6 panic-cuts 15%. Each button names its scenario on the card, so
a judge can see what is being assumed. If a rule stopped firing, the button would
produce nothing — which is exactly how the T3 problem in decision 41 surfaced.

### 46. Alerts carry a `restore` point, so "Daam check karein" can deep-link

Spec section 9.5 wants the button to open Screen 2 "with that week's numbers
loaded". Each alert therefore carries an optional `restore` — price, COGS, month
and return rate as they were when it fired — which the button applies to the
shared product before navigating. Firing T6 (a 15% panic-cut from ₹324) and
pressing the button lands on Screen 2 with ₹275 in the slider and the verdict
already recomputed.

### 47. The bubble chrome is translated too, ahead of Phase 6

Section 9.5 asks for the alerts "in the selected language". `nudges.ts` covers
the message, but a Hindi message under an English heading, above an English
"Week 15 · Losing money now", reads like a half-finished translation. The
trigger titles, severity labels, the week word and the chat header are therefore
in both languages now. This is deliberately narrow — only the strings inside the
phone — and the rest of the app still waits for the Phase 6 i18n pass.

---

## Phase 5 — learner, simulator, Screen 3

### 48. `learner.ts` has no imports at all

Test 9 asks that it not import from `simulator.ts`. The strongest version of that
is to import nothing whatsoever: every input — price, impressions, orders,
survival rate, floor, category trend, the band median — arrives as an argument.
The test asserts the import list is empty and that the file never even names a
hidden parameter, so the isolation cannot rot by someone adding a "small"
import later.

The category trend is the one input worth defending. The learner divides its
metric by it, so it has to see it. It is not a hidden parameter of this
product's demand curve — it is a category-level statistic Meesho publishes, and
without it a festive lift reads as a pricing win. There is a test for exactly
that: orders flat, category up 50%, raw metric rises, normalised metric flat,
step reverted.

### 49. The spec's learner metric over-prices, and the band p90 is what stops it

Section 6.5 defines the metric as profit per 1,000 *impressions*. Impressions
cancel out of it, which means visibility cancels out too — so the metric cannot
see that a dear listing is shown to fewer people. Maximising it drives the price
towards floor × ε/(ε−1), which for ε = 2.2 and a ₹318 floor is ₹583: the 100th
percentile of a market whose p90 is ₹430.

I implemented the metric exactly as specified rather than quietly "fixing" it.
What stops the over-pricing is a product rule, not a change to the maths: Sahi
Daam never prices above the band's 90th percentile unless the floor itself is
above it, because past that point a listing stops being found whatever the
arithmetic says. With the cap the journey settles at ₹385–₹430 instead of ₹487,
which is a price a seller would recognise.

### 50. Order noise, on top of the impression noise the spec asks for

Section 7.1 puts ±8% noise on impressions only. But orders are derived from
impressions, so they inherit exactly the same noise and the observed conversion
rate — orders ÷ impressions — comes out perfectly clean. Two consequences, both
bad: ε̂ would be recovered as exactly 2.200 every single week, which reads as
rigged rather than impressive, and the learner's 2% test would be noiseless, so
it would march smoothly to the theoretical optimum.

A separate ±6% on orders (documented as an ASSUMPTION in the same hidden block)
fixes both. The per-step estimates now scatter — 3.30, 2.10, −0.27, 3.11, 1.10,
1.50, 4.40 — and the running average lands at **2.177** against a true 2.2. The
scatter is the honest part: a ₹10 step on one week of data really is a weak
signal, and averaging is what makes it usable.

### 51. The week-12 undercut belongs to the world, not to the strategy

First version computed it per strategy, against that strategy's own price. Sahi
Daam launched at ₹324 and the instinct seller at ₹300, so a different five
listings were cut in each run and the two bands diverged — which quietly broke
spec section 7.3's "identical world". The test that compares `bandP50` week by
week is what caught it.

It is one marketplace: the same five listings cut their prices whoever is
watching. The cut is now anchored on the launch recommendation and shared.

### 52. ...and it is resolved once, not recomputed every week

Separately, the undercut was being recomputed each week against the *current*
price, so as the price moved a different five listings got cut, p90 shifted, the
p90 cap moved, and the price moved again — ₹430, ₹399, ₹430, ₹406, ₹429 week
after week, chasing its own tail. The market cannot be a function of this week's
price. Fixing it made the price line smooth and readable.

### 53. When the floor rises, Sahi Daam carries its margin instead of hugging the floor

The obvious "safe" response to a festive floor spike is to reprice at
floor + minMargin. It is badly wrong. At a festive floor of ₹420 that earns
about ₹9 a sale; carrying the ₹67 margin the learner found earns about ₹67, and
the volume given up is far smaller than the margin gained — roughly 4.5× more
profit in the model. Sahi Daam therefore moves to `floor + learnedMargin`,
capped at the band p90 (decision 49) and never below `floor + minMargin`.

This is also what the T1 and T2 alerts tell the seller to do, so the simulated
strategy and the advice on Screen 4 agree.

### 54. One reorder, not none and not unlimited

With no restocking the instinct seller sold out in week 11 and his
cumulative-profit line flatlined for 15 weeks — he never reached the festive
season, which is the most expensive lesson in the journey. With unlimited
restocking he sold 5,640 units and lost ₹4.2 lakh, which no seller of 1,500
units could fund.

One reorder of 500 units, the same rule for both strategies. The instinct seller
now trades into week 14 and still runs out; his line going flat is annotated on
the summary rather than left as a mystery.

### 55. Alerts fire on the rising edge

A condition that holds for ten weeks produced ten identical alerts — T3 repeated
every week from week 12 to week 26. Nobody reads the same WhatsApp every Monday,
and a repeated alert trains a seller to ignore all of them. The simulator now
emits an alert only when that trigger was not already firing the week before.
The journey's log went from a wall of duplicates to six alerts that each mark a
real event.

### 56. T2 only fires when the floor is actually still going to rise

Deep in the festive season the index two weeks out equals the index now, and the
alert read "Festive RTO will lift your floor from ₹349 to ₹349" — a warning
about something that had already happened. The rule now also requires
`ahead > now`. "Reprice before the peak" is only useful before the peak.

### 57. T3 only fires when the rivals actually cut

With cohort tracking (decision 41) T3 started firing in week 7 — five weeks
before the scripted undercut — because the ramp had moved Sahi Daam's price up
and away from its old neighbours. The gap was real, but the message, "the
listings closest to yours have dropped to ₹292", was false: they had not moved,
the seller had.

`TriggerContext` now carries `competitorReferenceMedian`, the cohort's median
when the price was last set, and T3 requires the current median to be below it.
Being above your old neighbours is a visibility problem, and T4 is the trigger
for that — it duly fires in week 14. The journey's alerts now land exactly where
acceptance item 5 says they should: weeks 12, 14, 16 and 17.

### 58. Recharts, finally

Phase 3 deferred it, and Screen 3 is what it was being saved for: three real
26-week time series. Chart A (price against floor and band), Chart B (weekly
profit, losing weeks in magenta via per-cell fills) and Chart C (the hero,
cumulative profit for both strategies with the festive weeks marked). The
band chart on Screen 2 stays hand-built CSS for the reasons in decision 37.

One consequence: the production bundle is now over Vite's 500 kB warning
threshold, almost entirely Recharts. Code-splitting Screen 3 is a Phase 7
polish item, not a correctness problem.

### 59. `toISOString()` was moving every Monday to Sunday

Week dates were a day early across the whole journey — week 1 showed
2026-07-05. `new Date('2026-07-06T00:00:00')` is local midnight, and
`toISOString()` converts to UTC first, which in India is 18:30 the previous day.
The simulator now formats from the local date components. Week 1 is Monday
6 July 2026 and Diwali falls in week 19, inside the festive stretch, as spec
section 7 requires.

### 60. Judge mode rides on the existing switch for now

Section 9.4 wants judge mode to reveal the hidden ε = 2.2 beside the learned
estimate. That is wired to the existing "Show all workings" toggle rather than a
second control, since Phase 6 turns that switch into Judge mode proper. The
learner panel shows ε̂ 2.18 always, and "true ε = 2.2" only when it is on.

---

## Phase 6 — Home, Screens 5 and 6, i18n, Judge mode

### 61. Both dictionaries are generated from one paired list

`scripts/generate-i18n.mjs` holds `[key, English, Hindi]` triples and writes both
`en.json` and `hi.json`. Two hand-maintained JSON files drift, and a missing
Hindi key surfaces as raw dot-notation in the middle of a demo. Generating both
from one source makes a mismatched key set impossible, and the generator throws
on a duplicate key. 167 keys.

The lookup still falls back to English on a miss rather than printing the key:
a belt as well as braces, because the one thing worse than an untranslated
string is `floor.costTableHint` on screen in front of a judge.

### 62. What the Hindi toggle covers, and what it does not

Acceptance item 6 asks that the toggle "translates all labels and alerts", and
that is exactly the line drawn. Translated: navigation, screen titles, card
titles and hints, every field label, the provenance tags, verdicts, lifecycle
stages, funnel stages, all seven cost-line names and the cost table's summary
rows, stat labels, buttons, Home, Screen 5 and Screen 6 in full — and the alert
messages, which were already bilingual from Phase 4.

Not translated: the generated contents of the ⓘ working panels — `"100 × ₹50"`,
`"Band 30th percentile is ₹282; your floor is ₹318…"` — and a handful of
explanatory notes under fields. These are composed in the engine from live
numbers, so translating them means writing a second Hindi sentence generator for
every rationale, fix detail and alert detail. The numbers inside them are already
language-neutral and in Indian digit grouping.

Measured rather than guessed: on Screen 1 in Hindi, English-only lines fell from
100 of 250 to 37 of 250, and the 37 are the formula strings. If this goes
further, the right move is for the engine to emit structured steps plus an i18n
key instead of finished sentences — a real refactor, not more dictionary entries.

### 63. Judge mode is one switch, not two

Spec section 9 describes Judge mode as doing two things: revealing the formula
panels by default, and showing the hidden simulator assumptions. Phase 2 had
shipped a "Show all workings" toggle as a stand-in for the first half. Rather
than ship both controls, Judge mode absorbed it: it drives `ExpandAllContext`
and the journey screen's ε reveal from a single state.

Verified both ways rather than assumed: in seller mode Screen 1 has 0 open
panels and the journey screen does not contain the true ε; with Judge mode on,
Screen 1 has 29 open panels and the learner card reads "true ε = 2.2" beside the
learned 2.18.

### 64. Screen 5 shows Meesho's range as p25–p75, and prices all three points

Spec section 9.6 says "Recommended price range ₹p25–₹p75", so the comparison
uses the middle half of the same synthetic band — the honest reconstruction of
what the existing tool would say. The spec's illustration is a single verdict at
the midpoint; the screen gives all three, because that is where the argument
actually lives: for the default kurti, the bottom of Meesho's range (₹279) loses
₹39 an order, the midpoint (₹325) clears ₹7, and the top (₹371) clears ₹53.
Three verdict badges, one range, no editorialising needed.

The checklist is deliberately not a hit piece. Meesho's tool gets two honest
ticks for the two things it does know; the point is that the four it does not
know are the four that decide whether the seller makes money.

### 65. Screen 6 lists the simulator's hidden parameters too

`sourcedEntries()` now covers the journey's product, calendar and — the point —
its `hiddenDemand` block, including ε = 2.2. The learner is kept away from those
values; a judge should not be. 136 values in total, 115 of them assumptions,
grouped and searchable, each with a CITED or ASSUMPTION badge.

Rows whose source is literally the word "ASSUMPTION" show the badge and nothing
else, rather than the badge followed by the same word again.

### 66. The nav scrolls sideways rather than wrapping

Seven destinations. Wrapped, they took three rows on a phone and pushed the
actual screen below the fold. `overflow-x-auto` on the tab strip keeps the
header one row at every width.

### 67. Screen 4's local language toggle is gone

Phase 4 gave the alerts screen its own EN/हिं switch, because there was no
global one. There is now, and two controls for one setting is a bug waiting to
confuse someone. The bubbles follow the top bar.

### 68. Still no router

Home exists and the six screens are reachable, but the active screen is still
component state rather than a URL. Nothing in the demo needs a shareable link,
and a router would add a dependency and a deployment concern for no gain here.
Worth revisiting if this is ever handed to real sellers, who do share links.

---

## Phase 7 — edges, responsiveness, deploy, the demo path

### 69. Edge cases are tested by rendering every screen into every corner

`tests/edgeCases.test.tsx` renders all six screens plus Home against thirteen
sets of extreme inputs — everything cleared, zero cost, a price of zero, a price
below cost, a 20 kg parcel, every order returned, nothing returned, all COD all
refused, a ₹100,000 ad spend, a ₹1,000,000 product — and asserts that no screen
produces `NaN`, `Infinity`, `undefined`, `[object Object]`, a runaway float or an
unfilled `{placeholder}`. 85 assertions.

The check is split deliberately. `NaN` and `Infinity` are bugs **anywhere**,
including inside a `style` attribute or a slider's `max`, where they silently
break a control without showing a mark on screen. Runaway precision only matters
in what the seller reads, so that check runs on the text with tags stripped — a
width of `24.908499532299835%` in CSS is untidy, not wrong.

It found three real bugs, below.

### 70. A seller who returns everything used to break three things

With `returnRate = 1` no order survives, the floor is correctly `Infinity`
(decision 5), and three places downstream had not been told:

- **The overhead bars** divided each line by zero clean sales, giving `Infinity`,
  then divided that by an `Infinity` maximum — `NaN`, written straight into a
  style attribute as `width:NaN%`.
- **The band chart** put `range.low`/`range.high` into its scale, so the domain
  became infinite and every marker position was `NaN`.
- **The price slider** on Screen 2 rendered `max="Infinity"` and
  `value="Infinity"`, which makes the control unusable.

All three now filter non-finite values out of the geometry rather than
propagating them: the chart leaves them out of its scale and pins the floor
marker to the right edge with the label "no price works", the bars collapse to
zero width, and the slider falls back to the band's own bounds.

### 71. `profitPer100Dispatched` returned NaN when nothing survived

`cleanSales × (price − floor)` is `0 × −Infinity`. The honest answer is not
"unknown": you sold nothing, so you earned nothing, and you still paid every
rupee of overhead. It now returns `−totalOverhead` in that case, which is both
finite and correct.

### 72. Bar and funnel widths are rounded before they reach the DOM

A share of 0.17 becomes `width:17.000000000000004%`. Harmless, but it makes the
rendered DOM hard to read and invites subpixel jitter. Every percentage that
goes into a style attribute is now rounded to one decimal and clamped to 0–100.

### 73. Responsiveness is measured, not eyeballed

All seven screens were captured at **360 px and 768 px** through the DevTools
Protocol, with the overflow probe reporting `document.scrollWidth` against the
viewport. All fourteen combinations report no horizontal overflow. The three
things that needed fixing for this were already done in earlier phases — the
cost table dropping its working column below `sm` (decision 24), the nav
scrolling sideways (decision 66), and the band chart being CSS rather than SVG
so its labels do not shrink (decision 37).

### 74. The journey's alert detail opens on the phone

Spec section 13's demo stops at week 16 "to show the alert **on the phone**".
The journey screen was showing it as another card with the message quoted inside.
It now opens in the same `PhoneFrame` Screen 4 uses, with the same `AlertBubble`
— one component, two screens, and the demo beat lands as written.

### 75. The demo path is a test, not a script to remember

`tests/demoPath.test.ts` pins every number the presenter says out loud: ₹315–₹362
and ₹318 at beat 1, ₹150 against −₹18, the ₹11,763 cost table, ₹374 in November,
the verdict flipping as the price crosses the floor, beauty at ₹120 being
NOT_VIABLE with the bundle as the biggest lever (₹252 → ₹188), Meesho's range
losing ₹39 an order at its bottom end, and the journey's +₹46,058 against
−₹33,508 with alerts in weeks 12, 14, 16 and 17. An engine change that quietly
moves one of them now fails the build instead of surfacing on stage.

It also asserts the journey plays in under a minute: 26 weeks at 1.3 s is 33.8 s.

### 76. Screen 3 is code-split

Recharts is about 60% of the bundle and only the journey screen uses it. Loading
it lazily takes the initial bundle from 774 kB to **356 kB** (100 kB gzipped),
with the journey's 420 kB fetched when that tab is opened. This also clears
Vite's chunk-size warning, which had been outstanding since Phase 5. The
Suspense fallback is a translated line rather than a spinner.

### 77. `vercel.json` ships with the repo

The app is a static SPA, so Vercel's Vite preset would work untouched — but
pinning the build command, the output directory and the catch-all rewrite in the
repository means the deploy does not depend on dashboard settings someone has to
remember to set. The rewrite matters only if routing is ever added; today there
is a single entry point.

---

## Beyond the spec — accounts and onboarding

Spec section 3 says "no backend, no login". This goes past that, on request. It
is worth being clear about why it is an improvement rather than scope creep:
until now the fields tagged *Meesho ne bhara* on Screen 1 were a category
default the prototype picked. With a signed-in seller they are that seller's own
answers, and the tag finally tells the truth.

### 78. The sign-in page says, on the page, that it is not real authentication

There is no server. Accounts sit in `localStorage`, the password goes through
FNV-1a — which is a hash function, not a password hash — and anyone with the
device can read all of it. A login box is the one thing in this prototype that
could genuinely mislead someone, so the warning is on the sign-in card itself,
in both languages, not only in a comment. There is a test asserting the page
contains it.

A stronger digest was considered and rejected. SubtleCrypto would make the
stored value look respectable without making it safe, which is worse than an
obviously weak digest next to an explicit warning. The honest fix is a server,
and that is out of scope.

Two demo accounts are seeded (`ramesh@demo.in` / `admin@meesho.demo`, password
`sahidaam`) with one-tap buttons, so a judge never has to sign up before seeing
anything.

### 79. Six questions, each one replacing a guess

Every question maps onto a field the floor calculation needs:

| Question | Fills |
| --- | --- |
| What do you mostly sell? | category → return rate, packaging, write-off share |
| What does one piece cost you? | COGS |
| What does one parcel weigh? | the shipping slab |
| Where do most of your buyers live? | COD share |
| Do you discount for prepaid? | COD share, again |
| How many orders a week? | stock cover |

The buyer-location question is the one that earns its place. Metro / mixed /
small-town maps to a COD share of 0.55 / 0.80 / 0.92, and a prepaid discount
takes ten points off. COD orders are refused far more often than prepaid ones,
so this single answer moves the floor more than anything else the seller tells
us — there is a test asserting a small-town seller's floor comes out genuinely
higher than a metro seller's on an identical product.

The onboarding shows the floor being built as the questions are answered, using
the real engine rather than a preview approximation. Answering is worth
something before you have finished answering.

### 80. The admin console is what makes "Meesho ne bhara" true

An admin sets the platform-wide numbers — COD handling fee, GST on forward
shipping, RTO on COD and on prepaid — and those flow into every seller's floor
through `FloorInput.fees`, which already existed for exactly this.

The table underneath shows each registered seller's floor **before and after**
the pending change, struck through and in orange, so the admin can see what
moving the COD fee by ₹2 does to real sellers before applying it. Each of those
floors is computed with that seller's own category, cost, weight and buyer mix,
by the same engine the seller sees.

Shipping slabs, season indices and per-category return rates stay read-only.
They are larger datasets that belong in a real admin tool, and the Numbers &
sources screen already lists every one with its citation.

### 81. The product state is keyed on the account

`<ProductInputsProvider key={account.id}>`. Without the key, signing out of one
seller and into another would carry the first seller's cost and weight across,
because the provider's `useState` initialiser only runs once. Keying on the
account id forces a rebuild from the new seller's answers.

### 82. The alerts are addressed to the actual seller

`nudgeFor` already took a `name` option from Phase 4, so the WhatsApp messages
now say "Sunita ji" when Sunita is signed in, rather than always "Ramesh ji".
The journey screen keeps Ramesh, because that is a fixed scripted story about a
specific seller rather than about whoever is logged in.

---

## Seller floor vs cost-to-serve (policy correction)

The original model charged the seller every logistics cost on every order plus a
COD fee — the deck's ₹318. Meesho's published supplier policy
(supplier.meesho.com/pricing, /shipping) says the supplier pays no COD or
collection fee and no return-shipping fee on RTO orders; reverse shipping is
charged on customer returns, by weight. Charging the seller for costs the
policy says Meesho bears overstated their floor by about ₹48 on the kurti.

- `sellerFloor()` is now the model every seller-facing screen, verdict,
  recommendation, trigger and the simulator use: forward on delivered orders,
  reverse on customer returns, 18% GST on both, packaging on every order,
  unsellable returns, ads. Kurti: ₹270.64 (₹267.92 – ₹311.72).
- `costToServe()` is the old function, unchanged, shown alongside and labelled:
  ₹318 on the deck's rounded units, ₹318.12 continuous.
- `meeshoAbsorbs()` is the RTO forward fee and its GST, the RTO return leg and
  COD handling, per clean sale: ₹51.49 on the kurti.
- Whether the forward fee is also charged on RTOs is DISPUTED between 2026
  seller guides. Default off; a setting under Advanced switches it on (₹284.98).
- Rates default to the DICE data pack (₹50 / ₹120). "2026 reported seller
  rates" (₹65 / ₹155 at ≤ 500 g, ASSUMPTION) gives ₹299.33.

Consequences, stated rather than hidden: festive RTO barely moves the seller
floor (₹270.64 → ₹273.11 in November), so the T2 alert now talks about refused
COD orders, fewer deliveries and stock in transit, and quotes the real change.
The cheapest NOT_VIABLE beauty product is now ₹152, not ₹120. In the journey,
seller instinct and Meesho range both make money; Sahi Daam leads on profit per
unit. Across the 15-run robustness grid it beats instinct 15/15 and the Meesho
range 12/15 — it loses all three seed-3 runs, by up to ₹3,815.

---

## MVP Phase 0 — engine v2 and fixtures

Spec section numbers below refer to `SAHI_DAAM_MVP_SPEC.md` (v2).

### 83. Engine v2 lives beside the prototype engine, not inside it

`src/engine/keep.ts`, `saleLift.ts` and `report.ts` are new files. Nothing in
`floor.ts`, `sale.ts` or `recommend.ts` changed, so every story-page default is
untouched (section 6: "do not change existing default outputs"). A test checks
that on the same inputs `keepPerSale().floor` equals `sellerFloor().floor` for
both GST settings, so the two engines can't drift apart without a test failing.
v2 takes RTO and return rates and shipping fees as direct inputs, because a
report gives exactly those, while the prototype derives RTO from a COD mix.

### 84. rates.json duplicates some prototype values; a test keeps them equal

The story pages read `categories.json` / `fees.json` / `weightSlabs.json`; v2
reads `rates.json`. Rather than rewire the story pages (and risk their
outputs), the overlapping values are duplicated and `tests/rates.test.ts`
fails if they differ. `lastVerified` is the date of the commit that entered a
value from its source, or 2026-10-20 for the rates checked on the web in this
phase (TCS 0.5%, TDS 0.1%, apparel/footwear GST 5% under GST 2.0). Deck-derived
numbers (return rate 0.157, unsellable 0.46) are marked ASSUMPTION, not CITED:
they come from our own worked example, not an outside source.

### 85. Output GST: the spec's 12% choice no longer exists for apparel/footwear

GST 2.0 (Notification 9/2025-Central Tax (Rate), from 22 Sep 2025) put apparel
and footwear up to ₹2,500 at 5% and removed the 12% slab for them. The choice
list keeps 12% because section 6.1 lists it, with a note in rates.json. Phase C
should decide whether to drop it from the picker. Non-apparel defaults (home
18%, beauty 18%, jewellery 3%) are ASSUMPTION; the seller confirms their HSN rate.

### 86. The shop-setup RTO prior is built from the DICE rates

Section 6.1 asks for a prior "from buyer region and prepaid discount" but gives
no numbers. Mixed buyers with no discount reproduce the prototype's 17%
(80% COD × 20% + 20% × 5%). A prepaid discount shifts 20 points of COD to
prepaid (the prototype's existing prepaid fix), giving 14%. Big cities / small
towns scale the COD RTO by 0.75 / 1.25. Those two multipliers are our
estimates, marked ASSUMPTION, and a report replaces the whole prior.

### 87. Prepaid push = RTO down 3 points, and it barely moves keep

The prepaid push used by the sale check is the same 20-point COD shift priced
at the COD/prepaid RTO gap: 0.2 × (20% − 5%) = 3 points, never below the
prepaid RTO. Under Meesho's published policy an RTO costs the seller only
packaging, so for the default kurti the push adds about ₹0.40 a sale. So
"Join only with prepaid push" is rare unless the forward fee is charged on
RTOs. The test case for it uses RTO 30% with `fwdOnRto` on. Phase C's "Push
prepaid" action will show small rupee effects under the default policy. That
is the honest number, but the team should know before the demo.

### 88. Sale-check verdict order, and a fifth verdict

Section 7.7 lists Join / Join only with prepaid push / Skip (keepAtSale ≤ 0)
and "fix the price first". It doesn't say what happens when each sale still
earns but the lift needed is over 30%. That is `SKIP_LIFT`. Order: fix price
first → join → join with prepaid → skip (loss) → skip (lift). Prepaid comes
before the loss skip, as in the prototype's sale check, because a sale price
under today's floor can still clear the prepaid floor. Both lifts are computed
under their own assumptions (the prepaid lift is keep ÷ keepAtSale with the push
applied to both).

### 89. Reconciliation compares payouts before TCS/TDS, and always calibrates

The report's settlement has TCS and TDS taken out. They are claimable, so they
are added back before comparing with the model, and the model doesn't need to
estimate them. Hard rule 1 says the report's numbers replace estimates
whenever a report exists. So `reconcile()` always returns the calibrated
input; the ±5% result says whether our model was right, not whether to listen
to the report. Gap lines come from swapping one input at a time from estimate to
report and measuring the change in modelled payout. Below 20 dispatched orders
the actual charges (price, shipping) still come from the report, but RTO and
return rates stay estimated ("Low data").

### 90. Fixture parsing uses exact synthetic headers until Phase B

`tests/fixtures/reports/loadReport.ts` maps the synthetic files' column names
by exact header. The engine takes already-mapped `OrderRow`s, so Phase B's
keyword detection and mapping screen slot in front without engine changes.
SheetJS is installed from the official CDN tarball (`xlsx-0.20.3`), because
the npm registry copy is stale and has open advisories.

### 91. The samples arrived in `private_reports/`, not `sample_reports/`

They were copied to `tests/fixtures/reports/synthetic/` as the spec asks.
`private_reports/` stays untracked for future real reports. Its `.gitignore`
line had been appended in UTF-16, so git ignored nothing; it is now plain text.

---

## MVP Phase A — shell, onboarding, manual product, home

### 92. The prototype moved to `src/story/` and runs under `/how-it-works/:screen`

`pages/`, `components/`, `state/`, `auth.tsx`, `i18n.tsx` and `App.tsx` (now
`StoryApp.tsx`) were moved with `git mv`, so history follows them. The only
code changes in the story: each screen is now a URL (`/how-it-works/floor`
etc.) instead of component state, so browser back works between screens. Its
language provider also accepts the app's language on entry. Page content and
engine outputs are unchanged, and all 280 prototype tests still pass. The
story loads lazily, with Recharts, so it adds nothing to the seller app's
first load. Its own sign-in gate stays, as it was. `?demo=ramesh` now goes
on `/how-it-works`.

### 93. One shop record per device; language lives on it

Section 9's `shop` table holds a single row (`id: 'main'`). It is created at
the first onboarding answer, and every answer autosaves to it, so back keeps
answers (8.2). I added two fields the data model didn't list: `onboardedAt`,
which gates the app and is set when shop setup is finished, and
`storagePersisted`, the answer to `navigator.storage.persist()`, asked once
on the first save. Before a shop exists, the landing page's language choice
is kept in localStorage as a per-device convenience only.

### 94. Panel charges are typed with GST; the engine works before GST

The seller copies "shipping charge" from their supplier panel. The synthetic
report labels these "(Incl. GST)", so the form asks for them with GST and the
app divides by 1.18. Left blank, the field shows exactly what we'll use
instead ("We'll use ₹59 · Typical for a 350 g parcel") with an Estimated chip.
Verify against a real panel during the G1/G4 seller sessions.

### 95. Status thresholds and leak-finder order

Loss means keep < 0. Thin means a margin over the floor under 10% of the
price, the same line as the prototype's verdict. Everything else is Healthy.
Rows sort by status first (Loss, Thin, Healthy), then by money lost a month
(known before unknown), then by keep per sale. Monthly = orders a week × 52/12
× (1 − RTO) × (1 − returns) × keep. The top card counts only products with an
order count and hides when there are none (7.5).

### 96. A buyer-region change barely moves the floor, and that is correct

While writing the "2 products changed status" test, a region switch from
Mixed to Small towns changed no status. Under Meesho's published policy an
RTO costs the seller only packaging (no forward or return fee), so 4 more
points of RTO move the kurti's floor by paise. The GST setting moves it
more (₹268.74 vs ₹270.64), so the test uses that. This is the same finding as
decision 87, seen from the shop-setup side.

### 97. Layout: bottom nav up to 1023 px, sidebar from 1024 px

This follows the amended Section 13. Tablet keeps the bottom nav (the spec
allows that or a rail) and gets a two-column home (list + "at a glance").
Laptop gets the sidebar and a list–detail split on Products. Forms hide the
bottom nav and use a sticky save bar. The phone frame is an iframe of the
same URL at 390 × 844 px, so the real phone breakpoints apply inside it.
It is sized in px rather than rem, because a device doesn't grow with Hindi
text size. Hindi raises the root size to 106.25% (17 px). Everything else is
rem, so the phone's own larger-text setting scales the whole app.

### 98. Self-hosted, subset fonts; ₹ comes from Noto Sans Devanagari

Fontsource Latin Poppins (4 weights) and Devanagari Noto Sans (2 weights),
no Google Fonts request, so the app also works offline later. The ₹ sign is
outside Poppins' Latin subset, so it renders from the Devanagari font (about
50 KB, cached). A metric-matched Arial fallback (`Poppins Fallback`) limits
layout shift while fonts load.

### 99. Initial JS is 125 KB gzipped (budget 250 KB)

`npm run check:bundle` enforces this. The app avoids `src/data/index.ts`,
which drags in the prototype's eight synthetic listing files. A small
`categoryNames.ts` gives it just the names.

### 100. Report upload is behind a flag; Contact link omitted

The landing's primary button ("Upload my Meesho report") is required by 7.1,
so it stays and leads to `/upload`. With `FLAGS.reportUpload` off, that page
says upload is coming and offers manual entry. Phase B turns it on. The
footer has Privacy and How it works but no Contact link yet: the team hasn't
given a contact address, and I didn't want to invent one.

### 101. UI tests run React Router in jsdom with a one-line Request shim

The data router builds a `Request` with jsdom's AbortSignal, which Node's
`Request` rejects, so every navigation silently failed in tests.
`tests/app/domShim.ts` drops the signal; the app has no loaders, so nothing
reads it. Back buttons decide "go back or go to the parent?" from React
Router's location key (`'default'` = first entry), not from
`window.history`, so they behave the same in the browser and in tests.

---

## MVP Phase B — report upload and reconciliation

### 102. The app's reconciliation tests our fee model, not our category defaults

Phase 0's `reconcile()` compared the report with full estimates, so a seller
whose returns differ from the category default "differed". That says nothing
about whether our model is right. `reconcileReport()` instead applies our fee
rules (shipping by weight, 18% fee GST, who pays on RTOs and returns) to the
report's own counts and price. A gap therefore means a fee or policy we have
wrong, and the gap lines list only fee inputs. The report's numbers are used
from then on either way (hard rule 1). `reconcile()` is unchanged, and so are
its Phase 0 tests.

### 103. Synthetic fixtures reconcile at 0.0%, and that proves less than it looks

All five products in both weeks (xlsx and csv) match to the paisa, because
the synthetic files were generated with the same fee rules. That validates
parsing, totals and the reconciliation arithmetic. It does **not** validate
the model against Meesho. Only real reports (G1) and sellers' own payouts
(G5) can, and the pitch must not claim a match on synthetic data.

### 104. Detection: normalised headers, scored keywords, one header per field

Headers are lower-cased with punctuation stripped, then scored against
keyword patterns with exclusions (e.g. "Total Sale Amount (Incl. Shipping &
GST)" can never be the shipping charge, and "Payment Status" loses to
"Live Order Status"). Values break ties for the status column. Each header
is used once, best score first. The header row is the most header-like of
the first 15 rows, so title rows above it are fine. Required fields are SKU,
status and settlement; anything else missing is optional. If a required
field is missing, the mapping screen opens. The mapping is saved against a
signature of the file's headers and reused automatically for the same layout.

### 105. Personal columns are dropped by header, before any value is read

Buyer name, phone, mobile, address, email and PIN code columns are found by
header and removed when the header row is found. After that point no code
can reach their values, and the mapping screen can't offer them. "Customer
State" is a region, not a person, so it stays (unused for now). The raw
grid exists in memory only during that first step. Tests assert that no
buyer name, sub-order id or order line ends up anywhere in IndexedDB.

### 106. Ads without a SKU are split by orders; compensation lowers costs

The sample Ads sheet has campaign totals with no SKU. Rather than drop ads
(which would overstate keep), the total is split across products by their
share of dispatched orders, and the result screen says so (estimated). With
a SKU column, ads go to that SKU. Compensation and Recovery rows are linked
to products through Sub Order No. Money paid to the seller counts as a
negative cost and money recovered as a positive one, so calibration now
takes `penaltiesTotal` signed (previously `Math.abs`, which would have
turned compensation into a cost). A CSV export has no side sheets, so ads
and penalties stay `null` (not 0) and the estimates keep their chips.

### 107. Products match reports by SKU; new SKUs get one cost field

Matching is case- and space-insensitive on the product's SKU. The product
form gained an optional SKU field so hand-added products can match. An
unmatched SKU gets one quick cost field (spec 7.3). If the seller already
typed products in without a SKU, a "same as" dropdown links the SKU instead
of creating a duplicate. New products start at the shop category's default
weight. The report's own shipping charges are used anyway, but the
fee-model check uses the weight, so a heavier item (the 600 g saree) shows
"differs: shipping ₹59 vs ₹82.60" with a hint to correct the weight.

### 108. The latest report per SKU wins; monthly figures come from its period

Latest = the latest period end, then the latest upload. Monthly = clean
sales in that report × 30.44 ÷ the report's days, from Order Date. Without
dates, the typed orders per week are used if present. Week-on-week checks
(C2/C3) will compare consecutive reports in Phase D.

### 109. Duplicate = same SHA-256; Web Crypto with a plain-JS fallback

Web Crypto doesn't exist on plain-http LAN testing, so a plain-JS SHA-256
gives the identical hash there (tested against the FIPS "abc" vector and
against Web Crypto on a fixture). The `reports.fileHash` index is unique, so
the database itself refuses a second copy.

### 110. Upload instructions are generic until G1 sellers describe theirs

"Supplier Panel → Payments → download the payment file" is a best guess.
Spec 7.3 asks for steps written from what real sellers describe, with their
screenshots. Replace the four `upload.step*` strings after the G1 calls.

### 111. Me → Reports → Remove is in Phase B

Spec 8.2 lists it as a backward flow, and it only makes sense once reports
exist. Removing deletes the report and its totals (products fall back to
estimates), with a 10-second Undo.

### 112. Test timeout raised to 30 s

Fixture parsing and jsdom upload flows ran past the 5 s default when all 23
files ran in parallel on this machine. Parsed fixtures are now cached per
run, and the per-test timeout is 30 s.

---

## MVP Phase C — floor card, price helper, sale check

### 113. Floor card, price helper and sale check are three routes

`/products/:id` is the floor card, `/products/:id/price` the price helper and
`/products/:id/sale` the sale check. Each screen has one big answer (section
13), browser back works between them, and on a laptop they all open in the
right-hand pane. All three read one `buildProductModel()`, so they can never
disagree about a product's numbers.

### 114. "Why" lines are per clean sale; the working shows the per-100 arithmetic

Each line is its total on 100 dispatched ÷ clean sales, with the source chip
of the input that drives it. The lines add up to "each sale must bring in"
(the net floor); a GST-registered seller then adds the GST inside the price
to reach the floor. "Show working" shows paise, e.g. "83 × ₹50.00 = ₹4,150.00
on 100 orders sent ÷ 69.97 clean sales", plus the rate list with sources. Fee
GST appears as ₹0 "claimed back as input credit" for registered sellers
rather than vanishing. No Meesho-cost lines (hard rule 4; tested).

### 115. "What to do" leaves out actions worth under ₹1 a sale

Spec 7.6 says "push prepaid when COD-heavy". Under Meesho's published policy
an RTO costs the seller only packaging, so for the default kurti the push is
worth about ₹0.40 a sale. Listing that as the seller's first action would be
noise, so an action must be worth at least ₹1 to appear. Push prepaid shows
up when it matters: RTO charged a forward fee, or very high RTO.
"COD-heavy" is "no prepaid discount" in shop setup, because the report
doesn't carry the COD share. "Fix the listing" appears when returns are
above the category's default rate.

### 116. A price set after the latest report beats the report's price

Spec 6.1 puts the report's price ahead of the seller's. But "Use this price"
must visibly change the answer. Products now carry `priceSetAt`: a price the
seller sets after the latest report was uploaded wins; otherwise the
report's average price wins. A newer report wins again, since by then it
reflects the new price. Products created from a report have no `priceSetAt`.

### 117. Growing doesn't ratchet: one ₹10 step, then hold until it's judged

Applying the Growing suggestion (₹300 → ₹310) made the helper immediately
suggest ₹320, and so on, every visit. Spec 7.9 judges a step on real orders
before the next. So if the price changed in the last 14 days (about two
weekly reports), Growing holds and says why, and "What to do" drops the
price action. Phase D's price-step planner will judge the step itself.

### 118. Stage rules, and why "listed since" looks at reports

Under 30 days listed → Launch; 30–90 → Growing; over 90 → Steady; over 90
with orders per day down 30%+ between the last two reports → Clearing. The
spec gives the inputs ("listed since and order trend") but no thresholds;
these are ours, and the stage is always editable ("Use the automatic stage"
undoes an override). A product created today from a report that started in
June isn't a launch, so "listed since" takes the earliest of the typed date,
`createdAt` and the first report's start.

### 119. Outliers are left out of everything, including "not viable"

A price under 30% or over 300% of the median is flagged "Outlier?" (one tap
removes it) and excluded from the median, the quarters and the not-viable
test. Otherwise one ₹1,500 typo would make an unviable product look viable.
"Fewer than 3 prices" counts usable prices only, and fades the range for
every stage, because the visibility warning needs the market whatever the
stage.

### 120. The lighter-parcel fix subtracts the slab difference from what the seller pays

When shipping comes from a report, replacing it with our slab estimate
would mix sources. The fix instead lowers the seller's actual charge by the
difference between their slab and the next one down. In the lightest slab,
it halves packaging, as the prototype does.

### 121. Competitor prices are added in a transaction

Two quick taps on "Add" lost a price, because each wrote the list from a
stale copy. Adds and removes now read and write inside one Dexie
transaction. Deleting a product also removes its competitor prices, and
Undo restores them.

### 122. `updateProduct` keeps fields the form doesn't edit

An edit used to rebuild the product from form fields only, which would have
dropped `stageOverride` and `priceSetAt`. They now survive, and a changed
price stamps `priceSetAt`.

### 123. Sale-check share is a plain wa.me link for now

Spec 7.7 asks for a WhatsApp share. It sends the verdict line; the referral
code (7.10) arrives with Phase D's sharing work.

---

## MVP Phase D — checks, learner, growth, privacy, PWA

### 124. Checks are recomputed from data, and keyed by the facts that fired them

`computeChecks()` is pure. The app shell recomputes it whenever any input
changes (a report upload, an edit, opening the app), and `syncChecks()`
writes only the difference. Each check's id is its rule, product and facts
(e.g. `C2:<product>:<prev report>:<last report>`). That one choice gives all
the dedupe rules: one active check per rule and product (a newer key closes
the older one); a dismissed check stays dismissed while its facts are the
same; a check whose facts disappear closes itself; one whose facts return is
shown again.

### 125. C6's COD share comes from shop setup

The report doesn't carry the COD share, so C6 uses the shop prior: 80% COD,
or 60% with a prepaid discount. Both are at the spec's 60% line, so in
1 Oct–15 Nov every shop with products sees C6 once a year, as the spec's
"push prepaid before the festive peak" intends.

### 126. C4 needs the old cost, so products remember their last cost change

`costChange: { from, at }` is stamped when an edit changes the cost. C4
fires when the move is over 5%, and its key includes `at`, so a second change
is a new check.

### 127. Price steps: one open at a time; "too early" also covers small changes

"Try ₹10 more" (Growing) applies the price and opens a step. While it's open,
Growing holds. It closes when the seller taps Keep, Go back (which restores
the old price, with Undo) or Stop. Spec 7.9 has three verdicts; a difference
under 10% either way, once there is enough data, is reported as "too early
to tell" with both profit-per-day figures shown, rather than inventing a
fourth verdict. "Before" and "after" periods each come from a report's own
calibrated numbers, and the catalogue trend comes from the other products in
the same two reports.

### 128. Events go through plain fetch to Supabase REST, not supabase-js

Section 14 lists Supabase JS. For insert-only rows and one RPC call, plain
`fetch` to the REST endpoints does the same job and keeps about 40 KB off
low-end phones (the 250 KB budget). Swapping in supabase-js later changes one
file (`telemetry.ts`).

### 129. /stats reads totals through a database function, never a secret in code

`public.sahi_daam_stats(key)` is `security definer`. It compares the key
from the URL with `private.settings.stats_key` (the `private` schema isn't
exposed by the API), sleeps half a second on a wrong key to slow guessing,
and returns totals and by-day rows with team devices excluded. The anon key
in the app can only insert (row-level security, column grants, no select
policy), so it can't read events, the waitlist or feedback even if someone
lifts it from the bundle. The page also strips the key from the address bar.
The whole migration is tested in PGlite (real Postgres compiled to
WebAssembly): insert-only access, the 200/day cap, a wrong key refused, team
exclusion.

### 130. Activation is an event the app sends once

"Activated seller = onboarding done and ≥ 1 product with a report or an
order count" (section 10). The app knows that; the server doesn't see
products. So the app sends `activated` once per device when it first becomes
true, and `/stats` counts distinct devices. Products checked = products in
uploaded reports + products typed in; products losing = each device's latest
leak-finder count, so a daily repeat isn't double-counted.

### 131. The waitlist without a backend says so

With no Supabase keys a sign-up can't reach the team. The card then says
"this build isn't connected yet, so your sign-up is saved on this phone
only" instead of a plain "you're on the list". Waitlist rows carry no device
id, so they can't be linked to anyone's product data.

### 132. Feedback text is sent; the privacy page says so

Spec 7.11 asks for stars + text. The text is the seller's own words, so the
card says it is sent, and the privacy page lists it. It is capped at 500
characters and carries no product data.

### 133. Private-window detection is a heuristic

No browser API says "private window". A storage quota under 120 MB is
treated as "probably temporary" and shows a soft banner pointing to backup.
The wording says "looks temporary (a private window?)" because a phone with
little free space can trip it too, and the advice (back up) is right either
way.

### 134. The service worker precaches everything, lazy chunks included

Spec 8.3: "Everything works offline". The precache (about 1.8 MB, 35 files)
includes the report reader and /how-it-works, so upload and the judge pages
also work offline after one visit. Screens a new seller doesn't see first
(product page, price helper, sale check, upload, checks, Me, concept, stats,
privacy) load lazily, so the first load fell from 169 KB to 146 KB gzipped.

### 135. Status colours one shade darker for AA contrast

Lighthouse flagged the deck's amber (#C77700) on peach at 3.1:1, and greyed
text at 4.47:1. The MVP's loss / thin / healthy text tokens are now the same
hues one shade darker (#C8005F, #9A5A00, #17794F, all ≥ 4.7:1 on white and on
their own tints), and secondary text is a solid #5E5E5E (6.5:1). The
prototype's colours under /how-it-works are unchanged. Accessibility is now
100 on every page measured.

### 136. A crash shows a friendly screen, not React Router's default

A real bug (creating the referral code inside a Dexie live query) surfaced as
"Unexpected Application Error!". It's fixed, and the root route now has an
error screen: "Something went wrong. Your products and reports are safe on
this phone", with Reload.

### 137. Branch pushed, not merged

Hard rule 6: build on `mvp`, merge to `main` only when Section 20 passes.
Several Section 20 items need people (usability test, Hindi review by a
seller, rehearsals, every member explaining ENGINE.md) and real reports, so
`mvp` is pushed and `main`, the judges' link, is untouched.
