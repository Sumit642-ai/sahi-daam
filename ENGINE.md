# How the Sahi Daam engine works (v2)

Every team member should be able to explain three things without notes: **the floor formula, the guardrail and the reconciliation.** This page gives each one in plain words, then the default kurti worked through by hand.

Code: `src/engine/keep.ts` (keep and floor), `src/engine/saleLift.ts` (sale check), `src/engine/report.ts` (report totals, reconciliation, calibration). Rates and their sources: `src/data/rates.json`. Tests: `tests/engineV2.test.ts`, `tests/reportFixtures.test.ts`, `tests/rates.test.ts`.

The prototype's engine (`src/engine/floor.ts`) is still there and still drives `/how-it-works`. On the same inputs both engines give the same floor to the paisa, and a test checks this.

---

## 1. The floor formula

**The idea.** Meesho charges no commission, so almost every online cost is a flat amount per order. You also pay some of those costs on orders that never become a sale. So we look at 100 orders you send out, add up everything they cost you, and spread that total over the sales you actually keep.

**Out of 100 orders dispatched:**

| | What it means | Default kurti |
|---|---|---|
| R = 100 × RTO rate | never reached the buyer (mostly COD refused) | 17 |
| D = 100 − R | delivered | 83 |
| Q = D × return rate | customer sent it back | 13.03 |
| C = D − Q | **clean sales: the ones you keep money on** | 69.97 |

**What those 100 orders cost you:**

| Line | Formula | Why |
|---|---|---|
| Forward shipping | D × f (or 100 × f if the fee is also charged on RTOs) | Meesho's policy: no fee on RTO orders. Some sellers say otherwise, so it's a setting, and a report overrides it |
| Reverse shipping | Q × r | you pay return shipping on customer returns, not on RTOs |
| GST on those fees | 18% × (forward + reverse) | **a cost only if you are NOT GST-registered**; registered sellers claim it back |
| Packaging | 100 × packaging | every order is packed, including RTOs |
| Ads | 100 × ad spend per order | 0 until the seller enters it ("ads not included" chip) |
| Unsellable returns | Q × unsellable share × product cost | the product itself is lost |
| Penalties / claims | 100 × penalties per order | only from a report |

**The answers:**

```
pNet  = registered ? price ÷ (1 + output GST) : price     what the sale really brings in
keep  = pNet − cost − costs ÷ C                           what you keep per clean sale
floor = (cost + costs ÷ C) × (registered ? 1 + output GST : 1)   lowest price that breaks even
monthly = clean sales a month × keep
```

**GST in one sentence.** A registered seller gives up the output GST inside the price (5% on apparel up to ₹2,500) but gets back the 18% GST on Meesho's fees. An unregistered seller keeps the whole price but pays the fee GST as a cost.

**TCS and TDS are not costs.** The marketplace deducts TCS (0.5%) and TDS (0.1%) from each payout. The seller claims both back, so they show as "tax deducted, claimable" and never change `keep` (6.5 test 6).

**One number, not a band.** The floor card shows one main number, with "if returns rise 5 points: ₹Y" underneath.

### Where each input comes from (in priority order)

| Input | 1st | 2nd | 3rd |
|---|---|---|---|
| Price, shipping, return charge | the report | the seller | estimate by weight |
| RTO rate | the report (20+ orders) | shop-setup prior | |
| Return rate | the report (20+ orders) | category default | |
| Ads | the report | the seller | 0 |
| Penalties | the report | | 0 |

Every input carries a tag, `FROM_REPORT`, `YOU_ENTERED` or `ESTIMATED`, and the screen shows it.

**The shop-setup RTO prior:** the DICE pack's 20% RTO on COD and 5% on prepaid, with 80% of orders COD. A prepaid discount moves 20 points of COD to prepaid. Buyers mostly in big cities scale the COD rate by 0.75, small towns by 1.25 (our estimates). Mixed buyers with no discount: 80% × 20% + 20% × 5% = **17%**.

---

## 2. The default kurti, by hand

₹150 cost, ₹300 price, 350 g, women's ethnic, mixed buyers, no prepaid discount. Every other input comes from `rates.json`: f ₹50, r ₹120, RTO 17%, returns 15.7%, unsellable 46%, packaging ₹8, ads 0, output GST 5%.

