import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Db } from './database'
import {
  addDays,
  buildHeatmap,
  buildTrend,
  dateKey,
  durationSeconds,
  monthStart,
  nowIso,
  secondsForRange,
  startOfLocalDay,
  weekStart,
} from '../../shared/time'
import type {
  AppSettings,
  Category,
  CreateCategoryInput,
  CreateTaskInput,
  DashboardStats,
  ExportResult,
  HabitProgress,
  HeatmapPoint,
  ManualEntryInput,
  Task,
  TimeEntry,
  TimelineDay,
  TimerSession,
  TrendPoint,
  UpdateCategoryInput,
  UpdateTimeEntryInput,
  UpdateTaskInput,
} from '../../shared/types'

interface Paths {
  dbPath: string
  backupDir: string
  exportDir: string
}

type CategoryRow = {
  id: number
  name: string
  color: string
  archived: number
  created_at: string
  updated_at: string
}

type TaskRow = {
  id: number
  category_id: number | null
  parent_id: number | null
  name: string
  kind: 'task' | 'project' | 'project_task'
  color: string
  archived: number
  archive_review: string
  habit_target_minutes: number | null
  total_seconds?: number | null
  last_worked_at?: string | null
  created_at: string
  updated_at: string
}

type EntryRow = {
  id: number
  task_id: number
  task_name: string
  category_name: string | null
  started_at: string
  ended_at: string
  duration_seconds: number
  log: string
  is_manual: number
  created_at: string
}

type TimerRow = {
  id: number
  task_id: number
  task_name: string
  status: 'running' | 'paused'
  started_at: string
  active_started_at: string | null
  accumulated_seconds: number
  updated_at: string
}

export class FocusJournalService {
  private readonly db: Db
  private readonly paths: Paths
  private readonly notifyChanged: () => void

  constructor(db: Db, paths: Paths, notifyChanged: () => void = () => undefined) {
    this.db = db
    this.paths = paths
    this.notifyChanged = notifyChanged
  }

  listTasks(): { categories: Category[]; tasks: Task[] } {
    const categories = this.db.prepare('SELECT * FROM categories ORDER BY archived, name').all() as CategoryRow[]
    const tasks = this.db.prepare(`
      SELECT
        t.*,
        COALESCE(SUM(e.duration_seconds), 0) AS total_seconds,
        MAX(e.started_at) AS last_worked_at
      FROM tasks t
      LEFT JOIN time_entries e ON e.task_id = t.id
      GROUP BY t.id
      ORDER BY t.archived, t.kind = 'project' DESC, t.name
    `).all() as TaskRow[]
    return {
      categories: categories.map(mapCategory),
      tasks: tasks.map(mapTask),
    }
  }

