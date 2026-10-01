/**
 * Spec section 5.5 — synthetic competitor listings.
 *
 * Generates 40 listings per category into src/data/listings/<categoryId>.json
 * using a seeded PRNG, so `npm run gen:listings` is byte-for-byte reproducible.
 *
 * These are NOT scraped. No website is touched. In production this file is
 * replaced by Meesho's own similar-product search, which is why every file
 * carries "synthetic": true and the UI must label it as sample data.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const COUNT = 40
const Z90 = 1.2815515655446004 // standard normal 90th percentile

/** mulberry32 — small, fast, fully deterministic from a 32-bit seed. */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fixed seed per category id, so each category is stable and distinct. */
function seedFor(id) {
  let h = 2166136261
  for (const ch of id) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Inverse standard normal CDF (Acklam's rational approximation, |error| < 1e-9).
 *
 * The listings are STRATIFIED rather than drawn independently: point i sits at
 * quantile (i + 0.5) / n, with a small jitter. Forty independent draws give a
 * sample whose p90 can land 10-12% off the specified band (that is just
 * sampling noise at n = 40), and the band is configuration, not an experiment —
 * a category that says bandMedian 180 and bandSpread 0.35 should produce a band
 * whose p10 and p90 really are 180/1.35 and 180x1.35. Stratifying makes the
 * synthetic listings honour their own config, and keeps the demo stable.
 */
function probit(p) {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
             1.383577518672690e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
             6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
             -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
             3.754408661907416]
  const pLow = 0.02425
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p <= 1 - pLow) {
    const q = p - 0.5
    const r = q * q
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  }
  const q = Math.sqrt(-2 * Math.log(1 - p))
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
          ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
}

const TITLES = {
  ethnic_women: {
    brand: ['Shree', 'Kalakari', 'Anjani', 'Rangrez', 'Vastra', 'Bandhani House', 'Devi Creations', 'Saanvi'],
    item: ['Rayon Straight Kurti', 'Cotton A-Line Kurti', 'Printed Anarkali Kurti', 'Georgette Saree', 'Chiffon Saree with Blouse', 'Kurti with Palazzo Set', 'Embroidered Kurta', 'Cotton Nighty'],
    tag: ['Floral Print', 'Three Quarter Sleeve', 'Jaipuri Print', 'Daily Wear', 'Festive Collection', 'Pack of 1', 'Free Size', 'Combo Offer'],
  },
  western_women: {
    brand: ['Urbane', 'Nova Fab', 'Trendy Tales', 'Zuri', 'Casa Moda', 'Elvira', 'Dressy', 'Nikita Fashion'],
    item: ['Crepe Top', 'Denim Jeggings', 'Bodycon Dress', 'Ribbed T-Shirt', 'Palazzo Trouser', 'Co-ord Set', 'Printed Jumpsuit', 'Oversized Shirt'],
    tag: ['Solid', 'Stretchable', 'Western Wear', 'Casual Fit', 'Pack of 2', 'Trending Now', 'Slim Fit', 'Full Sleeve'],
  },
  men_apparel: {
    brand: ['Veer', 'Ambar', 'Rockfield', 'Hindustan Wear', 'Sagar Garments', 'Denim Co', 'Raahi', 'Sunshine Men'],
    item: ['Cotton Casual Shirt', 'Slim Fit Jeans', 'Round Neck T-Shirt', 'Formal Trouser', 'Printed Kurta', 'Track Pant', 'Polo T-Shirt', 'Nehru Jacket'],
    tag: ['Regular Fit', 'Pack of 2', 'Solid', 'Checked', 'Office Wear', 'Breathable Cotton', 'Slim Fit', 'Combo'],
  },
  kids: {
    brand: ['Nanhe', 'Little Star', 'Gudiya', 'Baby Bloom', 'Chhotu', 'Pari Kids', 'Sunny Kids', 'Munchkin'],
    item: ['Cotton Frock', 'T-Shirt & Short Set', 'Baby Romper', 'Winter Sweater', 'Party Wear Dress', 'Printed Night Suit', 'Dungaree Set', 'Ethnic Kurta Pyjama'],
    tag: ['Pack of 3', 'Age 2-3 Years', 'Soft Cotton', 'Cartoon Print', 'Daily Wear', 'Age 4-5 Years', 'Unisex', 'Combo Pack'],
  },
  footwear: {
    brand: ['Stepwell', 'Walkmate', 'Paduka', 'Rishi Footwear', 'Urban Sole', 'Chappal Bazaar', 'Trekker', 'Mochi Lite'],
    item: ['Running Shoes', 'Casual Sneakers', 'Kolhapuri Chappal', 'Ethnic Juti', 'Flat Sandal', 'Flip Flops', 'Formal Derby', 'Block Heel'],
    tag: ['Lightweight', 'Anti-Skid Sole', 'For Men', 'For Women', 'Daily Use', 'Handmade', 'Cushioned', 'Water Resistant'],
  },
  home_kitchen: {
    brand: ['Grihini', 'Steel Craft', 'Rasoi Rani', 'Homeneed', 'Shubh Home', 'Kitchen Mate', 'Nirmal', 'Utsav Home'],
    item: ['Stainless Steel Container Set', 'Non-Stick Tawa', 'Plastic Storage Jar Set', 'Cotton Bedsheet', 'Pressure Cooker 3L', 'Casserole Set', 'Door Mat Pack', 'Water Bottle Set'],
    tag: ['Pack of 6', 'Food Grade', 'Double Bed', 'Set of 3', 'Dishwasher Safe', 'BPA Free', 'Leak Proof', 'Heavy Gauge'],
  },
  beauty: {
    brand: ['Glow Up', 'Herbal Veda', 'Rupa Cosmetics', 'Nisha Beauty', 'Aroma Leaf', 'Shine On', 'Blush Box', 'Keshya'],
    item: ['Matte Liquid Lipstick', 'Kajal Pencil', 'Face Serum 30ml', 'Hair Oil 200ml', 'Compact Powder', 'Nail Polish Set', 'Aloe Vera Gel', 'Sunscreen SPF 50'],
    tag: ['Long Lasting', 'Pack of 4', 'Paraben Free', 'Waterproof', 'For All Skin Types', 'Combo', 'Ayurvedic', 'Travel Size'],
  },
  jewellery: {
    brand: ['Meena Jewels', 'Alankar', 'Gehna Ghar', 'Zevar', 'Pearl Point', 'Kundan Kala', 'Shringar', 'Mohini'],
    item: ['Oxidised Jhumka', 'Kundan Necklace Set', 'Pearl Earrings', 'Bangle Set', 'Nose Pin', 'Anklet Pair', 'Hair Clip Set', 'Finger Ring'],
    tag: ['Gold Plated', 'Set of 6', 'Traditional', 'Party Wear', 'Anti-Tarnish', 'Combo of 3', 'Lightweight', 'Handcrafted'],
  },
}