| | Registered (default) | Not registered |
|---|---|---|
| Clean sales C | 69.97 | 69.97 |
| Forward 83 × ₹50 | ₹4,150.00 | ₹4,150.00 |
| Reverse 13.03 × ₹120 | ₹1,563.72 | ₹1,563.72 |
| Fee GST 18% × ₹5,713.72 | ₹0 (claimed back) | ₹1,028.47 |
| Packaging 100 × ₹8 | ₹800.00 | ₹800.00 |
| Write-off 13.03 × 46% × ₹150 | ₹899.14 | ₹899.14 |
| **Costs on 100 dispatched** | **₹7,412.86** | **₹8,441.33** |
| Costs ÷ C | ₹105.94 | ₹120.64 |
| pNet | ₹300 ÷ 1.05 = ₹285.71 | ₹300 |
| **Keep per sale** | 285.71 − 150 − 105.94 = **₹29.77** | 300 − 150 − 120.64 = **₹29.36** |
| **Floor** | (150 + 105.94) × 1.05 = **₹268.74** | 150 + 120.64 = **₹270.64** |
| If returns rise 5 points | keep ₹11.17 · floor ₹288.27 | keep ₹8.47 · floor ₹291.53 |

The seller thinks they make ₹150 (price − cost). They actually keep about ₹30, and they start losing money once returns pass about 23% (8 points above the 15.7% default).

Registered vs unregistered differ by fee GST ÷ C − output GST in the price = ₹14.70 − ₹14.29 = **₹0.41 a sale**. The two effects almost cancel for this product.

---

## 3. The guardrail and the price helper

**Rule: no recommended price is ever below the floor.** If the market, a markdown or a stale price points below the floor, the engine lifts the price to floor + a minimum margin (₹5 or 2% of the floor, whichever is bigger) and says why. It never lowers the price quietly. A clearance ladder stops at the floor itself.

**The price helper** (`src/engine/priceHelper.ts`) works from the floor and 3–10 prices the seller types from the Meesho app. A price below 30% or above 300% of the median is flagged "Outlier?" and left out.

| Stage | Range | "Use this price" |
|---|---|---|
| Launch | floor + margin → market middle (median) | the market middle, lifted to floor + margin if it's lower |
| Growing | current → +₹10 | +₹10, unless the price changed in the last 14 days; then hold, because a step is judged before the next |
| Steady | hold the current price | the current price (never below floor + margin) |
| Clearing stock | 5% markdowns from the current price, ending at the floor | the first markdown |

The stage is set automatically and the seller can change it: under 30 days listed is Launch, 30–90 days Growing, over 90 days Steady, and over 90 days with orders down 30% or more between the last two reports is Clearing. "Listed since" is the earliest of what the seller typed, when the product was added, and the start of its first report.

- **Fewer than 3 prices:** the range is faded and the advice comes from the floor alone.
- **Above the top quarter** of the entered prices: "Higher than most similar products. Meesho may show it less; move in ₹10 steps."
- **Floor above every price entered: not viable.** The four fixes each show their new floor: push prepaid, a lighter parcel (or lighter packaging if already in the lightest slab), a bundle of 2, and product cost down 10%.

Default kurti, Growing, at ₹300: range ₹300–₹310; at ₹310 you keep ₹39.30 a sale, ₹9.52 more than at ₹300 (₹10 ÷ 1.05: a registered seller keeps the price net of 5% GST). The card rounds it to +₹10.

**Tested two ways.** The prototype's recommender: 1,000 random products × 4 stages × both GST settings, all at or above the v2 floor (6.5 test 5). The MVP price helper: 1,000 random inputs with random markets and current prices × 4 stages (Section 15 negative 5). Every low, high, target and markdown step is at or above the floor.

**What to do** (on the floor card) lists up to three actions in order, each with its rupee effect per sale:
1. **Push prepaid**, when the shop has no prepaid discount.
2. **Fix the listing**, when returns are above the category norm; shows the keep if returns fall 5 points.
3. **Change price** to the price helper's suggestion.

An action worth under ₹1 a sale is left out. That's why the default kurti never shows "push prepaid" under Meesho's published policy: an RTO costs the seller only packaging, so the push is worth about ₹0.40.

---

## 4. Reconciliation: checking the model against the report

**The question.** Does our fee model reproduce what Meesho actually paid? If it does, "you keep ₹X" can be trusted. If not, something in our fee rules is wrong for this seller.

For each product in an uploaded report, the app compares two numbers, both per delivered order:

