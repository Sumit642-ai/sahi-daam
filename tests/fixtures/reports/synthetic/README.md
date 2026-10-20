# SYNTHETIC sample reports for testing Sahi Daam

**These are NOT real Meesho reports. No real orders, sellers or buyers.** They exist only to build and test the report-upload feature until real reports arrive (spec v2, Step 0, gates G1–G2). Never show them to judges as a real seller's data. In the demo, call them "a sample report".

## Files
| File | What it is |
|---|---|
| `SAMPLE_SYNTHETIC_PAYMENT_FILE_week1.xlsx` | Week of 28 Sep 2026: 5 products, 459 order lines. Sheets: Order Payments, Ads Cost, Referral Payments, Compensation and Recovery, Disclaimer |
| `SAMPLE_SYNTHETIC_PAYMENT_FILE_week2.xlsx` | Week of 5 Oct 2026, same products. **Kurti returns rise 16% → 23%** (should fire check C2); **jhumka RTO rises 22% → 28%** (should fire C3) |
| `*_order_payments.csv` | The Order Payments sheet as CSV, to test the CSV path |
| `sku_costs_SAMPLE.csv` | Product cost and packed weight per SKU (the seller's own input) |
| `expected_totals.json` | Hand-checkable totals per SKU and week, for automated tests |

## Which column names are confirmed vs assumed
| Status | Columns / sheets | Basis |
|---|---|---|
| **Seen in public tools/guides** | Sheet `Order Payments`; `Sub Order No`; `Supplier SKU`; `Live Order Status` (values incl. Delivered, Return, RTO, Cancelled); `Quantity`; `Final Settlement Amount`; sheet `Ads Cost` with `Campaign ID`, `Total Ads Cost`; sheet `Referral Payments` with `Net Referral Amount`; sheet `Compensation and Recovery` with `Amount (inc GST) INR`; sheet `Disclaimer`; file name containing `PAYMENT_FILE` | Open-source Meesho P&L dashboard README and a free Meesho payment-sheet analyzer |
| **Assumed (verify on a real file)** | `Order Date`, `Payment Date`, `Product Name`, `Product GST %`, `Listing Price (Incl. taxes)`, `Total Sale Amount (Incl. Shipping & GST)` (real header is truncated in public sources), `Shipping Charge (Incl. GST)`, `Return Shipping Charge (Incl. GST)`, `TCS`, `TDS`, `Customer State`, `Customer Name` | Our guess |

## How the synthetic amounts are built (assumptions)
- Delivered: settlement = listed price − forward shipping incl. 18% GST − TCS − TDS.
- Customer return: sale reversed; settlement = −(forward + return shipping, incl. GST).
- RTO and cancelled: settlement 0 (Meesho's published policy: no return fee on RTOs).
- Shipping: ₹50 / ₹120 up to 500 g, ₹70 / ₹150 for 501–1,000 g (DICE data pack and prototype assumptions), + 18% GST.
- `Customer Name` holds fake "TEST BUYER 0001" values only so the app can be tested to **skip** personal columns.

## What to test with them
1. Upload week 1 xlsx → 5 products found; RTO % and return % match `expected_totals.json`.
2. Upload the CSV → same result.
3. Rename a column in a copy → mapping screen appears.
4. Upload week 1 twice → duplicate warning.
5. Upload week 2 → checks C2 (kurti returns) and C3 (jhumka RTO) fire.
6. Saved data never contains `Customer Name` values.

**The parser must still pass on real reports.** Replace or add fixtures as soon as a real (redacted) report arrives, and update this table.
