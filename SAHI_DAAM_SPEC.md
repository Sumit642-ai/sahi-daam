Sahi Daam — Prototype Build Spec (for Claude Code)

You are building a working, demo-ready web prototype called Sahi Daam ("the right price") for Team Taraazu's entry in the Meesho DICE Challenge 3.0, Problem Statement #4: Pricing across a product's lifecycle for the new-to-online seller.

Read this whole file before writing code. Build in the phases listed in Section 12, run the tests after every phase, and record every judgement call you make in DECISIONS.md. Do not scrape any website. All market data is synthetic sample data that you generate and clearly label as such.

1. The problem in one paragraph

Offline sellers moving to Meesho price as they did in their shop: cost plus a markup. Online, out of every 100 orders dispatched, some never reach the buyer (RTO, mostly COD refusals) and some are returned after delivery. The seller pays forward shipping, reverse shipping, packaging and COD handling on all of them, and loses the product itself on unsellable returns. Meesho charges 0% commission, so these costs are flat per order, which means they take a much bigger share of a cheap product's price. New sellers tend to start cheap, so they systematically list below their true break-even without knowing it. Worked example: a ₹300 kurti with ₹150 cost has a true floor of about ₹318, so the seller who thinks he earns ₹150 actually loses about ₹18 per sale.

Meesho's existing Recommended Price Range tool (2–3 years old) only searches for similar products and gives an estimated market price. It does not know the seller's own cost, their RTO/return drag, or the product's lifecycle stage, and it does not give a true price recommendation. Sahi Daam adds exactly those things.

