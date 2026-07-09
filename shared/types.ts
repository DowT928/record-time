export type TaskKind = 'task' | 'project' | 'project_task'
export type TimerStatus = 'running' | 'paused'
export type BackupFrequency = 'daily' | 'weekly'
export type WindowMode = 'mini' | 'full'

export interface Category {
  id: number
  name: string
  color: string
  archived: boolean
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: number
  categoryId: number | null
  parentId: number | null
  name: string
  kind: TaskKind
  color: string
  archived: boolean
  archiveReview: string
  habitTargetMinutes: number | null
  totalSeconds: number
  lastWorkedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface TimeEntry {
  id: number
  taskId: number
  taskName: string
  categoryName: string | null
  startedAt: string
  endedAt: string
  durationSeconds: number
  log: string
  isManual: boolean
  createdAt: string
}

export interface TimerSession {
  id: number
  taskId: number
  taskName: string
  status: TimerStatus
  startedAt: string
  activeStartedAt: string | null
  accumulatedSeconds: number
  updatedAt: string
}

export interface CreateCategoryInput {
  name: string
  color?: string
}

export interface UpdateCategoryInput {
  id: number
  name: string
  color: string
}

export interface CreateTaskInput {
  name: string
  kind: TaskKind
  categoryId?: number | null
  parentId?: number | null
  color?: string
  habitTargetMinutes?: number | null
}

export interface UpdateTaskInput {
  id: number
  name?: string
  categoryId?: number | null
  parentId?: number | null
  color?: string
  habitTargetMinutes?: number | null
  archiveReview?: string
}

export interface EndTimerInput {
  log?: string
}

export interface ManualEntryInput {
  taskId: number
  startedAt: string
  endedAt: string
  log?: string
}

export interface UpdateTimeEntryInput {
  id: number
  startedAt: string
  endedAt: string
  log?: string
}

export interface TimelineDay {
  date: string
  totalSeconds: number
  entries: TimeEntry[]
}

export interface TrendPoint {
  date: string
  seconds: number
}

export interface HeatmapPoint {
  date: string
  seconds: number
}

export interface HabitProgress {
  taskId: number
  taskName: string
  targetMinutes: number
  todaySeconds: number
  completedToday: boolean
  streakDays: number
}

export interface DashboardStats {
  todaySeconds: number
  weekSeconds: number
  monthSeconds: number
  trend: TrendPoint[]
  heatmap: HeatmapPoint[]
  habits: HabitProgress[]
}

export interface AppSettings {
  backupFrequency: BackupFrequency
  remindersEnabled: boolean
  habitReminders: boolean
  longFocusReminder: boolean
  sedentaryReminder: boolean
  dailyReviewReminder: boolean
  lastBackupAt: string | null
}

export interface ExportResult {
  path: string
}

export interface FocusJournalApi {
  tasks: {
    list: () => Promise<{ categories: Category[]; tasks: Task[] }>
    createCategory: (input: CreateCategoryInput) => Promise<Category>
    updateCategory: (input: UpdateCategoryInput) => Promise<Category>
    removeCategory: (id: number) => Promise<void>
    createTask: (input: CreateTaskInput) => Promise<Task>
    updateTask: (input: UpdateTaskInput) => Promise<Task>
    archive: (id: number) => Promise<void>
    restore: (id: number) => Promise<void>
    remove: (id: number) => Promise<void>
    recent: () => Promise<Task[]>
  }
  timer: {
    getCurrent: () => Promise<TimerSession | null>
    start: (taskId: number) => Promise<TimerSession>
    pause: () => Promise<TimerSession | null>
    resume: () => Promise<TimerSession | null>
    end: (input?: EndTimerInput) => Promise<TimeEntry | null>
    manualEntry: (input: ManualEntryInput) => Promise<TimeEntry>
  }
  logs: {
    timeline: () => Promise<TimelineDay[]>
    search: (query: string) => Promise<TimeEntry[]>
    byTask: (taskId: number) => Promise<TimeEntry[]>
    update: (input: UpdateTimeEntryInput) => Promise<TimeEntry>
    remove: (id: number) => Promise<void>
  }
  stats: {
    dashboard: () => Promise<DashboardStats>
  }
  settings: {
    get: () => Promise<AppSettings>
    update: (input: Partial<AppSettings>) => Promise<AppSettings>
    backupNow: () => Promise<ExportResult>
    exportData: (format: 'json' | 'csv' | 'markdown') => Promise<ExportResult>
  }
  window: {
    setMode: (mode: WindowMode) => Promise<void>
    onModeChanged: (callback: (mode: WindowMode) => void) => () => void
    onTimerChanged: (callback: () => void) => () => void
  }
}