- **Model:** our fee rules applied to the report's own order counts and price. A kept order pays the price minus forward shipping (with GST). A return claws back forward and return shipping (with GST). An RTO pays nothing, unless the forward fee is charged on RTOs. The RTO rate, return rate and price come from the report; only the fees are ours (shipping by weight, 18% GST, who pays on RTOs and returns).
- **Report:** the settlement column summed, with TCS/TDS added back (they're claimable), divided by delivered orders.

Using the report's own counts means a gap can only come from a fee or policy we have wrong, such as a heavier shipping slab or a forward fee on RTOs. It never comes from a category default return rate that simply differs from this seller's.

| Difference | What the seller sees |
|---|---|
| within ±5% | "Matches your report ✓" |
| over ±5% | "Your report differs from our estimate by ₹X per order. We're using your report's numbers." Then the lines that explain the gap, biggest first. Each comes from swapping one fee input (shipping, return charge, forward fee on RTOs) from our estimate to the report's figure. When shipping is the gap, the app suggests checking the product's weight |

**Either way, the report's numbers are used from then on** (hard rule 1): price, shipping, return charge, RTO and returns, ads, penalties/claims, and TCS/TDS as claimable tax. Reconciliation tells us whether the model is right; it never decides whether to listen to the report.

**Low data:** with fewer than 20 orders for a product, the actual charges (price, shipping) still come from the report, but RTO and return rates stay estimated and are tagged that way.

**Monthly figure from a report:** clean sales in the report × (30.44 days ÷ the report's days) × keep.

**On the synthetic reports:** every product in both weeks matches at 0.0%. That proves the parsing and arithmetic, **not** the model: the synthetic files were generated with the same fee rules we use. Only real reports (gates G1 and G5) can test the model. `npm run verify:engine` prints the engine-level comparison against full estimates, where rates also differ.

Code: `reconcileReport()` in `src/engine/report.ts` (what the app shows). The lower-level `reconcile()` compares against whatever input it's given; the Phase 0 tests use it with full estimates.

---

## 5. Sale check: the break-even lift

A sale lowers what each order keeps, so it pays only if enough extra orders come in:

```
lift needed = keep ÷ keep at sale price − 1
```

If you keep ₹30 a sale normally and ₹20 at the sale price, orders must rise by more than 50% just to stand still.

| Verdict | When |
|---|---|
| Fix the price first | the product already loses money at its normal price |
| Join | lift needed ≤ 30%, or below the seller's own guess |
| Join only with prepaid push | true only once a prepaid push lowers RTO by 3 points |
| Skip: every sale order loses ₹Y | keep at the sale price ≤ 0 |
| Skip: needs too many extra orders | each sale still earns, but the lift is too big |

Default kurti, 20% off: the sale price is ₹240, which is below the ₹268.74 floor, so **every sale order loses ₹27.37 → Skip.**

**Honest note on prepaid push.** Under Meesho's published policy an RTO costs the seller only its packaging, so cutting RTO by 3 points barely moves `keep` (about ₹0.40 a sale for the kurti). Prepaid push matters a lot only when the forward fee is charged on RTOs, or a report shows RTO charges.

---

## 6. Price step planner: the honest learner

"Try ₹10 more" (the Growing stage in the price helper) records the old price, the new price and the start date, and applies the new price. Code: `src/engine/priceStep.ts` and `src/app/lib/steps.ts`.

**When it judges.** Only with a report from before the step and one from after it, each covering **at least 7 days with at least 20 clean sales**. Until then the answer is "too early to tell", with the reason (no report after the change yet, too few sales, too short a period).

**What it compares.** Profit per day in each period:

```
profit per day = clean sales × keep ÷ days
```

Each period's keep uses that report's own numbers. The "after" figure is divided by the **catalogue trend**: the other products' orders per day, after ÷ before, from the same two reports. If everything rose 25% in festive week, that 25% isn't credited to the price.

| Change in profit per day | Verdict |
|---|---|
| +10% or more | **Keep** the new price |
| −10% or worse | **Go back** to the old price (one tap, with Undo) |
| in between, or not enough data | **Too early to tell** |

While a step is open, the Growing stage holds the price, so only one step is tested at a time. Once judged, check C7 tells the seller. The seller never sees a "price sensitivity" number, only the verdict and the two profit-per-day figures behind it.

**On the fixtures:** a ₹10 step on the kurti between week 1 and week 2 is judged **Go back**, because week 2's returns jumped from 16% to 23% and profit per day fell well over 10%. That's the right call on those numbers, even though the price wasn't the cause. The catalogue adjustment can't separate a product's own bad week from its price, which is why the seller decides, not the app.
