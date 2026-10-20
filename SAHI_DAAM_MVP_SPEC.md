# Sahi Daam MVP — Product Spec v2

Team Taraazu · IIT Kharagpur · Meesho DICE Challenge 3.0 semi-final → soft launch

**v2 replaces v1 completely.** Every point from the judge review is fixed here, and Section 18 shows, dimension by dimension, what earns a 9+ and what proof to show.

Read this whole file before writing code. Do Step 0 (Section 5) before Phase B. Build one phase at a time (Section 19) and stop after each.

---

## 0. Hard rules (apply to every phase)

1. **The seller's own data beats our assumptions.** When a Meesho report is uploaded, its numbers replace every estimate, and the screen says so.
2. **No fixed rupee claim in marketing copy.** Numbers appear only after the seller's own product is entered, or as a clearly labelled example.
3. **Never recommend a price below the seller's floor** (engine guardrail, tested).
4. **No estimates of Meesho's own costs in the seller app.** Those live only in "How it works" for judges.
5. **The raw report never leaves the phone.** Only per-product totals are saved.
6. **The judges' link never breaks.** Build on the `mvp` branch; merge to main only when the Section 20 checklist passes.
7. **Every number shows its source:** "From your report", "You entered" or "Estimated".
8. Footer on every page: "Independent tool. Not affiliated with Meesho." (footer only, not the hero).

---

## 1. Positioning: two layers

| Layer | What it is | Why it matters |
|---|---|---|
| **Now: standalone MVP** | A free web app any Meesho seller can use today. Upload your Meesho report (or type 4 things) and see what you actually keep on every product. | Proves sellers want it, using real sellers and real data |
| **End state: native Meesho feature** | The same floor card inside the supplier panel's Recommended Price Range, auto-filled from data Meesho already has. The seller types only product cost. | What Meesho should build; we have the model, the UX and the proof |

**One-liner:** "Sahi Daam shows Meesho sellers what they actually keep on every order, from their own report, and what price to charge next."

**What it is not:** not a repricing bot, not a competitor-price scraper, not a Meesho product.

## 2. Users, jobs and the research loop

**Primary user:** a small Meesho seller, often new to online selling, on an Android phone, Hindi or English (Gujarati next), selling ₹100–600 products with mostly COD orders.

| Job | Feature |
|---|---|
| "Which of my products are actually losing money?" | Profit leak finder (from the report) |
| "Am I making money on this one?" | Floor card |
| "What price should I list at?" | Price helper |
| "Should I join this sale?" | Sale check with break-even lift |
| "Did things get worse since last week?" | Weekly check (compares reports) |
| "Did my price change work?" | Price step planner |

**Research loop (mandatory before the demo):** put the MVP in front of at least 5 sellers using the protocol in Section 16. Record what they did, how long it took, and their words. This is the evidence for "problem and user" and "UX".

## 3. Why us: differentiation

**Be honest about competitors:** free Meesho payment-sheet P&L analyzers already exist (for example, a free web "Meesho P&L Analyzer" and an open-source Meesho P&L dashboard on GitHub). They read the same report. Our difference is not "we read the report"; it is **what we do with it: turn last month's numbers into next week's price decisions.**

| | Profit calculators (manual) | Payment-sheet P&L analyzers | Meesho Recommended Price Range | **Sahi Daam** |
|---|---|---|---|---|
| Uses the seller's own RTO and return rates | ✗ (seller guesses) | ✓ (looking back) | ✗ | **✓ per product** |
| Tells you what you earned last month | Partly | ✓ | ✗ | ✓ |
| **True floor per product (break-even price)** | Partly | ✗ | ✗ | **✓** |
| **What price to charge next, by lifecycle stage** | ✗ | ✗ | Market range only | **✓ (never below floor)** |
| **"Should I join this sale?" with break-even lift** | ✗ | ✗ | ✗ | **✓** |
| **Week-on-week change checks** (returns, RTO up) | ✗ | ✗ | ✗ | **✓ from consecutive reports** |
| Checks its model against the actual payout | ✗ | n/a | ✗ | **✓ reconciliation** |
| Hindi-first, phone-first | Rarely | Rarely | ✓ | ✓ |
| Report stays on the seller's phone | n/a | Varies | n/a | **✓** |

One line for the pitch: **"P&L tools tell you what you earned. Sahi Daam tells you what to charge next, and when to change it."**

Put this table in "How it works" and in the pitch.

## 4. Scope