  createCategory(input: CreateCategoryInput): Category {
    const now = nowIso()
    const name = input.name.trim()
    if (!name) throw new Error('分类名称不能为空')
    const result = this.db.prepare(`
      INSERT INTO categories (name, color, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(name, input.color ?? '#3f6f68', now, now)
    const category = this.getCategory(Number(result.lastInsertRowid))
    this.notifyChanged()
    return category
  }

  updateCategory(input: UpdateCategoryInput): Category {
    this.getCategory(input.id)
    const name = input.name.trim()
    if (!name) throw new Error('分类名称不能为空')
    this.db.prepare(`
      UPDATE categories
      SET name = ?, color = ?, updated_at = ?
      WHERE id = ?
    `).run(name, input.color, nowIso(), input.id)
    const category = this.getCategory(input.id)
    this.notifyChanged()
    return category
  }

  removeCategory(id: number): void {
    this.getCategory(id)
    this.db.prepare('UPDATE tasks SET category_id = NULL, updated_at = ? WHERE category_id = ?').run(nowIso(), id)
    this.db.prepare('DELETE FROM categories WHERE id = ?').run(id)
    this.notifyChanged()
  }

  createTask(input: CreateTaskInput): Task {
    const now = nowIso()
    const name = input.name.trim()
    if (!name) throw new Error('任务名称不能为空')
    const result = this.db.prepare(`
      INSERT INTO tasks (category_id, parent_id, name, kind, color, habit_target_minutes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.categoryId ?? null,
      input.parentId ?? null,
      name,
      input.kind,
      input.color ?? '#3f6f68',
      input.habitTargetMinutes ?? null,
      now,
      now,
    )
    const task = this.getTask(Number(result.lastInsertRowid))
    this.notifyChanged()
    return task
  }

  updateTask(input: UpdateTaskInput): Task {
    const current = this.getTask(input.id)
    const now = nowIso()
    this.db.prepare(`
      UPDATE tasks
      SET name = ?, category_id = ?, parent_id = ?, color = ?, habit_target_minutes = ?, archive_review = ?, updated_at = ?
      WHERE id = ?
    `).run(
      input.name?.trim() || current.name,
      input.categoryId === undefined ? current.categoryId : input.categoryId,
      input.parentId === undefined ? current.parentId : input.parentId,
      input.color ?? current.color,
      input.habitTargetMinutes === undefined ? current.habitTargetMinutes : input.habitTargetMinutes,
      input.archiveReview === undefined ? current.archiveReview : input.archiveReview.trim(),
      now,
      input.id,
    )
    const task = this.getTask(input.id)
    this.notifyChanged()
    return task
  }

  archiveTask(id: number): void {
    this.db.prepare('UPDATE tasks SET archived = 1, updated_at = ? WHERE id = ?').run(nowIso(), id)
    this.notifyChanged()
  }

  restoreTask(id: number): void {
    this.db.prepare('UPDATE tasks SET archived = 0, updated_at = ? WHERE id = ?').run(nowIso(), id)
    this.notifyChanged()
  }

  removeTask(id: number): void {
    const current = this.getCurrentTimer()
    if (current?.taskId === id) {
      this.db.prepare('DELETE FROM timer_sessions WHERE id = 1').run()
    }
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
    this.notifyChanged()
  }

  recentTasks(): Task[] {
    const rows = this.db.prepare(`
      SELECT
        t.*,
        COALESCE(SUM(e.duration_seconds), 0) AS total_seconds,
        MAX(e.started_at) AS last_worked_at
      FROM tasks t
      JOIN time_entries e ON e.task_id = t.id
      WHERE t.archived = 0 AND t.kind != 'project'
      GROUP BY t.id
      ORDER BY last_worked_at DESC
      LIMIT 8
    `).all() as TaskRow[]
    return rows.map(mapTask)
  }

  getCurrentTimer(): TimerSession | null {
    const row = this.db.prepare(`
      SELECT s.*, t.name AS task_name
      FROM timer_sessions s
      JOIN tasks t ON t.id = s.task_id
      WHERE s.id = 1
    `).get() as TimerRow | undefined
    return row ? mapTimer(row) : null
  }

  startTimer(taskId: number): TimerSession {
    this.getTask(taskId)
    const now = nowIso()
    const current = this.getCurrentTimer()
    if (current?.status === 'running') {
      this.pauseTimer()
    }
    this.db.prepare(`
      INSERT INTO timer_sessions (id, task_id, status, started_at, active_started_at, accumulated_seconds, created_at, updated_at)
      VALUES (1, ?, 'running', ?, ?, 0, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        task_id = excluded.task_id,
        status = excluded.status,
        started_at = excluded.started_at,
        active_started_at = excluded.active_started_at,
        accumulated_seconds = excluded.accumulated_seconds,
        updated_at = excluded.updated_at
    `).run(taskId, now, now, now, now)
    const timer = this.getCurrentTimer()
    if (!timer) throw new Error('Timer failed to start')
    this.notifyChanged()
    return timer
  }

  pauseTimer(): TimerSession | null {
    const current = this.getCurrentTimer()
    if (!current || current.status === 'paused') return current
    const now = nowIso()
    const accumulated = current.accumulatedSeconds + durationSeconds(current.activeStartedAt ?? now, now)
    this.db.prepare(`
      UPDATE timer_sessions
      SET status = 'paused', active_started_at = NULL, accumulated_seconds = ?, updated_at = ?
      WHERE id = 1
    `).run(accumulated, now)
    const timer = this.getCurrentTimer()
    this.notifyChanged()
    return timer
  }

  resumeTimer(): TimerSession | null {
    const current = this.getCurrentTimer()
    if (!current || current.status === 'running') return current
    const now = nowIso()
    this.db.prepare(`
      UPDATE timer_sessions
      SET status = 'running', active_started_at = ?, updated_at = ?
      WHERE id = 1
    `).run(now, now)
    const timer = this.getCurrentTimer()
    this.notifyChanged()
    return timer
  }

  endTimer(log = ''): TimeEntry | null {
    const current = this.getCurrentTimer()
    if (!current) return null
    const now = nowIso()
    const liveSeconds = current.status === 'running' ? durationSeconds(current.activeStartedAt ?? now, now) : 0
    const total = current.accumulatedSeconds + liveSeconds
    const entry = this.insertTimeEntry({
      taskId: current.taskId,
      startedAt: current.startedAt,
      endedAt: now,
      durationSeconds: total,
      log,
      isManual: false,
    })
    this.db.prepare('DELETE FROM timer_sessions WHERE id = 1').run()
    this.notifyChanged()
    return entry
  }

  manualEntry(input: ManualEntryInput): TimeEntry {
    this.getTask(input.taskId)
    const total = durationSeconds(input.startedAt, input.endedAt)
    if (total <= 0) throw new Error('End time must be after start time')
    const entry = this.insertTimeEntry({
      taskId: input.taskId,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      durationSeconds: total,
      log: input.log ?? '',
      isManual: true,
    })
    this.notifyChanged()
    return entry
  }

  timeline(): TimelineDay[] {
    const entries = this.getEntries()
    const grouped = new Map<string, TimelineDay>()
    for (const entry of entries) {
      const key = dateKey(entry.startedAt)
      const day = grouped.get(key) ?? { date: key, totalSeconds: 0, entries: [] }
      day.totalSeconds += entry.durationSeconds
      day.entries.push(entry)
      grouped.set(key, day)
    }
    return [...grouped.values()].sort((a, b) => b.date.localeCompare(a.date))
  }

  searchLogs(query: string): TimeEntry[] {
    const term = `%${query.trim()}%`
    if (query.trim().length === 0) return this.getEntries().slice(0, 30)
    const rows = this.db.prepare(entrySelect(`
      WHERE t.name LIKE ? OR e.log LIKE ? OR c.name LIKE ?
      ORDER BY e.started_at DESC
      LIMIT 80
    `)).all(term, term, term) as EntryRow[]
    return rows.map(mapEntry)
  }

  entriesByTask(taskId: number): TimeEntry[] {
    const rows = this.db.prepare(entrySelect(`
      WHERE e.task_id = ?
      ORDER BY e.started_at DESC
    `)).all(taskId) as EntryRow[]
    return rows.map(mapEntry)
  }

  updateEntry(input: UpdateTimeEntryInput): TimeEntry {
    this.getEntry(input.id)
    const total = durationSeconds(input.startedAt, input.endedAt)
    if (total <= 0) throw new Error('End time must be after start time')
    this.db.prepare(`
      UPDATE time_entries
      SET started_at = ?, ended_at = ?, duration_seconds = ?, log = ?, updated_at = ?
      WHERE id = ?
    `).run(input.startedAt, input.endedAt, total, (input.log ?? '').trim(), nowIso(), input.id)
    const entry = this.getEntry(input.id)
    this.notifyChanged()
    return entry
  }

  removeEntry(id: number): void {
    this.getEntry(id)
    this.db.prepare('DELETE FROM time_entries WHERE id = ?').run(id)
    this.notifyChanged()
  }

  dashboard(): DashboardStats {
    const entries = this.getEntries()
    const today = startOfLocalDay()
    const tomorrow = addDays(today, 1)
    const week = weekStart()
    const month = monthStart()
    const trend = buildTrend(entries, 7)
    const heatmap = buildHeatmap(entries, 365)
    return {
      todaySeconds: secondsForRange(entries, today, tomorrow),
      weekSeconds: secondsForRange(entries, week, tomorrow),
      monthSeconds: secondsForRange(entries, month, tomorrow),
      trend,
      heatmap,
      habits: this.habitProgress(entries),
    }
  }

  getSettings(): AppSettings {
    const rows = this.db.prepare('SELECT key, value FROM app_settings').all() as { key: string; value: string }[]
    const values = Object.fromEntries(rows.map((row) => [row.key, row.value]))
    return {
      backupFrequency: values.backupFrequency === 'weekly' ? 'weekly' : 'daily',
      remindersEnabled: values.remindersEnabled === 'true',
      habitReminders: values.habitReminders === 'true',
      longFocusReminder: values.longFocusReminder === 'true',
      sedentaryReminder: values.sedentaryReminder === 'true',
      dailyReviewReminder: values.dailyReviewReminder === 'true',
      lastBackupAt: values.lastBackupAt || null,
    }
  }

  updateSettings(input: Partial<AppSettings>): AppSettings {
    const write = this.db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue
      write.run(key, value === null ? '' : String(value))
    }
    this.notifyChanged()
    return this.getSettings()
  }

