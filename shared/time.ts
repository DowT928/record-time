import type { HeatmapPoint, TimeEntry, TrendPoint } from './types'

export function nowIso(): string {
  return new Date().toISOString()
}

export function durationSeconds(startIso: string, endIso: string): number {
  return Math.max(0, Math.floor((Date.parse(endIso) - Date.parse(startIso)) / 1000))
}

export function startOfLocalDay(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function dateKey(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function weekStart(date = new Date()): Date {
  const start = startOfLocalDay(date)
  const day = start.getDay() || 7
  return addDays(start, 1 - day)
}

export function monthStart(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function secondsForRange(entries: Pick<TimeEntry, 'startedAt' | 'durationSeconds'>[], start: Date, end: Date): number {
  const startMs = start.getTime()
  const endMs = end.getTime()
  return entries.reduce((total, entry) => {
    const entryMs = Date.parse(entry.startedAt)
    return entryMs >= startMs && entryMs < endMs ? total + entry.durationSeconds : total
  }, 0)
}

export function buildTrend(entries: Pick<TimeEntry, 'startedAt' | 'durationSeconds'>[], days: number, today = new Date()): TrendPoint[] {
  const end = startOfLocalDay(today)
  const start = addDays(end, -(days - 1))
  const buckets = new Map<string, number>()

  for (let index = 0; index < days; index += 1) {
    buckets.set(dateKey(addDays(start, index)), 0)
  }

  for (const entry of entries) {
    const key = dateKey(entry.startedAt)
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + entry.durationSeconds)
    }
  }

  return [...buckets.entries()].map(([date, seconds]) => ({ date, seconds }))
}

export function buildHeatmap(entries: Pick<TimeEntry, 'startedAt' | 'durationSeconds'>[], days: number, today = new Date()): HeatmapPoint[] {
  return buildTrend(entries, days, today)
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0m'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h`
  return `${minutes}m`
}
