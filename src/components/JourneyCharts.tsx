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
 * Charts A, B and C from spec section 9.4.
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
        <YAxis {...axis} width={48} tickFormatter={(v: number) => `₹${v}`} />
        <Tooltip
          {...tooltipStyle}
          formatter={(value: number, name: string) => [inr(value), name]}
          labelFormatter={(w) => `Week ${w}`}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
        <Line dataKey="p90" name="band p90" stroke={PLUM} strokeOpacity={0.25} dot={false} strokeWidth={1} />
        <Line dataKey="p50" name="band median" stroke={PLUM} strokeOpacity={0.45} dot={false} strokeWidth={1} strokeDasharray="4 3" />
        <Line dataKey="p10" name="band p10" stroke={PLUM} strokeOpacity={0.25} dot={false} strokeWidth={1} />
        <Line dataKey="floor" name="your floor" stroke={MAGENTA} dot={false} strokeWidth={2} />
        <Line dataKey="price" name="your price" stroke={ORANGE} dot={false} strokeWidth={2.5} />
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
        <YAxis {...axis} width={56} tickFormatter={(v: number) => (v === 0 ? '0' : `₹${v / 1000}k`)} />
        <Tooltip
          {...tooltipStyle}
          formatter={(value: number) => [inr(value), 'profit that week']}
          labelFormatter={(w) => `Week ${w}`}
        />
        <ReferenceLine y={0} stroke={BODY} strokeOpacity={0.3} />
        <Bar dataKey="profit" radius={[3, 3, 0, 0]}>
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
  week: number
  height?: number
}

/**
 * The hero chart: cumulative profit, both strategies, on the same world.
 *
 * One line climbs, the other falls, and the gap between them at week 26 is the
 * whole argument for the product in a single number.
 */
export function CumulativeProfitChart({
  sahiDaam,
  sellerInstinct,
  week,
  height = 300,
}: ChartCProps) {
  const data = upTo(sahiDaam.weeks, week).map((w, i) => ({
    week: w.week,
    sahi: Math.round(w.cumulativeProfit),
    instinct: Math.round(sellerInstinct.weeks[i]!.cumulativeProfit),
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={LILAC} vertical={false} />
        <XAxis dataKey="week" {...axis} label={{ value: 'week', position: 'insideBottomRight', fontSize: 10, fill: BODY }} />
        <YAxis
          {...axis}
          width={60}
          tickFormatter={(v: number) => (v === 0 ? '0' : `₹${Math.round(v / 1000)}k`)}
        />
        <Tooltip
          {...tooltipStyle}
          formatter={(value: number, name: string) => [inr(value), name]}
          labelFormatter={(w) => `Week ${w}`}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
        {/* The festive stretch, where the two lines separate fastest. */}
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
      </LineChart>
    </ResponsiveContainer>
  )
}
