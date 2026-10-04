import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { inr } from '../engine/format'
import type { StrategyRun, WeekRow } from '../engine/simulator'

/**
 * Charts A, B and C of the seller journey.
 *
 * This is where Recharts earns its place in the stack: three real time series
 * over 26 weeks, which is exactly the shape it is good at (Screen 2's band is a
 * 1-D price strip, so it is hand-built CSS instead).
 */

const PLUM = '#5B1A46'
const ORANGE = '#F58220'
const MAGENTA = '#E5006D'
const LILAC = '#F7EDF4'
const BODY = '#3D3D3D'
const PROFIT = '#1B8A5A'

const axis = { stroke: BODY, fontSize: 11, tickLine: false, axisLine: false }

const tooltipStyle = {
  contentStyle: {
    borderRadius: '0.75rem',
    border: 'none',
    background: '#fff',
    fontSize: '11px',
    padding: '8px 10px',
  },
  labelStyle: { color: PLUM, fontWeight: 600, marginBottom: 2 },
}

/**
 * Y-axis ticks: whole rupees with Indian grouping (₹10,000, -₹20,000).
 *
 * Never abbreviated. Rounding to "₹3k" turns ticks 2,500 and 3,000 into the
 * same label twice, and a duplicated axis label reads as a broken chart.
 */
export function inrTick(value: number): string {
  return value === 0 ? '₹0' : inr(value)
}

/** Only the weeks up to where the journey has been played. */
function upTo(weeks: WeekRow[], week: number) {
  return weeks.filter((w) => w.week <= week)
}

// ------------------------------------------------------------------ Chart A

interface ChartAProps {
  run: StrategyRun
  week: number
}

/** Price against the floor and the band, over the whole journey. */
export function PriceVsFloorChart({ run, week }: ChartAProps) {
  const data = upTo(run.weeks, week).map((w) => ({
    week: w.week,
    price: Math.round(w.price),
    floor: Math.round(w.floor),
    p10: Math.round(w.bandP10),
    p50: Math.round(w.bandP50),
    p90: Math.round(w.bandP90),
  }))

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
        <CartesianGrid stroke={LILAC} vertical={false} />
        <XAxis dataKey="week" {...axis} />
        <YAxis {...axis} width={52} allowDecimals={false} tickFormatter={inrTick} />
        <Tooltip
          {...tooltipStyle}
          formatter={(value: number, name: string) => [inr(value), name]}
          labelFormatter={(w) => `Week ${w}`}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
        <Line dataKey="p90" name="band p90" stroke={PLUM} strokeOpacity={0.25} dot={false} strokeWidth={1} isAnimationActive={false} />
        <Line dataKey="p50" name="band median" stroke={PLUM} strokeOpacity={0.45} dot={false} strokeWidth={1} strokeDasharray="4 3" isAnimationActive={false} />
        <Line dataKey="p10" name="band p10" stroke={PLUM} strokeOpacity={0.25} dot={false} strokeWidth={1} isAnimationActive={false} />
        <Line dataKey="floor" name="your floor" stroke={MAGENTA} dot={false} strokeWidth={2} isAnimationActive={false} />
        <Line dataKey="price" name="your price" stroke={ORANGE} dot={false} strokeWidth={2.5} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ------------------------------------------------------------------ Chart B

/** Weekly profit, with losing weeks in magenta. */
export function WeeklyProfitChart({ run, week }: ChartAProps) {
  const data = upTo(run.weeks, week).map((w) => ({
    week: w.week,
    profit: Math.round(w.profit),
  }))

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
        <CartesianGrid stroke={LILAC} vertical={false} />
        <XAxis dataKey="week" {...axis} />
        <YAxis {...axis} width={64} allowDecimals={false} tickFormatter={inrTick} />
        <Tooltip
          {...tooltipStyle}
          formatter={(value: number) => [inr(value), 'profit that week']}
          labelFormatter={(w) => `Week ${w}`}
        />
        <ReferenceLine y={0} stroke={BODY} strokeOpacity={0.3} />
        <Bar dataKey="profit" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.week} fill={d.profit < 0 ? MAGENTA : PROFIT} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ------------------------------------------------------------------ Chart C

interface ChartCProps {
  sahiDaam: StrategyRun
  sellerInstinct: StrategyRun
  meeshoRange: StrategyRun
  week: number
  height?: number
}

/**
 * The hero chart: cumulative profit, all three strategies, on the same world,
 * measured on the seller floor. The gaps at week 26 are the argument.
 */
export function CumulativeProfitChart({
  sahiDaam,
  sellerInstinct,
  meeshoRange,
  week,
  height = 300,
}: ChartCProps) {
  const data = upTo(sahiDaam.weeks, week).map((w, i) => ({
    week: w.week,
    sahi: Math.round(w.cumulativeProfit),
    instinct: Math.round(sellerInstinct.weeks[i]!.cumulativeProfit),
    range: Math.round(meeshoRange.weeks[i]!.cumulativeProfit),
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={LILAC} vertical={false} />
        <XAxis dataKey="week" {...axis} label={{ value: 'week', position: 'insideBottomRight', fontSize: 10, fill: BODY }} />
        <YAxis {...axis} width={72} allowDecimals={false} tickFormatter={inrTick} />
        <Tooltip
          {...tooltipStyle}
          formatter={(value: number, name: string) => [inr(value), name]}
          labelFormatter={(w) => `Week ${w}`}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
        {/* The festive stretch. */}
        <ReferenceLine x={16} stroke={PLUM} strokeOpacity={0.25} strokeDasharray="3 3" />
        <ReferenceLine x={21} stroke={PLUM} strokeOpacity={0.25} strokeDasharray="3 3" />
        <ReferenceLine y={0} stroke={BODY} strokeOpacity={0.35} />
        <Line
          dataKey="sahi"
          name="Sahi Daam"
          stroke={PROFIT}
          strokeWidth={3}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          dataKey="instinct"
          name="Seller instinct"
          stroke={MAGENTA}
          strokeWidth={3}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          dataKey="range"
          name="Meesho range"
          stroke={ORANGE}
          strokeWidth={3}
          strokeDasharray="6 4"
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