### v0: must work on demo day
1. Landing page
2. Language choice (English / हिंदी) and a 3-question shop setup
3. **Two ways in:** upload a Meesho report **or** add a product by hand (4 required fields)
4. **Profit leak finder:** all products ranked by money lost per month
5. **Floor card** per product: what you keep, your floor, why, what to do
6. **Price helper:** range by lifecycle stage, visibility warning, not-viable fixes
7. **Sale check** with the break-even lift
8. **Weekly check** (compares this report with the last one) plus a "remind me every Monday" calendar file
9. **Price step planner** (honest: "too early to tell" until there is enough data)
10. **Share with a seller friend** (WhatsApp, with a referral code)
11. Privacy: data on the phone, protected storage, backup/restore, delete everything, opt-in anonymous sharing
12. Activation counters (private) and a **Pro waitlist**
13. **Concept screen:** how Sahi Daam would look inside Meesho's supplier panel
14. "How it works": the old prototype pages, moved to `/how-it-works`

### Later (say "next" when asked)
Payments for Pro · accounts and sync · Gujarati/Tamil (once a native speaker reviews) · browser extension for competitor prices · WhatsApp Business API alerts · other marketplaces · native Meesho integration.

## 5. Step 0: before building (gates)

These are not optional. The trust and viability scores depend on them.

| # | Action | Owner | Done when |
|---|---|---|---|
| G1 | Ask the 26 survey/interview sellers for their latest Meesho order/payment report, with buyer names, phones and addresses blanked out. Get written consent (WhatsApp message is fine) to use it for testing. | Team | **≥ 3 real reports** in hand |
| G2 | Turn them into test fixtures: delete any remaining personal columns, shuffle order IDs, keep column names and formats exactly. Store in `tests/fixtures/reports/`. Never commit unredacted files. | Team + Claude Code | Fixtures committed |
| G3 | Read Meesho's supplier terms for any rule on sharing reports with third parties. Note the result in `DECISIONS.md`. If restricted, the app still works with manual entry; the report is the seller's own file processed on their own phone. | Team | Note written |
| G4 | Line up 5 sellers for the usability test (Section 16). | Team | 5 names and times |
| G5 | Ask each report-giving seller what they actually received for 3 orders, to check the reconciliation. | Team | 3 sellers confirmed |

**Until real reports arrive, build and test with the synthetic samples** in `sample_reports/` (copy them to `tests/fixtures/reports/synthetic/`). They are clearly labelled SAMPLE / SYNTHETIC; column names are partly from public tools and partly assumed (see their README). Because of that, the **column-mapping screen must work well**: a real report's headers may differ.

If G1 still fails by the demo: the demo uses the sample report and says "sample report" out loud; never present synthetic data as a real seller's; and say in the pitch that real-report validation is the next step.

## 6. Cost model (engine v2)

Keep the existing engine and its tests. Add the following as new functions with new tests. **Do not change existing default outputs** used by the story pages.

### 6.1 Inputs per product

