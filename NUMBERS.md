SAHI DAAM — NUMBERS FOR THE DECK
Generated 2026-10-04T19:31:12.750Z by npm run export:sim. Every number below comes from the app's own engine.
Seller floor = what Meesho's published supplier policy charges the seller (no COD fee, no shipping on RTOs,
forward fee on delivered orders, reverse fee on customer returns, 18% GST on both). Cost-to-serve = every
logistics cost on every order plus COD handling, whoever pays it (the deck's original ₹318 model).

a) KURTI — ₹150 COGS, 350 g, Women's ethnic, March (baseline), DICE rates, default policy
  Seller floor, most likely (15.7% returns)                  ₹270.64
  Seller floor at 15% returns                                ₹267.92
  Seller floor at 25% returns                                ₹311.72
  Full cost-to-serve, continuous model (15.7% returns)       ₹318.12
  Full cost-to-serve, deck rounded units (17 / 13 / 6 / 70)  ₹318.00
  Meesho absorbs per clean sale (RTO fwd + GST, RTO reverse, COD) ₹51.49
  Profit per clean sale at ₹300 — seller floor               +₹29.36
  Profit per clean sale at ₹300 — cost-to-serve              −₹18.12
  Seller floor with "forward fee also charged on RTOs" (DISPUTED) ₹284.98
  Seller floor on 2026 reported rates (₹65 / ₹155, ASSUMPTION) ₹299.33
  Profit per clean sale at ₹300 on 2026 rates                +₹0.67

b) SELLER COST TABLE — kurti, per 100 orders dispatched (most likely return rate)
  Line                                         Working                               ₹  Who pays
  Forward shipping (delivered orders)          83 × ₹50                      ₹4,150.00  You
  Reverse shipping (customer returns)          13.0 × ₹120                   ₹1,563.72  You
  GST on your shipping fees                    18% × (₹4,150 + ₹1,564)       ₹1,028.47  You
  Packaging                                    100 × ₹8                        ₹800.00  You
  Unsellable returns (product written off)     6.0 × ₹150                      ₹899.14  You
  Ad spend                                     100 × ₹0                          ₹0.00  You
  Total you pay                                              ₹8,441.33
  ÷ clean sales (69.97)                                      ₹120.64
  + COGS                                                     ₹150.00
  = Seller floor                                             ₹270.64
  Paid by Meesho, not in the seller floor:
  Forward shipping on RTO orders               17.0 × ₹50                      ₹850.00  Meesho
  GST on that forward fee                      18% × ₹850                      ₹153.00  Meesho
  Return shipping on RTO orders                17.0 × ₹120                   ₹2,040.00  Meesho
  COD handling                                 100 × 80% × ₹7                  ₹560.00  Meesho
  Meesho total on 100 dispatched                             ₹3,603.00
  Meesho per clean sale                                      ₹51.49

c) SEASONALITY — kurti, March (baseline) vs November (festive peak)
  March: season index                                        ×1
  March: RTO                                                 17.0%
  March: seller floor                                        ₹270.64
  March: cost-to-serve                                       ₹318.12
  March: profit per clean sale at ₹330 — seller              +₹59.36
  March: profit per clean sale at ₹330 — cost-to-serve       +₹11.88
  November: season index                                     ×1.867
  November: RTO                                              31.7%
  November: seller floor                                     ₹273.11
  November: cost-to-serve                                    ₹377.55
  November: profit per clean sale at ₹330 — seller           +₹56.89
  November: profit per clean sale at ₹330 — cost-to-serve    −₹47.55
  March → November change, seller floor                      +₹2.47
  March → November change, cost-to-serve                     +₹59.44