2. What the prototype must demonstrate (mentor requirements)
Breadth: it works for most Meesho categories (multi-category floor calculator + recommendation).
Depth: for one category (women's ethnic wear, a kurti), it shows the whole seller lifecycle week by week, from launch to clearance, with recommendations and alerts changing as conditions change.
Full input/output transparency: every input is labelled with who provides it (seller / auto-filled by Meesho / assumption) and every output can be expanded to show its formula and the exact numbers that produced it.
No dependence on price-vs-sales data at launch. The recommendation starts from the floor and the competitor band only, then learns the product's price sensitivity from the seller's own ₹10–20 price steps during the growth stage.
3. Tech stack and constraints
Vite + React 18 + TypeScript + Tailwind CSS + Recharts. Vitest for tests.
No backend, no login, no external API calls. Everything runs in the browser.
All data in src/data/*.json. All business logic in pure, framework-free TypeScript in src/engine/, with no React imports, so it is fully unit-testable.
Mobile-first responsive layout (sellers use phones), but must also look good on a laptop for the demo.
Language toggle: English / Hindi for all seller-facing labels and alerts. Keep numbers in Indian format (₹1,23,456) via Intl.NumberFormat('en-IN').
Deployable to Vercel with npm run build.
Design system (match the team's deck)
Role	Hex
Plum (headers, primary)	
#5B1A46
Deep plum (dark text)	
#3E0F2E
Orange (accent, key numbers)	
#F58220
Magenta (loss, alerts)	
#E5006D
Lilac card fill	
#F7EDF4
Peach card fill	
#FDF0E3
Body grey	
#3D3D3D
Profit green	
#1B8A5A

Font: Poppins (Google Fonts) with a system sans-serif fallback. Rounded cards, no drop shadows, no borders, no decorative stripes. Big numbers in bold orange; losses in magenta.

4. Folder structure
src/
  engine/
    floor.ts          // floor calculation
    season.ts         // seasonal RTO index
    band.ts           // competitor band stats
    recommend.ts      // lifecycle recommendation + guardrail
    learner.ts        // price-step experiment logic (learns sensitivity)
    triggers.ts       // six repricing triggers
    simulator.ts      // 26-week seller-journey world + two strategies
    nudges.ts         // alert -> WhatsApp message text (hi/en)
    format.ts         // ₹ formatting helpers
  data/
    categories.json
    weightSlabs.json
    fees.json
    season.json
    listings/<categoryId>.json   // synthetic competitor listings
    journey.json      // scripted events for the kurti journey
    i18n/en.json, i18n/hi.json
  components/ ...
  pages/
    Home.tsx
    FloorCalculator.tsx      // Screen 1: Aapki Laagat
    MarketBand.tsx           // Screen 2: Bazaar Ka Daam
    SellerJourney.tsx        // Screen 3: lifecycle simulation
    Alerts.tsx               // Screen 4: Daam Badlo (WhatsApp feed)
    MeeshoComparison.tsx     // Screen 5: Meesho today vs Sahi Daam
    Assumptions.tsx          // Screen 6: every number and its source
tests/
DECISIONS.md
README.md
5. Data (configuration)

Every config value must carry a source field: either a citation string or the literal "ASSUMPTION". The Assumptions screen (Section 9.6) renders all of them.

5.1 fees.json
Key	Default	Source
codShare (share of orders that are COD)	0.80	Valmo DICE data pack
rtoCod	0.20	Valmo DICE data pack
rtoPrepaid	0.05	Valmo DICE data pack
codFee (₹ per COD order)	7	ASSUMPTION
gstRate (applied to forward shipping only)	0.18	ASSUMPTION, matches deck
unitsBasis	100	(model convention: compute per 100 dispatched)
5.2 weightSlabs.json (forward / reverse ₹ per order)
Slab	Forward	Reverse	Source
0–500 g	50	120	Valmo DICE data pack
501–1000 g	70	150	ASSUMPTION
1001–1500 g	90	180	ASSUMPTION
1501–2000 g	110	210	ASSUMPTION
each extra 500 g	+20	+30	ASSUMPTION
5.3 categories.json

One object per category with: id, name_en, name_hi, defaultWeightG, packagingCost, returnRateLow, returnRateExpected, returnRateHigh, writeOffShare (share of returns that are unsellable), exampleCogs, bandMedian, bandSpread, rtoNote, and source per numeric field. Use these placeholder values, all marked "ASSUMPTION" except where noted:

id	Category	Weight g	Packaging ₹	Return low / expected / high	Write-off share	Example COGS	Band median ₹
ethnic_women	Women's ethnic (kurtis, sarees)	350	8	0.15 / 0.20 / 0.25	0.46	150	320
western_women	Women's western wear	300	8	0.15 / 0.20 / 0.25	0.40	120	280
men_apparel	Men's apparel	350	8	0.12 / 0.18 / 0.22	0.40	180	380
kids	Kids wear	250	8	0.12 / 0.16 / 0.20	0.40	100	240
footwear	Footwear	800	20	0.15 / 0.20 / 0.25	0.35	250	520
home_kitchen	Home & kitchen	900	25	0.06 / 0.10 / 0.14	0.60	180	380
beauty	Beauty & personal care	200	10	0.03 / 0.05 / 0.08	0.80	70	180
jewellery	Jewellery & accessories	100	6	0.08 / 0.12 / 0.16	0.30	60	160

The ethnic_women return range 15–25% should cite: "IBEF fashion return rates 25–40%; team used 15% as a conservative base." The writeOffShare 0.46 for ethnic_women equals 6 of 13 returns from the deck's worked example.

5.4 season.json — RTO season index

Seasonality is applied relative to the seller's own baseline, not as an absolute RTO. Industry RTO (Unicommerce, via MediaBrief) was 21.0% in March 2026, 25.6% in January 2026 and 39.2% at the November 2025 festive peak. Index = month RTO ÷ March RTO.

Month	Index	Source
Nov	1.867	Unicommerce (39.2 / 21.0)
Oct	1.60	ASSUMPTION (festive ramp)
Dec	1.40	ASSUMPTION
Jan	1.219	Unicommerce (25.6 / 21.0)
Feb	1.10	ASSUMPTION
Mar–Sep	1.00	Unicommerce March baseline; other months ASSUMPTION
5.5 Synthetic competitor listings listings/<id>.json

Generate 40 listings per category with a seeded random generator (fixed seed so output is stable): { id, title, price, rating, ratingCount }. Prices roughly log-normal around bandMedian with bandSpread ≈ ±35%. Every listings file must contain "synthetic": true and the UI must label it "Sample market data (synthetic) — in production this comes from Meesho's similar-product search."

6. Engine — exact formulas
6.1 Floor (floor.ts)

Inputs (FloorInput): cogs, weightG, categoryId, codShare, rtoCod, rtoPrepaid, returnRate, writeOffShare, packagingCost, adSpendPerOrder (default 0), seasonIndex (default 1), plus optional unitOverrides (see test 1).

With N = 100 dispatched:

rto            = min( (codShare*rtoCod + (1-codShare)*rtoPrepaid) * seasonIndex , 0.90 )
rtoUnits       = N * rto
deliveredUnits = N - rtoUnits
returnUnits    = deliveredUnits * returnRate
cleanSales     = deliveredUnits - returnUnits
writeOffUnits  = returnUnits * writeOffShare

forwardCost    = N * fwd(weight)
reverseCost    = (rtoUnits + returnUnits) * rev(weight)
gstCost        = gstRate * forwardCost
packagingTotal = N * packagingCost
codCost        = N * codShare * codFee
writeOffCost   = writeOffUnits * cogs
adCost         = N * adSpendPerOrder

totalOverhead       = sum of the seven cost lines
overheadPerCleanSale = totalOverhead / cleanSales
floor               = cogs + overheadPerCleanSale

Output (FloorResult): every intermediate value above, the seven cost lines as an array { key, label, working, amount } (e.g. working: "100 × ₹50"), survivalRate = cleanSales / N, and floor.

floorRange(input) runs the floor at returnRateLow, returnRateExpected and returnRateHigh and returns { low, expected, high }.

Profit helpers:

profitPerCleanSale(price, floor) = price − floor
profitPer100Dispatched(price, result) = cleanSales × (price − floor)
marginPct = (price − floor) / price
6.2 Verdict
Verdict	Rule
NOT_VIABLE	floor.expected > band P90 (even near the top of the market, every sale loses money)
LOSS	price < floor.expected
THIN	0 ≤ marginPct < 0.10
HEALTHY	marginPct ≥ 0.10

For NOT_VIABLE, also return a list of fixes, each with a recomputed floor so the seller can see the effect:

Push prepaid: recompute with codShare reduced by 0.20.
Lighter packaging or next lower weight slab (if applicable).
Bundle of 2: per-order costs are shared by 2 units, so compute the floor per unit for a 2-unit order (COGS ×2, same per-order costs, divide by 2).
Reduce COGS by 10%.
6.3 Band (band.ts)

From the listings: p10, p25, p30, p50, p75, p90, min, max, count. percentileOf(price) returns where a price sits in the band (0–100).

6.4 Recommendation and guardrail (recommend.ts)

recommend(stage, floorRange, band, context) returns { price, rationale[], warnings[] } for each stage:

Stage	Target
LAUNCH	max(band.p30, floor.expected + minMargin) where minMargin = max(₹5, 2% of floor). Aim: be visible and earn first ratings with a thin but positive margin.
RAMP	Start from the launch price, then follow the learner (6.5).
MATURE	Hold the learned best price. If a competitor undercuts, recommend re-checking the floor and offering a bundle/variant instead of matching.
DECLINE	Markdown ladder: −5% every 2 weeks while stock cover exceeds 4 weeks; stops at floor.expected.

Guardrail (must be enforced in code and covered by a test): no function may return a recommended price below floor.expected. If the band target is below the floor, return floor.expected + minMargin and add the warning "You are priced above most of the market; impressions may be low. See fixes that lower your floor."

Every rationale line must contain the actual numbers, e.g. "Band 30th percentile is ₹289; your floor is ₹315; so we recommend ₹321 (floor + ₹6)."

6.5 Learner (learner.ts) — how Sahi Daam learns without price-vs-sales data

During RAMP, one price step per week:

Metric: profit per 1,000 impressions = (orders / impressions) × survivalRate × (price − floor) × 1000.
Step: +₹20 if price < band p50, otherwise +₹10.
If the metric improved by more than 2% versus the previous week (after dividing out the category demand trend), keep the step and try the next one. If it fell, revert to the previous price, mark it as the profit peak, and move to MATURE.
After each step, estimate price sensitivity: ε̂ = −ln(cvr_t / cvr_{t−1}) / ln(p_t / p_{t−1}), and show the running average.

The learner only sees observed weekly data (price, impressions, orders, RTO, returns). It must never read the simulator's hidden demand parameters.

6.6 Triggers (triggers.ts)

Evaluate every simulated week (and on demand in the Alerts screen). Each trigger returns Alert { id, week, severity: 'info'|'warn'|'critical', title, detail (with numbers), action, numbers{} }.

#	Trigger	Rule	Action text
T1	Return rate climbs	last-2-week return rate ≥ baseline + 5pp	"Your floor moved from ₹A to ₹B. Raise price to ₹C or fix the listing (size chart, photos)."
T2	Festive RTO spike	season index for next 2 weeks ≥ 1.4	"Festive RTO will lift your floor from ₹A to ₹B. Reprice before the peak."
T3	Competitor undercut	median of the 5 closest listings drops > 8% below your price	"Re-check your floor (₹A) before matching. Matching to ₹B would lose ₹C per order." (or "is safe" if above floor)
T4	Priced out of view	your impressions −20% vs. previous week while category trend is flat or rising	"You have moved out of the visible band (now at the Nth percentile)."
T5	COGS shift	COGS changes by > 5%	"Your cost changed; your floor is now ₹B."
T6	Repriced without checking	any manual price change	"You changed the price to ₹P. Your floor is ₹F, so you now make ₹X per order."
7. Seller-journey simulator (simulator.ts)

A deterministic 26-week world for one kurti (category ethnic_women, COGS ₹150, 350 g, starting stock 1,500 units), starting the week of 6 July 2026 so weeks 16–21 cover the October–November festive season (Diwali is 8 November 2026). Use a seeded PRNG so every run is identical.

7.1 Hidden demand model (clearly labelled ASSUMPTION; used only to generate synthetic data)
impressions_t = baseImpressions(stage, ratingCount) * visibility(percentile) * categoryTrend_t * noise(±8%)
visibility(p) = 1.0 if p ≤ 40, falling linearly to 0.30 at p = 100
cvr_t         = baseCvr * (price / band.p50)^(−ε) * ratingBoost   // ε = 2.2, hidden
orders_t      = impressions_t * cvr_t

Use baseImpressions that grows from launch (no ratings) to a plateau as ratingCount rises; categoryTrend of 1.0 normally, 1.5 in weeks 16–21 (festive demand), declining to 0.6 by week 26.

Realised RTO and returns each week come from the floor model plus scripted events, with ±1pp noise.

7.2 Scripted events (journey.json)
Week	Event
1	Launch, 0 ratings
4	Enough data; enter RAMP
12	Competitor undercut: nearby listings drop 10%
14	COGS rises 6% (fabric price increase)
16	Size complaints: return rate +6pp for 3 weeks
16–21	Festive season (season index from season.json)
22	Stock ageing; enter DECLINE
26	End; report remaining stock
7.3 Two strategies run on the identical world
Sahi Daam: follows recommend + learner + responds to triggers.
Seller instinct (the counterfactual, based on the team's interviews): launch at COGS × 2 (₹300), match any competitor undercut immediately, never adjust for festive RTO, panic cut −20% when sales fall in decline, and never recompute the floor.

Weekly output per strategy: { week, date, stage, price, floor, bandP10, bandP50, bandP90, percentile, impressions, orders, rtoPct, returnPct, cleanSales, profit, cumulativeProfit, stockLeft, alerts[] }.

8. Alerts text (nudges.ts)

Turn each Alert into a WhatsApp-style message in English and Hindi using templates with placeholders. Write natural, simple Hindi a small seller would understand; keep "RTO", "COD" and "₹" as-is. Example template (Hindi, T2):

{name} जी, त्योहार के मौसम में RTO बढ़ जाता है। आपकी {product} का सही न्यूनतम दाम ₹{floorOld} से बढ़कर ₹{floorNew} हो गया है। अभी आप ₹{price} पर बेच रहे हैं — हर ऑर्डर पर ₹{loss} का नुकसान। दाम जाँचें →

Seller name in the demo: "Ramesh", product: "कुर्ती / kurti".

9. Screens — inputs and outputs in detail

Global layout: top bar with the Sahi Daam name, EN/हिं toggle, and a "Judge mode" toggle. Judge mode reveals the formula panels by default and shows the hidden simulator assumptions (ε = 2.2) on the journey screen; seller mode hides them behind ⓘ icons.

Every input field shows a small tag: Aap bhariye (you enter), Meesho ne bhara (auto-filled by Meesho), or Assumption. Every output number has an ⓘ that expands a "Show working" panel with the formula and the exact numbers used.

9.1 Home

Two large entry cards: "Price any product" (Screens 1–2) and "Follow a seller's journey" (Screen 3). One-line problem statement and the ₹150 vs −₹18 hook.

9.2 Screen 1 — Aapki Laagat (the floor)

Inputs

Field	Who provides	Default
Category	Seller	Women's ethnic
Product cost (COGS)	Seller	category exampleCogs
Weight (g)	Seller	category default
Planned price	Seller	blank (optional)
Shipping slab (forward/reverse)	Auto-filled from weight	from weightSlabs
COD share	Auto-filled (seller's region)	0.80
Expected RTO	Auto-filled (pincode mix)	computed from rtoCod/rtoPrepaid
Return rate (low/expected/high)	Auto-filled (category)	category values
Unsellable share of returns	Auto-filled (category)	category value
Packaging	Auto-filled (category), editable	category value
Ad spend per order	Seller (optional)	0
Month	Seller	current month

All auto-filled values are editable through an "Advanced" drawer.

Outputs

Headline: "Your true floor: ₹low – ₹high (most likely ₹expected)".
If a planned price is entered: "You think you earn ₹(price − COGS). You actually earn ₹(price − floor)." in the orange/magenta stat-pair style.
Funnel: 100 dispatched → delivered → clean sales, with the leak labelled at each step (RTO, returns).
Cost table: the seven cost lines with the working column, total, ÷ clean sales, + COGS = floor. (This must reproduce the deck table for the default kurti.)
Bar breakdown of the overhead per clean sale (₹ per line).
What-if sliders: COD share, return rate, month. The floor updates live.
9.3 Screen 2 — Bazaar Ka Daam (the band)

Inputs: carried from Screen 1, plus a price slider and a lifecycle-stage selector (Launch / Ramp / Mature / Decline).

Outputs

Horizontal band chart: synthetic listings as dots, p10–p90 shaded, median marked, floor drawn as a magenta vertical line, the zone left of the floor shaded "Loss on every order", and the current price marker.
Live numbers for the slider price: profit per clean sale, profit per 100 dispatched, margin %, band percentile, verdict badge.
Four stage cards (Launch, Ramp, Mature, Decline) each with the recommended price and the rationale lines with numbers.
If NOT_VIABLE: a "Why this product can't make money as listed" card with the four fixes and each fix's new floor.
9.4 Screen 3 — Seller journey (kurti, 26 weeks)

Controls: Next week, Play/Pause, Reset, Jump to week, strategy view (Sahi Daam / Seller instinct / Both), and a "Change price manually" button (fires T6).

Outputs

Status strip: week, date, stage, price, floor, percentile, stock left.
Chart A: price vs floor vs band (p10/p50/p90) over weeks, for the selected strategy.
Chart B: weekly profit (bars), with losses in magenta.
Chart C (the hero chart): cumulative profit, Sahi Daam vs seller instinct, two lines diverging. Final totals labelled.
Event log: scripted events and alerts per week, each clickable to open the alert detail.
Learner panel (during Ramp): each price step, the metric before/after, kept or reverted, running estimate of price sensitivity. In judge mode, also show the hidden true value for comparison.
Final summary card at week 26: total profit for each strategy, weeks spent below the floor for each, units sold, stock left.
9.5 Screen 4 — Daam Badlo (WhatsApp alerts)

A phone-frame mockup showing alerts as WhatsApp chat bubbles in the selected language, each with a "Daam check karein" (check price) button that deep-links to Screen 2 with that week's numbers loaded. A side panel has six buttons, "Fire T1" to "Fire T6", that generate each alert on demand with the current Screen 1 inputs, so judges can see any trigger without running the full journey.

9.6 Screen 5 — Meesho today vs Sahi Daam

Same product, side by side.

Left, "Meesho today": "Recommended price range ₹p25–₹p75, based on similar products." Below it, a checklist: competitor prices ✓, demand ✓, your cost ✗, your RTO/returns ✗, lifecycle stage ✗, alerts when things change ✗.
Right, "With Sahi Daam": the floor range, verdict at the Meesho-recommended midpoint (e.g. "At ₹300 you lose ₹18 per order"), the stage-wise recommendation, and active alerts.
9.7 Screen 6 — Assumptions & sources

A searchable table of every config value: name, value, unit, source (citation or ASSUMPTION badge). A note at the top: "Numbers marked ASSUMPTION are placeholders for the prototype. In production, Meesho fills these from its own data."

10. Tests (Vitest) — all must pass
Deck worked example, exact: with unitOverrides = { rtoUnits: 17, returnUnits: 13, writeOffUnits: 6, cleanSales: 70 }, ₹150 COGS, 350 g, default fees: totalOverhead = 11,760; overheadPerCleanSale = 168; floor = 318.
Continuous model: same inputs without overrides → floor ≈ 315.2 (±0.5); at return rate 0.25 → ≈ 362.5 (±0.5).
Seasonality: November index 1.867 → RTO ≈ 31.7%, floor ≈ 374 (±1). January → floor ≈ 328 (±1).
Monotonicity: floor strictly increases with RTO, return rate and weight slab.
Guardrail: across all categories, all stages and 1,000 random inputs, recommend().price ≥ floor.expected.
NOT_VIABLE: a beauty product with COGS ₹120 → NOT_VIABLE, and the bundle fix returns a lower per-unit floor.
Triggers: each of T1–T6 fires at its threshold and does not fire just below it.
Simulator determinism: two runs produce identical output; Sahi Daam cumulative profit at week 26 > seller-instinct cumulative profit.
Learner isolation: learner.ts does not import anything from simulator.ts.
11. Acceptance checklist
Default kurti on Screen 1 shows floor ₹315–₹362 and the cost table matches the deck lines.
Entering price ₹300 shows "You think you earn ₹150. You actually earn about −₹15 to −₹18" (continuous vs deck rounding; show the deck worked example in the ⓘ panel).
Switching month to November moves the floor to about ₹374.
All eight categories produce sensible floors and recommendations; at least one demonstrates NOT_VIABLE with fixes.
The journey plays end to end in under a minute on Play, with alerts appearing at weeks 12, 14, 16 and 16–21, and the hero chart showing the two strategies diverging.
Hindi toggle translates all labels and alerts.
Every output number has a working "Show working" panel.
npm run build succeeds; README explains how to run and deploy.
12. Build phases (run tests after each)
Engine: floor.ts, season.ts, data files, tests 1–4. Stop and confirm the ₹318 test passes before continuing.
Screen 1 with the input tags, funnel, cost table and Show-working panels.
Band, recommendation, verdict, Screen 2, tests 5–6.
Triggers, nudges, Screen 4, test 7.
Learner, simulator, Screen 3, tests 8–9.
Screen 5, Screen 6, Home, i18n, judge mode.
Polish: responsiveness, empty/edge states, README, DECISIONS.md, final full test run and build.
13. 90-second demo path (design the UI so this flows without friction)
Home → "Price any product" → kurti, COGS ₹150, price ₹300. Show "You think ₹150, you actually earn −₹18" and the cost table.
Slide month to November: floor jumps to ~₹374.
Screen 2: drag price across the floor line; show the stage cards.
Switch category to beauty with COGS ₹120: NOT_VIABLE and the fixes.
Screen 5: Meesho today vs Sahi Daam.
Screen 3: Play the journey; stop at week 16 to show the alert on the phone; finish on the hero chart.
Project content
project-1
Created by you
Add PDFs, documents, or other text to reference in this project.
Content

PDF

meesho r1.pptx

PPTX