  maybeAutoBackup(): void {
    const settings = this.getSettings()
    const today = dateKey(new Date())
    if (!settings.lastBackupAt) {
      this.backupNow()
      return
    }
    const last = new Date(settings.lastBackupAt)
    const diffDays = Math.floor((startOfLocalDay().getTime() - startOfLocalDay(last).getTime()) / 86400000)
    if ((settings.backupFrequency === 'daily' && diffDays >= 1) || (settings.backupFrequency === 'weekly' && diffDays >= 7)) {
      this.backupNow(`${today}-auto`)
    }
  }

  backupNow(prefix = dateKey(new Date())): ExportResult {
    ensureDir(this.paths.backupDir)
    const target = join(this.paths.backupDir, `${prefix}-focus-journal.sqlite`)
    copyFileSync(this.paths.dbPath, target)
    this.updateSettings({ lastBackupAt: nowIso() })
    return { path: target }
  }

  exportData(format: 'json' | 'csv' | 'markdown'): ExportResult {
    ensureDir(this.paths.exportDir)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const target = join(this.paths.exportDir, `focus-journal-${timestamp}.${format === 'markdown' ? 'md' : format}`)
    const data = {
      exportedAt: nowIso(),
      ...this.listTasks(),
      entries: this.getEntries().reverse(),
      settings: this.getSettings(),
    }

    if (format === 'json') {
      writeFileSync(target, JSON.stringify(data, null, 2), 'utf8')
    } else if (format === 'csv') {
      const header = 'id,task,category,started_at,ended_at,duration_seconds,manual,log'
      const rows = data.entries.map((entry) => [
        entry.id,
        csv(entry.taskName),
        csv(entry.categoryName ?? ''),
        entry.startedAt,
        entry.endedAt,
        entry.durationSeconds,
        entry.isManual ? 'true' : 'false',
        csv(entry.log),
      ].join(','))
      writeFileSync(target, [header, ...rows].join('\n'), 'utf8')
    } else {
      const lines = ['# Focus Journal Export', '', `导出时间：${data.exportedAt}`, '']
      for (const day of this.timeline()) {
        lines.push(`## ${day.date}`)
        for (const entry of day.entries) {
          lines.push(`- ${entry.taskName} ${Math.round(entry.durationSeconds / 60)}m`)
          if (entry.log) lines.push(`  ${entry.log}`)
        }
        lines.push('')
      }
      writeFileSync(target, lines.join('\n'), 'utf8')
    }

    return { path: target }
  }