d) CATEGORIES — category example product, typical price = median of the 40 sample listings
  Category (example COGS, weight)                 Typical  Costs/sale  % price     Floor   Margin  Verdict at median
  Women's ethnic (kurtis, sarees) (₹150, 350 g)      ₹318     ₹120.64    38.0%   ₹270.64    14.8%  HEALTHY
  Women's western wear (₹120, 300 g)                 ₹276     ₹133.20    48.3%   ₹253.20     8.3%  THIN
  Men's apparel (₹180, 350 g)                        ₹382     ₹130.59    34.2%   ₹310.59    18.7%  HEALTHY
  Kids wear (₹100, 250 g)                            ₹241     ₹116.30    48.4%   ₹216.30    10.1%  HEALTHY
  Footwear (₹250, 800 g)                             ₹519     ₹199.50    38.5%   ₹449.50    13.3%  HEALTHY
  Home & kitchen (₹180, 900 g)                       ₹379     ₹156.91    41.4%   ₹336.91    11.1%  HEALTHY
  Beauty & personal care (₹70, 200 g)                ₹179      ₹85.19    47.7%   ₹155.19    13.1%  HEALTHY
  Jewellery & accessories (₹60, 100 g)               ₹160      ₹97.02    60.6%   ₹157.02     1.9%  THIN

e) NOT-VIABLE DEMO — lowest beauty product cost that is NOT VIABLE on the seller floor (DICE rates)
  Category                                                   Beauty & personal care (200 g)
  COGS                                                       ₹152
  Seller floor                                               ₹240.64
  Band p90 (the viability line)                              ₹240.00
  One rupee cheaper (₹151) — floor, verdict                  ₹239.60, viable
  Verdict                                                    NOT_VIABLE
  Fix: Push buyers to prepaid                                new floor ₹240.20 (−₹0.44) — NOT viable on its own
  Fix: Lighter packaging                                     new floor ₹234.30 (−₹6.34) — viable on its own
  Fix: Sell as a bundle of 2                                 new floor ₹199.52 (−₹41.12) — viable on its own
  Fix: Reduce product cost by 10%                            new floor ₹224.80 (−₹15.84) — viable on its own

f) LAUNCH RECOMMENDATION — default kurti
  Launch price                                               ₹282
    Band 30th percentile is ₹282; your floor is ₹271; so we recommend ₹282.
    That clears ₹11 per sale and still sits below 72% of the market, so buyers will see you.
    Floor used: ₹270.64 at a 16% return rate. At ₹282 you clear ₹11 per clean sale.