function pick(rnd, list) {
  return list[Math.floor(rnd() * list.length)]
}

const { categories } = JSON.parse(readFileSync(join(root, 'src/data/categories.json'), 'utf8'))
mkdirSync(join(root, 'src/data/listings'), { recursive: true })

for (const cat of categories) {
  const median = cat.bandMedian.value
  const spread = cat.bandSpread.value
  const seed = seedFor(cat.id)
  const rnd = mulberry32(seed)
  const words = TITLES[cat.id]

  // Log-normal: sigma is set so the 10th/90th percentiles land at
  // median / (1 + spread) and median * (1 + spread) respectively.
  const sigma = Math.log(1 + spread) / Z90

  const listings = []
  const seen = new Set()
  for (let i = 0; i < COUNT; i += 1) {
    // Stratified: the i-th listing sits at quantile (i + 0.5) / n, nudged a
    // little so the set does not look mechanically evenly spaced.
    const z = probit((i + 0.5) / COUNT) + (rnd() - 0.5) * 0.24
    const price = Math.max(29, Math.round(median * Math.exp(sigma * z)))
    // Cheaper listings tend to carry weaker ratings; keep it mild and bounded.
    const priceLift = Math.min(0.35, Math.max(-0.35, Math.log(price / median)))
    const rating = Math.min(4.8, Math.max(3.1, Math.round((3.75 + priceLift + (rnd() - 0.5) * 0.7) * 10) / 10))
    const ratingCount = Math.round(5 * Math.exp(rnd() * Math.log(1200)))

    let title = pick(rnd, words.brand) + ' ' + pick(rnd, words.item) + ' - ' + pick(rnd, words.tag)
    let guard = 0
    while (seen.has(title) && guard < 20) {
      title = pick(rnd, words.brand) + ' ' + pick(rnd, words.item) + ' - ' + pick(rnd, words.tag)
      guard += 1
    }
    seen.add(title)

    listings.push({
      id: cat.id + '-' + String(i + 1).padStart(2, '0'),
      title,
      price,
      rating,
      ratingCount,
    })
  }
  listings.sort((a, b) => a.price - b.price || a.id.localeCompare(b.id))

  const payload = {
    _note:
      'Sample market data (synthetic) — in production this comes from Meesho’s similar-product search. Nothing here was scraped.',
    synthetic: true,
    categoryId: cat.id,
    count: listings.length,
    generator: {
      script: 'scripts/generate-listings.mjs',
      prng: 'mulberry32',
      seed,
      distribution: 'log-normal about bandMedian; sigma = ln(1 + bandSpread) / z90',
      bandMedian: median,
      bandSpread: spread,
      source: 'ASSUMPTION — synthetic sample data generated for the prototype',
    },
    listings,
  }
  writeFileSync(join(root, 'src/data/listings/' + cat.id + '.json'), JSON.stringify(payload, null, 2) + '\n')

  const prices = listings.map((l) => l.price)
  const q = (p) => prices[Math.min(prices.length - 1, Math.floor((p / 100) * (prices.length - 1)))]
  console.log(
    cat.id.padEnd(14) +
      ' n=' + listings.length +
      ' median=' + median +
      ' -> p10=' + q(10) + ' p50=' + q(50) + ' p90=' + q(90) +
      ' min=' + prices[0] + ' max=' + prices[prices.length - 1],
  )
}