| Input | Source priority | Default |
|---|---|---|
| Listed price p | report → seller | — |
| Product cost c | seller | — · help: "Enter cost **without** GST if you claim input credit" |
| Category | seller / report | from shop setup |
| Packed weight | seller | category default |
| Forward shipping f per delivered order | **report average** → seller ("shown in your panel when you list") → estimate by weight | estimate, tagged "estimated" |
| Reverse shipping r per customer return | report average → seller → estimate | estimate |
| RTO rate | report → shop-setup prior | prior from buyer region and prepaid discount |
| Customer return rate | report → category default | category default |
| Unsellable share of returns | seller → category default | category default |
| Packaging per order | seller → category default | category default |
| **Ad spend per order** | report (if present) → seller (asked on every product) | 0, with a visible "ads not included" chip |
| Penalties / claims per order | report only | 0 |
| **GST-registered** | shop setup | **ON** (most Meesho sellers have a GSTIN) |
| Output GST rate | seller, choose 0 / 3 / 5 / 12 / 18% | 5% for apparel and footwear, tagged "check your HSN rate" |
| Forward fee also charged on RTOs | setting | OFF (Meesho's published policy), tagged "disputed" |

### 6.2 Formulas (per 100 dispatched, N = 100)

```
R  = N × rtoRate                    // never delivered
D  = N − R                          // delivered
Q  = D × returnRate                 // customer returns
C  = D − Q                          // clean sales

forward   = (fwdOnRto ? N : D) × f
reverse   = Q × r
feeGST    = 0.18 × (forward + reverse)    // counted as a cost only if NOT GST-registered (else recoverable)
packaging = N × packagingPerOrder
ads       = N × adPerOrder
writeOff  = Q × unsellableShare × c
penalties = N × penaltiesPerOrder

costs     = forward + reverse + (registered ? 0 : feeGST) + packaging + ads + writeOff + penalties
pNet      = registered ? p / (1 + gstRate) : p
keep      = pNet − c − costs / C        // what the seller keeps per clean sale
floor     = (c + costs / C) × (registered ? (1 + gstRate) : 1)   // lowest listed price that breaks even
monthly   = cleanSalesPerMonth × keep
```

- **Range:** show one main number, plus "if returns rise 5 points: ₹Y" underneath (not a wide low–high band).
- **No Meesho-cost lines in the seller app.** Cost-to-serve and "Meesho absorbs" stay in `/how-it-works` only.

### 6.3 Report calibration and reconciliation
- From the report, per product: orders, delivered, RTO, customer returns, average shipping charged, average return charge, ad charges, penalties/claims, TCS/TDS, settlement amount.
- **Reconciliation:** compare the model's expected payout per delivered order with the report's actual average settlement. Show the difference.
  - Within ±5%: "Matches your report ✓".
  - Over ±5%: "Your report differs from our estimate by ₹X per order. We're using your report's numbers." Then use report values and list the lines that explain the gap.
- **TCS/TDS** appear as "tax deducted, claimable" and are **not** counted as a cost.
- Whether shipping is deducted from the seller's payout or added to the buyer's price is settled by the report's settlement column; the model follows the report.
- Fewer than 20 orders for a product: "Low data", and estimates fill the gaps (tagged).

### 6.4 Rates config
`src/data/rates.json`: every default rate with `source`, `lastVerified` (date) and `status` (CITED / ASSUMPTION / FROM_REPORT). Shown on the "Numbers & sources" page.

### 6.5 New engine tests
1. Registered vs unregistered on the default kurti, with the expected difference.
2. The ads input lowers `keep` by exactly adPerOrder × N ÷ C.
3. Reconciliation: fixture report within 5% → "matches"; a perturbed fixture → uses report values.
4. Break-even lift (7.7) on three cases: join / join only with prepaid / skip.
5. Guardrail property test (1,000 random inputs): recommendation ≥ floor, for both registered and unregistered.
6. TCS/TDS never change `keep`.

## 7. Feature specs

### 7.1 Landing (`/`)
- Headline: **"Most sellers price on profit they never see. Check what you actually keep."** (Hindi equivalent)
- Sub: "Free · 2 minutes · Your numbers stay on your phone."
- Buttons: **"Upload my Meesho report"** (primary) · "Type in one product" (secondary) · link "How it works".
- Labelled example card: "Example with typical rates: ₹300 kurti, ₹150 cost → you keep about ₹1–30 per sale, depending on your shipping and returns."
- Social proof strip (only when ≥ 10 activated sellers): "X sellers · Y products checked".
- Footer: independence line · Privacy · Contact.

### 7.2 Onboarding (back works on every step, answers autosave)
1. Language: English / हिंदी.
2. Shop: what you mostly sell (8 categories) · GST-registered? (Yes default / No) · where most buyers are (Big cities / Mixed / Small towns) · prepaid discount? (Yes / No). If a report is uploaded later, the buyer and prepaid answers are replaced by real data, and the app says so.
3. Choose: Upload report / Type one product / Skip to home.

### 7.3 Report upload (the hero)
- Accepts .xlsx / .csv up to 10 MB. Parsed **in the browser** (SheetJS).
- Instructions screen with simple steps for downloading the report from the supplier panel (text written from what G1 sellers describe; add screenshots the sellers share, with consent).
- **Auto-detect columns** by keywords, tested against the G2 fixtures. If anything required is missing → **mapping screen**: "Which column is the order status?" with dropdowns and a 5-row preview (personal columns are never shown or read beyond detection). The mapping is saved for next time.
- Duplicate upload detected by file hash: "Already uploaded on {date}".
- Unmatched products → "We found 6 products. Add their cost to see what you keep." with one quick cost field per product.
- After upload: reconciliation result (6.3) and the leak finder.

### 7.4 Add product by hand (4 required fields)
Name · product cost · weight · current price. Optional (folded under "More details"): shipping charge from the panel, return charge, packaging, ad spend per order, orders per week, stock, listed since.
- Validation: cost and price > 0; weight 50–10,000 g; cost ≥ price saves but shows a red warning.
- Every estimated value carries an "estimated" chip that explains where it comes from.

### 7.5 Home: profit leak finder
- Top card: **"3 products are costing you about ₹4,200 a month"** (from report data, or from orders per week if typed; hidden if no order counts).
- List, worst first: product · price · "you keep ₹X a sale" · "₹Y a month" · status (✕ Loss / ! Thin / ✓ Healthy) · data badge (From report / Estimated).
- Filters: All / Losing / Thin. Search when > 8 products.
- Empty state: two buttons (Upload report / Add a product).
- Bottom nav: **Home · Products · Checks · Me**.

### 7.6 Product detail: floor card + price helper
**Floor card:**
- **"At ₹300 you keep ₹X per sale"** (big; colour + icon + word)
- "You think you make ₹150 (price − cost)" (small, for contrast)
- "Your floor: ₹F. Below this, every sale loses money." · "If returns rise 5 points: ₹Y"
- Funnel: "Of 100 orders you send, about 70 become sales you keep" (from report when available)
- "Why" table: each cost line with its source chip; "Show working" toggle
- "What to do": up to 3 actions in order, with rupee effect each:
  1. Push prepaid (when COD-heavy): new keep
  2. Fix the listing (when returns are above the category norm): keep if returns fall 5 points
  3. Change price (from the price helper)

**Price helper:**
- Seller adds 3–10 similar products' prices from the Meesho app (number chips; flag outliers below 30% or above 300% of the median).
- Output: a **recommended range** for the stage (Launch / Growing / Steady / Clearing stock; auto-set from "listed since" and order trend; editable):
  - Launch: floor + minimum margin → market middle
  - Growing: current price → +₹10 (one step; see price step planner)
  - Steady: hold; don't match undercuts below floor
  - Clearing: markdown ladder in 5% steps that stops at the floor
- Visibility warning when the price is above the top quarter of the entered prices: "Higher than most similar products. Meesho may show it less; move in ₹10 steps."
- Not viable (floor above every entered price): four fixes with new floor each (push prepaid, lighter packaging, bundle of 2, cut cost 10%).
- "Use this price" → updates price, records history, 10-second undo.

### 7.7 Sale check
- Inputs: discount % (default 20). Optional: the seller's own guess of extra orders.
- Output:
  - Sale price and **what you keep per sale at the sale price**
  - **Break-even lift:** "Joining pays off only if your orders rise by more than X%." (X = keep ÷ keepAtSale − 1)
  - With prepaid push: the same two numbers
  - Verdict: **Join** (lift needed ≤ 30%, or below the seller's guess) / **Join only with prepaid push** / **Skip: every sale order loses ₹Y** (keepAtSale ≤ 0)
  - If the product already loses money: "Fix the price before joining any sale."
- Share result on WhatsApp.

### 7.8 Weekly check (honest alerts)
Run on every report upload, every edit, and every app open. Each check: title, one line with numbers, one action, share, dismiss. One active check per (rule, product).

| ID | Fires when | Action |
|---|---|---|
| C1 | Price below floor | Open price helper |
| C2 | Return rate up ≥ 5 points vs previous report | Fix listing / review price |
| C3 | RTO up ≥ 5 points vs previous report | Push prepaid |
| C4 | Product cost changed > 5% | Review price |
| C5 | Entered market middle > 8% below your price | Price helper |
| C6 | 1 Oct–15 Nov and COD share ≥ 60% | Push prepaid before the festive peak |
| C7 | A price step has enough data to judge | See result |

- **"Remind me every Monday"** downloads a calendar file (.ics) with a weekly reminder and a link back to the app. Works on Android and iPhone with no server.
- The screen is called **"Checks"**, not "Alerts", until real push exists.

### 7.9 Price step planner (the learner, made honest)
- "Try ₹10 more on this product": records old and new price and start date.
- Judged only after the next report with **≥ 20 clean sales in both periods** and ≥ 7 days each.
- Compares **profit per day** (clean sales × keep ÷ days), adjusted by the seller's whole-catalogue order trend for the same periods (if other products also rose or fell, that part is removed).
- Verdicts: **Keep** (≥ 10% better) / **Go back** (≥ 10% worse) / **Too early to tell** (default).
- Never shows "price sensitivity" to sellers. The judge demo of the learner stays in `/how-it-works`.

### 7.10 Share with a seller friend
- `https://wa.me/?text=…` with a short message in the chosen language and a link with `?ref=<code>`.
- Message example: "I checked what I actually keep on my Meesho products with Sahi Daam. Free, 2 minutes, your numbers stay on your phone: <link>"
- Count referral sign-ups (Section 10).

### 7.11 Me
Shop profile · language · GST settings · backup (download file) / restore · opt-in anonymous sharing toggle · privacy · "How it works" · feedback (stars + text) · **delete everything** (two confirmations; second asks to type DELETE or हटाएं).

### 7.12 Concept: inside Meesho (`/concept`)
- A generic supplier-panel-style frame (**no Meesho logo, colours or name in the UI; labelled "Concept: how Sahi Daam could work inside a marketplace seller panel"**).
- Shows the existing "recommended price range" idea with: the floor line drawn across it, "you keep ₹X", and every input marked "auto-filled" except product cost.
- A side panel lists which Meesho data fills each input (Section 12).

### 7.13 How it works (`/how-it-works`)
The current prototype pages (26-week journey, Numbers & sources, Meesho view, triggers), unchanged, plus the differentiation table (Section 3).

## 8. Flows

### 8.1 Forward flows
```
Path A (report):  Landing → Language → Shop setup → Upload report → Map columns (if needed)
                  → Reconciliation result → Leak finder → Product → Floor card → Price helper / Sale check
                  → Share / Remind me Monday

Path B (manual):  Landing → Language → Shop setup → Add product (4 fields) → Floor card
                  → Price helper (add competitor prices) → Use this price → Home
                  → "Upload your report for exact numbers" nudge

Weekly loop:      Monday reminder → Upload new report → Weekly checks (C2, C3, C7) → Act → Share
```

### 8.2 Backward flows
| From | Back / undo | Result |
|---|---|---|
| Any onboarding step | Back or swipe | Previous step, answers kept |
| Mapping screen | Back | Upload screen; file discarded |
| Add product with changes | Back | "Discard changes?" (Keep editing / Discard) |
| Product detail | Back | Home, scroll position kept |
| "Use this price" | Undo toast (10 s) | Old price restored, history entry removed |
| Delete product | Undo toast (10 s) | Restored with history |
| Uploaded report | Me → Reports → Remove | Numbers fall back to estimates; badge changes |
| Shop setup edit | Save | All products recompute; toast: "2 products changed status" |
| Language change | Me | Instant switch, no data loss |
| Delete everything | Two confirmations | App resets to landing |
Browser back behaves exactly like in-app back (real routes).

### 8.3 Negative and edge paths
| Situation | Behaviour |
|---|---|
| Empty, zero or negative cost/price | Inline error; save disabled |
| Cost ≥ price | Saves; red warning; floor card shows the loss |
| Weight outside 50–10,000 g | Inline error |
| Fewer than 3 competitor prices | Faded range: "Add at least 3 for a reliable range"; floor-based advice still shown |
| Outlier competitor price | "Outlier?" chip with one-tap remove |
| Floor above every competitor price | Not viable + four fixes; never a price below the floor |
| RTO or returns at 0% or ≥ 90% | Allowed with an "unusual, check" chip |
| Report: wrong type or > 10 MB | Clear error with what is accepted |
| Report: columns not recognised | Mapping screen (never fail silently) |
| Report: no delivered or returned orders | "No delivered or returned orders in this file" |
| Report: duplicate | "Already uploaded on {date}" |
| Report: < 20 orders for a product | "Low data" badge; estimates fill gaps |
| Report vs model differ > 5% | Use report numbers; explain the gap |
| Offline | Everything works; banner "Offline: your data is saved on this phone"; counters queue |
| Private window / storage blocked | Banner "Private window: your data won't be saved after you close it" |
| Phone storage pressure | Request persistent storage on first save; if refused, remind to download a backup |
| Old saved data after an update | Versioned schema with migrations; never crash |
| Long names, big numbers | Ellipsis; ₹ with Indian grouping |

## 9. Privacy and data
- IndexedDB (Dexie), versioned schema. Call `navigator.storage.persist()` on first save.
- **Raw report:** parsed in memory, then discarded. Only per-product totals are saved. Personal columns (name, phone, address) are detected and skipped, never stored or displayed.
- Backup = a JSON file the seller downloads; restore = upload it.
- **Opt-in anonymous sharing** (off by default): category, region bucket, RTO %, return %, average shipping. No product names, prices, costs or IDs. This builds the benchmark dataset (Section 11) with consent.
- Privacy page in plain language (English and Hindi): what is stored, where, what is shared (only if opted in), how to delete.
- Disclaimer on every floor card: "Estimates to help you decide. Check with your accountant for tax."

### Data model
```
shop        { id, name, category, gstRegistered, gstRate, buyerRegion, prepaidDiscount, language, shareOptIn, createdAt }
products    { id, name, sku?, category, cost, weightG, price, ship?, returnShip?, packaging?, adPerOrder?, ordersPerWeek?, stock?, listedSince, stageOverride?, createdAt, updatedAt }
priceHistory{ id, productId, oldPrice, newPrice, source, at }
competitor  { id, productId, prices[], enteredAt }
reports     { id, fileHash, periodFrom, periodTo, mappingId, uploadedAt }
mappings    { id, columns{} }
skuStats    { id, reportId, productId, orders, delivered, rto, returns, avgShip, avgReturnShip, ads, penalties, tcsTds, avgSettlement }
checks      { id, rule, productId?, payload, status, createdAt }
priceSteps  { id, productId, oldPrice, newPrice, startAt, judgedAt?, verdict? }
```

## 10. Growth, counters and the Pro waitlist
- **Events** (anonymous, no product data): `onboarding_done`, `report_uploaded`, `product_added`, `leak_found`, `price_applied`, `sale_check_used`, `share_clicked`, `referral_signup`, `pro_waitlist_joined`.
- **Activated seller** = finished onboarding **and** has ≥ 1 product with a report or an order count. This is the only "users" number we quote.
- **Team exclusion:** opening the app once with `?team=1` marks that device; its events are tagged and excluded.
- Backend: Supabase `events` table with insert-only anonymous access, a row-level rate limit (e.g. max 200 events per anon id per day), keys from env vars; if unset, log locally.
- **Private stats page** at `/stats?key=<secret>`: activated sellers, reports uploaded, products checked, products found losing money, referral sign-ups, Pro waitlist count, by day.
- **Pro waitlist** (a fake-door test, honestly labelled): on the leak finder and weekly check, a card "Sahi Daam Pro: weekly report check for all products, Monday summary, ₹99/month · coming soon · Join the waitlist" → phone or email with a consent checkbox. Stored in Supabase `waitlist` (separate table, never linked to product data).

## 11. Business model and moat (for the pitch)
- **Free:** floor card, price helper, sale check, one report a month.
- **Pro ₹99/month (waitlist now):** unlimited weekly reports, Monday summary, price step planner across all products, festive-season playbook.
- **B2B later:** seller-enablement agencies and accountants who manage many Meesho accounts (multi-shop view); licensing the engine to a marketplace.
- **Cost to serve:** near zero; the heavy work runs on the seller's phone.
- **Moat:** a consented, anonymised benchmark of real RTO and return rates by category and region, built from opt-in sharing. It makes every new seller's estimates better than any calculator's defaults.
- **Distribution:** the 26 research sellers → referral codes; Meesho seller WhatsApp and Telegram groups; Hindi seller-education YouTube channels; IIT KGP E-Cell network.
- **Pre-demo traction targets:** ≥ 20 activated sellers · ≥ 10 reports uploaded · ≥ 10 Pro waitlist sign-ups · 3 seller quotes (with consent).

## 12. Meesho integration blueprint (for "Meesho fit")
| Sahi Daam input | In the native version, filled by |
|---|---|
| Listed price | The listing |
| Weight, category | The listing |
| Forward / reverse shipping | Logistics rate card for the seller's actual zone mix |
| RTO rate | Seller history; for new sellers, category + region priors |
| Return rate, unsellable share | Seller and category history |
| Ad spend per order | The seller's ads account |
| Competitor range | The existing Recommended Price Range service |
| **Product cost** | **The only seller input** |

What Meesho gains (pitch, not in the seller app): sellers who know their real margin survive longer; prepaid pushes cut RTO; fewer below-floor listings; aggregated floors show where fee slabs exceed cheap products' prices. Pilot design: as in the deck (30-day pilot after a 2-sprint build).

## 13. Look and feel
- **Principle:** a calm calculator. One big answer per screen, details on tap.
- Mobile-first, installable (PWA), fully responsive. Same features everywhere; only the layout changes. Tailwind breakpoints (sm/md/lg), no separate mobile site.
  - **Phone (360–767 px):** single column, bottom nav (Home, Products, Checks, Me), sticky primary buttons, 48 px tap targets, body text ≥ 16 px, Hindi ≥ 17 px. Must work on a 360 × 640 budget Android with no horizontal scroll.
  - **Tablet (768–1023 px):** two columns where useful (product list + summary), bottom nav or a slim side rail.
  - **Laptop/desktop (≥ 1024 px):** left sidebar nav, list–detail split view (product list left, selected product right), report upload with drag-and-drop, wider tables; content max width 1200 px.
  - Keep the "phone frame" toggle for demos on a laptop.
  - **Low-end phones:** initial JS under 250 KB gzipped (lazy-load SheetJS, charts and the /how-it-works pages); subset Poppins and Noto Sans Devanagari; no layout shift while loading.
  - **Respect phone settings:** safe-area insets, landscape, the user's larger-text setting (rem units), reduced motion.
- Palette: plum `#5B1A46` (primary), deep plum `#3E0F2E` (text), orange `#F58220` (key numbers), magenta `#E5006D` (loss), green `#1B8A5A` (healthy), amber `#C77700` (thin), lilac `#F7EDF4` and peach `#FDF0E3` (cards), white background.
- Type: Poppins (English), Noto Sans Devanagari (Hindi). Body ≥ 16 px; key numbers 40–48 px bold.
- Rounded cards (16 px), no shadows; 48 px tap targets; sticky primary button on forms; bottom nav with icon + label.
- Status always icon + word + colour. ₹ with Indian grouping; whole rupees on cards, paise only in "Show working".
- Copy: second person, short, no jargon. Teach "RTO" once ("orders that never reach the buyer"). Hindi written naturally, reviewed by a Hindi-speaking seller during the usability test.
- Feedback: skeleton loaders, toasts with undo, inline errors, never a blank screen.

## 14. Architecture, quality and code ownership
- Keep Vite + React + TypeScript + Tailwind + Vitest and `src/engine/`.
- Add: React Router, Dexie, `vite-plugin-pwa`, SheetJS, Supabase JS (events + waitlist only).
- Folders: `src/app/` (MVP screens), `src/story/` (judge pages), `src/engine/`, `src/data/`, `src/i18n/`, `tests/fixtures/reports/`.
- `ENGINE.md`: the formulas from Section 6 in plain words, with the default kurti worked example. **Every team member must be able to explain the floor formula, the guardrail and the reconciliation without notes.**
- Feature flags for anything unfinished; nothing half-built is visible on main.
- CI: tests + build on every push. Lighthouse mobile: Performance ≥ 85, Accessibility ≥ 95, Best practices ≥ 90, PWA installable.

## 15. Tests

**Positive**
1. Default kurti, registered and unregistered → expected keep and floor (6.5 test 1).
2. Upload each G2 fixture → products, RTO %, return %, settlements match hand-calculated totals.
3. Reconciliation within ±5% on fixtures → "Matches your report".
4. Leak finder sorted worst first; monthly loss correct.
5. Price helper: recommendation range ≥ floor; visibility warning above the top quarter.
6. Sale check: join / prepaid-only / skip cases; break-even lift formula exact.
7. Weekly check: C2 and C3 fire across two fixture reports with a 5-point rise.
8. Price step: verdict "too early" below 20 clean sales; "keep" on a clear improvement.
9. Hindi: every key present in `hi.json`; no English fallback visible.
10. Reload and offline: all data still there.
11. Share link contains the referral code.

**Negative**
1. Cost 0 → can't save. 2. Cost ≥ price → saves with warning. 3. Two competitor prices → faded range.
4. Floor above all competitor prices → not viable, no price below floor. 5. Guardrail property test (1,000 inputs).
6. PDF upload → rejected. 7. Renamed columns → mapping screen → correct result. 8. Same report twice → duplicate.
9. Report with personal columns → those columns never stored (assert on saved data).
10. TCS/TDS present → keep unchanged. 11. Delete everything → storage empty.
12. `?team=1` device events excluded from `/stats`.

## 16. Usability test protocol (G4)
- 5 sellers (minimum 3), on their own phone, in their language; 15 minutes each; one team member observes silently, one takes notes.
- Tasks: (1) check one product and say what you keep; (2) decide on a 20% sale; (3) upload your report, if you have one; (4) find your worst product.
- Record: time per task, success yes/no, where they got stuck, their exact words.
- Three questions after: "Would you use this every week?" (Yes / Maybe / No) · "Would you pay ₹99 a month for the weekly check?" · "Who else should use this?"
- Write `USABILITY.md`; fix the top 3 problems before the demo; ask permission to quote them by first name and city.

## 17. Demo-day plan
- **Setup:** demo from an Android phone mirrored to the laptop (e.g. scrcpy), app installed as a PWA, real seller's report already uploaded **with consent and names hidden**, sample report as backup, a recorded 2-minute video as a last resort.
- **7-minute script:**
  1. (30 s) Problem in one line; "we built it and sellers are using it."
  2. (2 min) Real seller's report → leak finder: "3 products cost Ravi ₹4,200 a month." → floor card → what to do.
  3. (1 min) Sale check with the break-even lift.
  4. (1 min) Weekly check: two reports, returns rose, the check fired.
  5. (1 min) Concept screen: "This is what it becomes inside Meesho: one field."
  6. (1 min) Traction from `/stats` + one seller quote + Pro waitlist count.
  7. (30 s) Ask: "Pilot it with us in one category."
- **Freeze:** no deploys in the 24 hours before the demo, except fixes for bugs found in rehearsal.
- **Rehearse twice** with a timer, including the Q&A table below.

| They'll ask | Answer |
|---|---|
| "Free calculators and P&L tools exist. Why you?" | "Calculators make sellers guess RTO and returns. P&L tools tell you what you earned last month. We use your own report to tell you your floor, what to charge next, whether to join a sale, and what changed this week." |
| "Why wouldn't Meesho build this?" | "It should. Here's the concept screen and the input map. Our MVP proves demand and gives you the model." |
| "How many real sellers?" | The activated-seller number (team excluded) + quotes |
| "Is the 'you keep' number true?" | "On Ravi's report it matched his payout within X%." |
| "How do you make money?" | Free core, ₹99/month Pro (waitlist: N sign-ups), B2B for agencies |
| "Do you see buyer data?" | "No. The report is read on the seller's phone; personal columns are skipped." |

## 18. Scorecard: how each dimension reaches 9+

| Dimension | v1 | What earns 9+ (in this spec) | Proof to show judges | Gate |
|---|---|---|---|---|
| Problem and user | 8.5 | Jobs map (2), usability research with the MVP (16) | 5 sellers tested, quotes | G4 |
| Differentiation | 4 | Report upload as the hero, leak finder, reconciliation, break-even lift (3, 7.3–7.7) | Comparison table + live upload | G1 |
| Trust in the numbers | 5 | GST default on, ads asked, report beats estimates, reconciliation ±5%, rates with sources and dates, no fixed headline (6) | "Matched Ravi's payout within X%" | G1, G5 |
| Innovation visible on demo day | 4 | Leak finder, report-to-report weekly checks, break-even lift, honest price step planner, concept screen (7) | Steps 2–5 of the demo script | G1 |
| UX | 7 | 4 required fields or one upload, Hindi, one answer per screen, tested and fixed (7, 13, 16) | Median time to first answer, task success rate | G4 |
| Feasible before demo | 3.5 | Tight v0 scope, 5 phases, feature flags, freeze, fallbacks (4, 17, 19) | Working build on the judges' link | — |
| Startup viability | 3 | Business model, Pro waitlist, referral loop, moat, distribution, targets (10, 11) | Activated sellers, waitlist count, referrals | Traction targets |
| Meesho fit | 5 | Two-layer positioning, integration blueprint, concept screen, no Meesho-cost numbers in seller UI (1, 7.12, 12) | Concept screen + input map | — |

**Honest note:** the spec makes 9+ possible on every row. Three rows (trust, viability, problem/user) reach 9+ only when the gates are met with real sellers. If they aren't, say so in the pitch; judges reward honesty over inflated claims.

## 19. Build phases and Claude Code prompts

### Phase 0: engine v2 and fixtures (2–3 hours)
```
Read SAHI_DAAM_MVP_SPEC.md (v2) fully. Create branch "mvp". Do Phase 0 only: add the engine v2 functions from Section 6 (GST registered/unregistered, ads, penalties, TCS/TDS handling, break-even lift, reconciliation) as new functions without changing existing default outputs; add src/data/rates.json with source, lastVerified and status for every rate; write ENGINE.md; add the Section 6.5 tests. If tests/fixtures/reports/ has files, write a fixture test that loads each one. Run all tests. Stop and summarise.
```

### Phase A: shell, onboarding, manual product, home (½ day)
```
Do Phase A: React Router with real routes; move the current judge pages to src/story/ under /how-it-works; Dexie with the Section 9 schema and navigator.storage.persist(); i18n (en, hi) and design tokens (Section 13); bottom nav (Home, Products, Checks, Me); landing (7.1, social proof hidden); onboarding (7.2); manual add product with 4 required fields and validations (7.4); home leak finder for manual products (7.5); backward flows from 8.2 that apply. Tests for validation and persistence. Stop and summarise.
```

### Phase B: report upload and reconciliation (½–1 day)
```
Do Phase B: copy sample_reports/ into tests/fixtures/reports/synthetic/ (keep the SAMPLE/SYNTHETIC labels; use expected_totals.json for test expectations) and add any real redacted reports under tests/fixtures/reports/real/. Then build report upload (7.3) with SheetJS in the browser, keyword column detection tested on all fixtures (sheet "Order Payments"; columns such as "Sub Order No", "Supplier SKU", "Live Order Status", "Final Settlement Amount"; never rely on exact names alone), mapping screen with saved mappings and a 5-row preview that never shows personal columns, duplicate detection by file hash, per-product skuStats, unmatched-product quick cost entry, reconciliation (6.3) with the ±5% rule, and leak finder from report data. Add positive tests 2–4 and negative tests 6–10 from Section 15. Stop and summarise, including the reconciliation result for each fixture.
```

### Phase C: product detail, price helper, sale check (½ day)
```
Do Phase C: product detail with the floor card (7.6, no Meesho-cost lines), "what to do" actions with rupee effects, price helper with stage ranges, visibility warning, outliers, not-viable fixes and "Use this price" with undo; sale check with break-even lift and prepaid variant (7.7). Add positive tests 5–6 and negative tests 1–5. Stop and summarise.
```

### Phase D: checks, growth, privacy, concept, polish (½–1 day)
```
Do Phase D: weekly checks C1–C7 with dedupe and the .ics "Remind me every Monday" file (7.8); price step planner with the Section 7.9 rules; share with referral code (7.10); Me screen with backup/restore, opt-in anonymous sharing, delete everything (7.11); privacy page; events, team exclusion, rate limit, /stats?key= and Pro waitlist (Section 10; Supabase keys from env vars, works without them); concept screen (7.12) with no marketplace branding; PWA install and offline. Run the Section 20 checklist, fix gaps, deploy a Vercel preview from the mvp branch and print its URL and the checklist results.
```

### Phase E: usability fixes and freeze
```
Read USABILITY.md. Fix the top 3 problems it lists, re-run all tests and Lighthouse, deploy the preview, and print what changed. Do not add features.
```
Merge `mvp` into main only after Phase E passes Section 20.

## 20. Acceptance checklist
- [ ] Path A (report) and Path B (manual) both reach "you keep ₹X" on a phone; median under 2 minutes in the usability test.
- [ ] Every G2 fixture parses; reconciliation result shown; personal columns never stored.
- [ ] GST default on; ads asked; every number shows its source chip.
- [ ] No fixed rupee claim on the landing page; no Meesho-cost numbers in the seller app.
- [ ] Guardrail and all engine tests pass; Section 15 tests pass.
- [ ] Back and undo work everywhere, including browser back.
- [ ] Works offline and after reload; private-window and storage warnings shown.
- [ ] Hindi complete and reviewed by a Hindi-speaking seller.
- [ ] `/stats?key=` shows activated sellers with team devices excluded; Pro waitlist works.
- [ ] Concept screen has no marketplace branding and is labelled "Concept".
- [ ] `/how-it-works` still shows the original prototype.
- [ ] Lighthouse targets met; PWA installs on Android.
- [ ] Every team member can explain ENGINE.md without notes.
- [ ] Demo rehearsed twice; freeze in place 24 hours before.