g) 26-WEEK JOURNEY — one kurti, three strategies, same world (seed 20260706, true sensitivity 2.2), seller floor
  Sahi Daam
    Week-26 cumulative profit                                ₹1,21,541
    Profit per unit sold                                     +₹66.33
    Weeks priced below the seller floor                      0 (0 with sales)
    Units sold                                               1832
    Average selling price (weighted by units sold)           ₹344.02
    Sold-out week                                            week 20
  Seller instinct
    Week-26 cumulative profit                                ₹54,642
    Profit per unit sold                                     +₹29.69
    Weeks priced below the seller floor                      2 (0 with sales)
    Units sold                                               1840
    Average selling price (weighted by units sold)           ₹300.99
    Sold-out week                                            week 13
  Meesho range
    Week-26 cumulative profit                                ₹81,233
    Profit per unit sold                                     +₹44.16
    Weeks priced below the seller floor                      0 (0 with sales)
    Units sold                                               1840
    Average selling price (weighted by units sold)           ₹318.00
    Sold-out week                                            week 16
  Gap, Sahi Daam vs seller instinct                          ₹66,898
  Gap, Sahi Daam vs Meesho range                             ₹40,307
  Price-step sequence (Sahi Daam, ramp stage):
    week  5: ₹282 → ₹302  56.8%  kept  sensitivity estimate 2.58
    week  6: ₹302 → ₹322  59.7%  kept  sensitivity estimate 2.08
    week  7: ₹322 → ₹332  14.9%  kept  sensitivity estimate -0.17
    week  8: ₹332 → ₹342  8.2%  kept  sensitivity estimate 3.02
    week  9: ₹342 → ₹352  14.7%  kept  sensitivity estimate 1.15
    week 10: ₹352 → ₹362  9.0%  kept  sensitivity estimate 1.51
    week 11: ₹362 → ₹372  -2.5%  reverted  sensitivity estimate 4.26
    Peak price found                                         ₹362
    Learned price sensitivity                                2.061
    True price sensitivity (hidden from the learner)         2.2
  Fired triggers (Sahi Daam) — week, trigger, what the alert said to do, what Sahi Daam did:
    week 12  T2 Festive RTO is coming
             alert: Push prepaid before the peak and keep stock for parcels stuck in transit. Your floor moves only +₹1.60, to ₹272.16.
             done:  held ₹362
    week 12  T3 A competitor has undercut you
             alert: Re-check your floor (₹271) before matching. Matching to ₹254 would lose ₹17 per order.
             done:  held ₹362
    week 14  T5 Your product cost changed
             alert: Your cost changed; your floor is now ₹282.
             done:  held ₹374
    week 16  T2 Festive RTO is coming
             alert: Push prepaid before the peak and keep stock for parcels stuck in transit. Your floor moves only +₹0.92, to ₹305.38.
             done:  held ₹400
    week 17  T1 Returns are climbing
             alert: Your floor moved from ₹282 to ₹307. Raise price to ₹313 or fix the listing (size chart, photos).
             done:  price ₹400 → ₹401 the next week
  Robustness — sensitivity 1.5 / 2.2 / 3.0 × seeds 20260706, 1, 2, 3, 4 (15 runs):
    Sahi Daam beats seller instinct                          15 of 15
      gap median / min / max                                 ₹47,586 / ₹21,475 / ₹69,238
    Sahi Daam beats Meesho range                             12 of 15
      gap median / min / max                                 ₹25,820 / -₹3,815 / ₹43,225
    Sahi Daam weeks below floor, any run                     0
    Max learned-sensitivity error                            0.522 (true 1.5, seed 2, learned 0.978)
    run-by-run (sensitivity, seed: Sahi Daam / instinct / range):
    1.5, 20260706: ₹1,24,549 / ₹55,311 / ₹81,323
    1.5, 1       : ₹1,06,873 / ₹57,449 / ₹78,564
    1.5, 2       : ₹1,16,062 / ₹57,882 / ₹82,662
    1.5, 3       : ₹81,028 / ₹56,571 / ₹81,737
    1.5, 4       : ₹92,177 / ₹55,562 / ₹80,619
    2.2, 20260706: ₹1,21,541 / ₹54,642 / ₹81,233
    2.2, 1       : ₹1,04,367 / ₹56,781 / ₹78,547
    2.2, 2       : ₹1,13,372 / ₹57,102 / ₹82,548
    2.2, 3       : ₹79,636 / ₹56,119 / ₹81,648
    2.2, 4       : ₹90,082 / ₹54,985 / ₹80,515
    3.0, 20260706: ₹1,17,391 / ₹54,434 / ₹81,130
    3.0, 1       : ₹1,01,215 / ₹56,535 / ₹78,529
    3.0, 2       : ₹1,09,846 / ₹57,454 / ₹82,419
    3.0, 3       : ₹77,731 / ₹56,256 / ₹81,546
    3.0, 4       : ₹87,225 / ₹54,610 / ₹80,397

h) BUSINESS CASE — moving one order from COD to prepaid (≤500 g, DICE rates)
  Expected RTO, COD → prepaid                                20% → 5% (−15 points)
  Cost to Meesho of one RTO (fwd ₹50 + 18% GST + reverse ₹120) ₹179.00
  RTO cost avoided per shifted order (15% × that)            ₹26.85
  COD handling avoided per shifted order (ASSUMPTION ₹7)     ₹7.00
  Meesho saving per shifted order                            ₹33.85
  Annual orders (as given: 1,261 Mn in H1 FY26 × 2)          2,522 Mn
  1% of annual orders                                        25.22 Mn
  Meesho saving per 1% of orders moved to prepaid            ₹85.4 Cr a year

i) TESTS
  Passed / total                                             268 / 268
