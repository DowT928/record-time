import { describe, expect, it } from 'vitest'
import { addDays, buildHeatmap, buildTrend, durationSeconds, secondsForRange, startOfLocalDay, weekStart } from './time'

const entries = [
  { startedAt: '2026-06-01T01:00:00.000Z', durationSeconds: 1800 },
  { startedAt: '2026-06-01T03:00:00.000Z', durationSeconds: 3600 },
  { startedAt: '2026-06-02T01:00:00.000Z', durationSeconds: 7200 },
]

describe('time utilities', () => {
  it('calculates duration in integer seconds', () => {
    expect(durationSeconds('2026-06-01T00:00:00.000Z', '2026-06-01T00:30:20.900Z')).toBe(1820)
    expect(durationSeconds('2026-06-01T00:30:00.000Z', '2026-06-01T00:00:00.000Z')).toBe(0)
  })

  it('aggregates trend and heatmap buckets by local date', () => {
    const trend = buildTrend(entries, 3, new Date('2026-06-03T12:00:00'))
    expect(trend.map((point) => point.seconds)).toEqual([5400, 7200, 0])

    const heatmap = buildHeatmap(entries, 3, new Date('2026-06-03T12:00:00'))
    expect(heatmap).toEqual(trend)
  })

  it('sums entries inside a date range', () => {
    const start = startOfLocalDay(new Date('2026-06-01T12:00:00'))
    const end = addDays(start, 1)
    expect(secondsForRange(entries, start, end)).toBe(5400)
  })

  it('uses Monday as week start', () => {
    expect(weekStart(new Date('2026-06-07T12:00:00')).getDay()).toBe(1)
  })
})