  private getCategory(id: number): Category {
    const row = this.db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as CategoryRow | undefined
    if (!row) throw new Error('Time entry does not exist')
    return mapCategory(row)
  }

  private getTask(id: number): Task {
    const row = this.db.prepare(`
      SELECT
        t.*,
        COALESCE(SUM(e.duration_seconds), 0) AS total_seconds,
        MAX(e.started_at) AS last_worked_at
      FROM tasks t
      LEFT JOIN time_entries e ON e.task_id = t.id
      WHERE t.id = ?
      GROUP BY t.id
    `).get(id) as TaskRow | undefined
    if (!row) throw new Error('Time entry does not exist')
    return mapTask(row)
  }

  private insertTimeEntry(input: {
    taskId: number
    startedAt: string
    endedAt: string
    durationSeconds: number
    log: string
    isManual: boolean
  }): TimeEntry {
    const now = nowIso()
    const result = this.db.prepare(`
      INSERT INTO time_entries (task_id, started_at, ended_at, duration_seconds, log, is_manual, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(input.taskId, input.startedAt, input.endedAt, input.durationSeconds, input.log.trim(), input.isManual ? 1 : 0, now, now)
    const row = this.db.prepare(entrySelect('WHERE e.id = ?')).get(Number(result.lastInsertRowid)) as EntryRow
    return mapEntry(row)
  }

  private getEntries(): TimeEntry[] {
    const rows = this.db.prepare(entrySelect('ORDER BY e.started_at DESC')).all() as EntryRow[]
    return rows.map(mapEntry)
  }

  private getEntry(id: number): TimeEntry {
    const row = this.db.prepare(entrySelect('WHERE e.id = ?')).get(id) as EntryRow | undefined
    if (!row) throw new Error('Time entry does not exist')
    return mapEntry(row)
  }

  private habitProgress(entries: TimeEntry[]): HabitProgress[] {
    const tasks = this.listTasks().tasks.filter((task) => !task.archived && task.habitTargetMinutes)
    const todayKey = dateKey(new Date())
    return tasks.map((task) => {
      const targetSeconds = (task.habitTargetMinutes ?? 0) * 60
      const taskEntries = entries.filter((entry) => entry.taskId === task.id)
      const todaySeconds = taskEntries
        .filter((entry) => dateKey(entry.startedAt) === todayKey)
        .reduce((total, entry) => total + entry.durationSeconds, 0)
      return {
        taskId: task.id,
        taskName: task.name,
        targetMinutes: task.habitTargetMinutes ?? 0,
        todaySeconds,
        completedToday: todaySeconds >= targetSeconds,
        streakDays: streakDays(taskEntries, targetSeconds),
      }
    })
  }
}

function entrySelect(suffix: string): string {
  return `
    SELECT
      e.id,
      e.task_id,
      t.name AS task_name,
      c.name AS category_name,
      e.started_at,
      e.ended_at,
      e.duration_seconds,
      e.log,
      e.is_manual,
      e.created_at
    FROM time_entries e
    JOIN tasks t ON t.id = e.task_id
    LEFT JOIN categories c ON c.id = t.category_id
    ${suffix}
  `
}

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    archived: Boolean(row.archived),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    categoryId: row.category_id,
    parentId: row.parent_id,
    name: row.name,
    kind: row.kind,
    color: row.color,
    archived: Boolean(row.archived),
    archiveReview: row.archive_review ?? '',
    habitTargetMinutes: row.habit_target_minutes,
    totalSeconds: row.total_seconds ?? 0,
    lastWorkedAt: row.last_worked_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapEntry(row: EntryRow): TimeEntry {
  return {
    id: row.id,
    taskId: row.task_id,
    taskName: row.task_name,
    categoryName: row.category_name,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    log: row.log,
    isManual: Boolean(row.is_manual),
    createdAt: row.created_at,
  }
}

function mapTimer(row: TimerRow): TimerSession {
  return {
    id: row.id,
    taskId: row.task_id,
    taskName: row.task_name,
    status: row.status,
    startedAt: row.started_at,
    activeStartedAt: row.active_started_at,
    accumulatedSeconds: row.accumulated_seconds,
    updatedAt: row.updated_at,
  }
}

function streakDays(entries: TimeEntry[], targetSeconds: number): number {
  const totals = new Map<string, number>()
  for (const entry of entries) {
    const key = dateKey(entry.startedAt)
    totals.set(key, (totals.get(key) ?? 0) + entry.durationSeconds)
  }
  let cursor = startOfLocalDay()
  let streak = 0
  while ((totals.get(dateKey(cursor)) ?? 0) >= targetSeconds) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

function csv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export type StatsForCharts = {
  trend: TrendPoint[]
  heatmap: HeatmapPoint[]
}

