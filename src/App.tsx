import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  Flame,
  Folder,
  History,
  Maximize2,
  Minimize2,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Square,
  Target,
  Trash2,
  Trophy,
  X,
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Category, DashboardStats, Task, TimelineDay, TimeEntry, TimerSession, WindowMode } from '../shared/types'
import { addDays, dateKey } from '../shared/time'
import { formatClock, formatDateTimeInput, formatDuration, formatTime, inputToIso } from './utils/format'

type View = 'dashboard' | 'tasks' | 'timeline' | 'search' | 'habits' | 'archive'

const api = window.focusJournal
const CATEGORY_COLORS = [
  { value: '#3f6f68', label: '松石绿' },
  { value: '#3ba7c9', label: '湖水蓝' },
  { value: '#8a5a44', label: '陶土棕' },
  { value: '#6c6f2f', label: '橄榄绿' },
  { value: '#ee7f6d', label: '珊瑚红' },
  { value: '#d6a93f', label: '暖阳黄' },
]
const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'))

function CategoryColorPalette({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="category-color-palette" aria-label="分类颜色">
      {CATEGORY_COLORS.map((color) => (
        <button
          key={color.value}
          className={value === color.value ? 'selected' : ''}
          title={color.label}
          aria-label={color.label}
          aria-pressed={value === color.value}
          style={{ background: color.value }}
          onClick={() => onChange(color.value)}
        />
      ))}
    </div>
  )
}

function BoundedDateTimeInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [date = '', time = '00:00'] = value.split('T')
  const [hour = '00', minute = '00'] = time.split(':')

  function updateDate(nextDate: string) {
    onChange(`${nextDate}T${hour}:${minute}`)
  }

  function updateTime(nextHour: string, nextMinute: string) {
    onChange(`${date}T${nextHour}:${nextMinute}`)
  }

  return (
    <label className="bounded-datetime">
      <span>{label}</span>
      <div className="bounded-datetime-controls">
        <input type="date" value={date} onChange={(event) => updateDate(event.target.value)} />
        <select aria-label={`${label}小时`} value={hour} onChange={(event) => updateTime(event.target.value, minute)}>
          {HOURS.map((option) => <option key={option} value={option}>{option} 时</option>)}
        </select>
        <select aria-label={`${label}分钟`} value={minute} onChange={(event) => updateTime(hour, event.target.value)}>
          {MINUTES.map((option) => <option key={option} value={option}>{option} 分</option>)}
        </select>
      </div>
    </label>
  )
}

function App() {
  if (!api) {
    return (
      <main className="bridge-error">
        <h1>Focus Journal failed to start</h1>
        <p>The desktop bridge did not load. Run npm run build, then npm start again.</p>
      </main>
    )
  }

  return <FocusJournalApp />
}

function FocusJournalApp() {
  const [windowMode, setWindowMode] = useState<WindowMode>('mini')
  const [view, setView] = useState<View>('tasks')
  const [categories, setCategories] = useState<Category[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [recent, setRecent] = useState<Task[]>([])
  const [timer, setTimer] = useState<TimerSession | null>(null)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [timeline, setTimeline] = useState<TimelineDay[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<TimeEntry[]>([])
  const [taskViewMode, setTaskViewMode] = useState<'recent' | 'category' | 'project'>('recent')
  const [createMode, setCreateMode] = useState<'category' | 'project' | 'task' | 'habit' | 'projectTask' | null>(null)
  const [projectTaskParent, setProjectTaskParent] = useState<Task | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [endingTimerOpen, setEndingTimerOpen] = useState(false)
  const [endingResumeOnCancel, setEndingResumeOnCancel] = useState(false)
  const [endingLog, setEndingLog] = useState('')
  const [confirmation, setConfirmation] = useState<{
    eyebrow: string
    title: string
    message: string
    confirmLabel: string
    tone?: 'danger' | 'default'
    onConfirm: () => Promise<unknown> | unknown
  } | null>(null)
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const [manualTaskId, setManualTaskId] = useState<number | null>(null)
  const [manualStart, setManualStart] = useState(() => formatDateTimeInput(new Date(Date.now() - 30 * 60_000)))
  const [manualEnd, setManualEnd] = useState(() => formatDateTimeInput())
  const [manualLog, setManualLog] = useState('')
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [entryStart, setEntryStart] = useState('')
  const [entryEnd, setEntryEnd] = useState('')
  const [entryLog, setEntryLog] = useState('')
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [detailEntries, setDetailEntries] = useState<TimeEntry[]>([])
  const [detailEditing, setDetailEditing] = useState(false)
  const [detailName, setDetailName] = useState('')
  const [detailDescription, setDetailDescription] = useState('')
  const [detailAssignment, setDetailAssignment] = useState('uncategorized')
  const [taskName, setTaskName] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [habitMinutes, setHabitMinutes] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [categoryColor, setCategoryColor] = useState('#3f6f68')
  const [tick, setTick] = useState(() => Date.now())

  const activeTasks = useMemo(() => tasks.filter((task) => !task.archived), [tasks])
  const runnableTasks = useMemo(() => activeTasks.filter((task) => task.kind !== 'project'), [activeTasks])

  const elapsedSeconds = useMemo(() => {
    if (!timer) return 0
    const live = timer.status === 'running' && timer.activeStartedAt
      ? Math.max(0, Math.floor((tick - Date.parse(timer.activeStartedAt)) / 1000))
      : 0
    return timer.accumulatedSeconds + live
  }, [tick, timer])

  async function refresh() {
    const [taskData, current, dashboardData, timelineData, recentTasks] = await Promise.all([
      api.tasks.list(),
      api.timer.getCurrent(),
      api.stats.dashboard(),
      api.logs.timeline(),
      api.tasks.recent(),
    ])
    setCategories(taskData.categories)
    setTasks(taskData.tasks)
    setTimer(current)
    setStats(dashboardData)
    setTimeline(timelineData)
    setRecent(recentTasks)
  }

  useEffect(() => {
    void Promise.resolve().then(refresh)
    const timerChanged = api.window.onTimerChanged(refresh)
    const modeChanged = api.window.onModeChanged((mode) => setWindowMode(mode))
    return () => {
      timerChanged()
      modeChanged()
    }
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(null), 2600)
    return () => window.clearTimeout(id)
  }, [notice])

  function showNotice(message: string, tone: 'success' | 'error') {
    setNotice({ message, tone })
  }

  async function run(action: () => Promise<unknown>, successMessage?: string): Promise<boolean> {
    try {
      await action()
      await refresh()
      if (successMessage) showNotice(successMessage, 'success')
      return true
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message.split('Error: ').at(-1) : null
      showNotice(message || '操作失败，请重试', 'error')
      return false
    }
  }

  async function startTask(taskId: number) {
    await run(() => api.timer.start(taskId), '已开始计时')
  }

  async function endTimer() {
    if (!timer) return
    const shouldResumeOnCancel = timer.status === 'running'
    if (shouldResumeOnCancel) {
      const paused = await run(api.timer.pause)
      if (!paused) return
    }
    setEndingResumeOnCancel(shouldResumeOnCancel)
    setEndingTimerOpen(true)
  }

  async function submitEndingTimer() {
    const ended = await run(() => api.timer.end({ log: endingLog }), '计时已结束')
    if (!ended) return
    setEndingLog('')
    setEndingResumeOnCancel(false)
    setEndingTimerOpen(false)
  }

  async function cancelEndingTimer() {
    const shouldResume = endingResumeOnCancel
    setEndingTimerOpen(false)
    setEndingResumeOnCancel(false)
    setEndingLog('')
    if (shouldResume) await run(api.timer.resume)
  }

  function toggleWindowMode() {
    const next: WindowMode = windowMode === 'mini' ? 'full' : 'mini'
    setWindowMode(next)
    void api.window.setMode(next)
  }

  async function createTask() {
    const created = await run(
      () => api.tasks.createTask({
        name: taskName,
        description: taskDescription,
        kind: 'task',
        categoryId: categoryId === '' ? null : Number(categoryId),
        parentId: null,
        habitTargetMinutes: null,
      }),
      '任务创建成功',
    )
    if (!created) return
    setTaskName('')
    setTaskDescription('')
    setCreateMode(null)
  }

  async function createHabit() {
    if (!habitMinutes) {
      showNotice('请填写每日目标分钟', 'error')
      return
    }
    const created = await run(
      () => api.tasks.createTask({
        name: taskName,
        description: taskDescription,
        kind: 'task',
        categoryId: categoryId === '' ? null : Number(categoryId),
        parentId: null,
        habitTargetMinutes: Number(habitMinutes),
      }),
      '习惯创建成功',
    )
    if (!created) return
    setTaskName('')
    setTaskDescription('')
    setHabitMinutes('')
    setCreateMode(null)
  }

  async function createProjectTask() {
    if (!projectTaskParent) return
    const created = await run(
      () => api.tasks.createTask({
        name: taskName,
        description: taskDescription,
        kind: 'project_task',
        categoryId: null,
        parentId: projectTaskParent.id,
        habitTargetMinutes: habitMinutes ? Number(habitMinutes) : null,
      }),
      '项目任务创建成功',
    )
    if (!created) return
    setTaskName('')
    setTaskDescription('')
    setHabitMinutes('')
    setProjectTaskParent(null)
    setCreateMode(null)
  }

  async function createCategory() {
    const created = await run(() => api.tasks.createCategory({ name: categoryName, color: categoryColor }), '分类创建成功')
    if (!created) return
    setCategoryName('')
    setCategoryColor('#3f6f68')
    setCreateMode(null)
  }

  async function updateCategory(category: Category, name: string, color: string): Promise<boolean> {
    return run(() => api.tasks.updateCategory({ id: category.id, name, color }), '分类已更新')
  }

  async function createProject() {
    const created = await run(
      () => api.tasks.createTask({
        name: taskName,
        description: taskDescription,
        kind: 'project',
        parentId: null,
        habitTargetMinutes: null,
      }),
      '项目创建成功',
    )
    if (!created) return
    setTaskName('')
    setTaskDescription('')
    setCreateMode(null)
  }

  function confirmAction(input: {
    eyebrow: string
    title: string
    message: string
    confirmLabel?: string
    tone?: 'danger' | 'default'
    onConfirm: () => Promise<unknown> | unknown
  }) {
    setConfirmation({
      confirmLabel: '确认',
      tone: 'default',
      ...input,
    })
  }

  async function confirmTaskRemoval(task: Task) {
    confirmAction({
      eyebrow: '删除任务',
      title: task.name,
      message: '删除后任务及其记录不可恢复。',
      confirmLabel: '删除',
      tone: 'danger',
      onConfirm: async () => {
        const removed = await run(() => api.tasks.remove(task.id))
        if (removed && detailTask?.id === task.id) setDetailTask(null)
      },
    })
  }

  async function confirmConfirmation() {
    const current = confirmation
    if (!current) return
    await current.onConfirm()
    setConfirmation(null)
  }

  async function removeCategory(category: Category) {
    const taskCount = tasks.filter((task) => task.categoryId === category.id).length
    const detail = taskCount > 0 ? `，其中 ${taskCount} 个任务将变为未分类` : ''
    confirmAction({
      eyebrow: '删除分类',
      title: category.name,
      message: `删除这个分类${detail}。`,
      confirmLabel: '删除',
      tone: 'danger',
      onConfirm: () => run(() => api.tasks.removeCategory(category.id), '分类已删除'),
    })
  }

  function openProjectTaskDialog(project: Task) {
    setTaskName('')
    setTaskDescription('')
    setHabitMinutes('')
    setProjectTaskParent(project)
    setCreateMode('projectTask')
  }

  function openTaskDialog(category: number | null) {
    setTaskName('')
    setTaskDescription('')
    setCategoryId(category ?? '')
    setProjectTaskParent(null)
    setCreateMode('task')
  }

  function openProjectDialog() {
    setTaskName('')
    setTaskDescription('')
    setCategoryId('')
    setCreateMode('project')
  }

  async function manualEntry() {
    if (!manualTaskId) return
    await run(
      () => api.timer.manualEntry({
        taskId: manualTaskId,
        startedAt: inputToIso(manualStart),
        endedAt: inputToIso(manualEnd),
        log: manualLog,
      }),
    )
    setManualLog('')
    setManualOpen(false)
  }

  function openEntryEditor(entry: TimeEntry) {
    setEditingEntry(entry)
    setEntryStart(formatDateTimeInput(new Date(entry.startedAt)))
    setEntryEnd(formatDateTimeInput(new Date(entry.endedAt)))
    setEntryLog(entry.log)
  }

  async function updateEntry() {
    if (!editingEntry) return
    const updated = await run(
      () => api.logs.update({
        id: editingEntry.id,
        startedAt: inputToIso(entryStart),
        endedAt: inputToIso(entryEnd),
        log: entryLog,
      }),
      '记录已更新',
    )
    if (updated) setEditingEntry(null)
  }

  async function removeEntry(entry: TimeEntry) {
    confirmAction({
      eyebrow: '删除记录',
      title: entry.taskName,
      message: '删除这条专注记录后不可恢复。',
      confirmLabel: '删除',
      tone: 'danger',
      onConfirm: () => run(() => api.logs.remove(entry.id), '记录已删除'),
    })
  }

  async function openTaskDetails(task: Task) {
    setDetailTask(task)
    setDetailEntries([])
    setDetailEditing(false)
    setDetailName(task.name)
    setDetailDescription(task.description ?? '')
    setDetailAssignment(task.parentId !== null
      ? `project:${task.parentId}`
      : task.categoryId !== null
        ? `category:${task.categoryId}`
        : 'uncategorized')
    try {
      setDetailEntries(await api.logs.byTask(task.id))
    } catch (error) {
      console.error(error)
      showNotice('读取任务记录失败', 'error')
    }
  }

  async function saveTaskDetails() {
    if (!detailTask) return
    const [assignmentType, assignmentId] = detailAssignment.split(':')
    const parentId = detailTask.kind === 'project' || assignmentType !== 'project' ? null : Number(assignmentId)
    const nextCategoryId = detailTask.kind === 'project' || assignmentType !== 'category' ? null : Number(assignmentId)
    const updated = await run(() => api.tasks.updateTask({
      id: detailTask.id,
      name: detailName,
      description: detailDescription,
      categoryId: nextCategoryId,
      parentId,
    }), '任务已更新')
    if (!updated) return
    const nextTask: Task = {
      ...detailTask,
      name: detailName.trim() || detailTask.name,
      description: detailDescription.trim(),
      categoryId: nextCategoryId,
      parentId,
      kind: detailTask.kind === 'project' ? 'project' : parentId === null ? 'task' : 'project_task',
    }
    setDetailTask(nextTask)
    setDetailEditing(false)
    setDetailEntries(await api.logs.byTask(nextTask.id))
  }

  async function search() {
    const results = await api.logs.search(searchQuery)
    setSearchResults(results)
  }

  async function exportData(format: 'json' | 'csv' | 'markdown') {
    await api.settings.exportData(format)
  }

  function renderOverlays() {
    return (
      <>
        {endingTimerOpen && timer && (
          <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && void cancelEndingTimer()}>
            <div className="dialog-modal compact">
              <div className="dialog-header">
                <div>
                  <span className="eyebrow">结束计时</span>
                  <h2>{timer.taskName}</h2>
                </div>
                <button onClick={() => void cancelEndingTimer()}>关闭</button>
              </div>
              <div className="form-grid">
                <textarea autoFocus value={endingLog} onChange={(event) => setEndingLog(event.target.value)} placeholder="这次专注做了什么" />
                <button onClick={submitEndingTimer}><Square size={16} /> 保存并结束</button>
              </div>
            </div>
          </div>
        )}

        {confirmation && (
          <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && setConfirmation(null)}>
            <div className="dialog-modal compact confirm-modal">
              <div className="dialog-header">
                <div>
                  <span className="eyebrow">{confirmation.eyebrow}</span>
                  <h2>{confirmation.title}</h2>
                </div>
                <button onClick={() => setConfirmation(null)}>关闭</button>
              </div>
              <p>{confirmation.message}</p>
              <div className="dialog-actions">
                <button onClick={() => setConfirmation(null)}>取消</button>
                <button className={confirmation.tone === 'danger' ? 'danger-button' : ''} onClick={confirmConfirmation}>
                  {confirmation.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}

        {notice && (
          <div className={`notice-toast ${notice.tone}`} role="status">
            <span>{notice.tone === 'success' ? <Check size={17} /> : <X size={17} />}</span>
            <p>{notice.message}</p>
          </div>
        )}
      </>
    )
  }

  if (windowMode === 'mini') {
    const displayTasks = (recent.length ? recent : runnableTasks).filter((t) => !t.archived).slice(0, 8)
    return (
      <>
        <main className="mini-container">
          <header className="mini-header">
            <div className="brand-mini">
              <div className="brand-mark">FJ</div>
            </div>
            <button title="展开完整界面" onClick={toggleWindowMode}>
              <Maximize2 size={16} />
            </button>
          </header>

          <section className="mini-timer">
            <span className="mini-timer-task">{timer ? timer.taskName : '没有正在计时'}</span>
            <span className="mini-timer-clock">{formatClock(elapsedSeconds)}</span>
            <div className="mini-timer-actions">
              {timer?.status === 'running' ? (
                <button title="暂停" onClick={() => run(api.timer.pause)}><Pause size={18} /></button>
              ) : (
                <button title="继续" disabled={!timer} onClick={() => run(api.timer.resume)}><Play size={18} /></button>
              )}
              <button title="结束" disabled={!timer} onClick={endTimer}><Square size={16} /></button>
            </div>
          </section>

          <section className="mini-task-list">
            <div className="mini-task-list-header">
              <span>最近任务</span>
            </div>
            {displayTasks.length === 0 ? (
              <p className="mini-empty">暂无任务</p>
            ) : (
              displayTasks.map((task) => (
                <div className="mini-task-item" key={task.id} onClick={() => startTask(task.id)}>
                  <div className="mini-task-info">
                    <div className="mini-task-name">{task.name}</div>
                    <div className="mini-task-time">{formatDuration(task.totalSeconds)}</div>
                  </div>
                  <button className="mini-task-play" title="开始计时" onClick={(e) => { e.stopPropagation(); startTask(task.id) }}>
                    <Play size={14} />
                  </button>
                </div>
              ))
            )}
          </section>
        </main>
        {renderOverlays()}
      </>
    )
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">FJ</div>
          <div>
            <strong>Focus Journal</strong>
            <span>时间 · 日志 · 复盘</span>
          </div>
        </div>
        <nav>
          <NavButton active={view === 'tasks'} icon={<Folder size={18} />} label="任务" onClick={() => setView('tasks')} />
          <NavButton active={view === 'habits'} icon={<Check size={18} />} label="习惯" onClick={() => setView('habits')} />
          <NavButton active={view === 'dashboard'} icon={<BarChart3 size={18} />} label="仪表盘" onClick={() => setView('dashboard')} />
          <NavButton active={view === 'timeline'} icon={<History size={18} />} label="时间线" onClick={() => setView('timeline')} />
          <NavButton active={view === 'archive'} icon={<Archive size={18} />} label="归档" onClick={() => setView('archive')} />
          <NavButton active={view === 'search'} icon={<Search size={18} />} label="搜索" onClick={() => setView('search')} />
        </nav>
        <button className="quick-button" onClick={toggleWindowMode}>
          <Minimize2 size={18} />
          精简模式
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">{new Date().toLocaleDateString()}</span>
            <h1>{titleFor(view)}</h1>
          </div>
          <div className="timer-pill">
            <span>{timer ? timer.taskName : '没有正在计时'}</span>
            <strong>{formatClock(elapsedSeconds)}</strong>
            {timer?.status === 'running' ? (
              <button title="暂停" onClick={() => run(api.timer.pause)}><Pause size={17} /></button>
            ) : (
              <button title="继续" disabled={!timer} onClick={() => run(api.timer.resume)}><Play size={17} /></button>
            )}
            <button title="结束" disabled={!timer} onClick={endTimer}><Square size={16} /></button>
          </div>
        </header>

        {view === 'dashboard' && (
          <Dashboard
            stats={stats}
            timer={timer}
            elapsedSeconds={elapsedSeconds}
            timeline={timeline}
            tasks={tasks}
          />
        )}

        {view === 'tasks' && (
          <section className="tasks-page">
            <div className="toolbar-actions">
              <button onClick={() => {
                openTaskDialog(null)
              }}><Plus size={16} /> 新建任务</button>
              <button onClick={() => {
                setTaskName('')
                setTaskDescription('')
                setCategoryId('')
                setHabitMinutes('')
                setCreateMode('habit')
              }}><Check size={16} /> 新建习惯</button>
            </div>

            <div className="panel">
              <div className="panel-heading">
                <h2>{taskViewMode === 'recent' ? '最近计时' : taskViewMode === 'category' ? '按分类查看' : '按项目查看'}</h2>
                <div className="segmented-control">
                  <button className={taskViewMode === 'recent' ? 'active' : ''} onClick={() => setTaskViewMode('recent')}>最近计时</button>
                  <button className={taskViewMode === 'category' ? 'active' : ''} onClick={() => setTaskViewMode('category')}>按分类</button>
                  <button className={taskViewMode === 'project' ? 'active' : ''} onClick={() => setTaskViewMode('project')}>按项目</button>
                </div>
              </div>
              {taskViewMode === 'category' && (
                <div className="view-management-bar">
                  <div>
                    <strong>分类管理</strong>
                    <span>{categories.filter((category) => !category.archived).length} 个分类，可直接编辑名称与颜色</span>
                  </div>
                  <button onClick={() => {
                    setCategoryName('')
                    setCategoryColor('#3f6f68')
                    setCreateMode('category')
                  }}><Plus size={16} /> 新建分类</button>
                </div>
              )}
              {taskViewMode === 'project' && (
                <div className="view-management-bar">
                  <div>
                    <strong>项目管理</strong>
                    <span>{tasks.filter((task) => task.kind === 'project').length} 个项目，可在项目中继续添加任务</span>
                  </div>
                  <button onClick={openProjectDialog}><Folder size={16} /> 新建项目</button>
                </div>
              )}
              {taskViewMode === 'recent' ? (
                <RecentTaskList
                  tasks={(recent.length ? recent : runnableTasks).filter((task) => !task.archived)}
                  onStart={startTask}
                  onManualEntry={(task) => { setManualTaskId(task.id); setManualOpen(true) }}
                  onDetails={(task) => void openTaskDetails(task)}
                />
              ) : taskViewMode === 'category' ? (
                <CategorizedTaskList
                  tasks={tasks}
                  categories={categories}
                  onStart={startTask}
                  onManualEntry={(task) => { setManualTaskId(task.id); setManualOpen(true) }}
                  onDetails={(task) => void openTaskDetails(task)}
                  onCreateTask={openTaskDialog}
                  onUpdateCategory={updateCategory}
                  onRemoveCategory={removeCategory}
                />
              ) : (
                <ProjectTaskList
                  tasks={tasks}
                  onStart={startTask}
                  onManualEntry={(task) => { setManualTaskId(task.id); setManualOpen(true) }}
                  onDetails={(task) => void openTaskDetails(task)}
                  onCreateProjectTask={openProjectTaskDialog}
                />
              )}
            </div>
          </section>
        )}

        {view === 'timeline' && <Timeline days={timeline} onEdit={openEntryEditor} onRemove={removeEntry} />}

        {view === 'search' && (
          <section className="panel">
            <div className="search-row">
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && search()} placeholder="搜索任务、分类或日志" />
              <button onClick={search}><Search size={16} /> 搜索</button>
              <button onClick={() => run(api.settings.backupNow)}><Archive size={16} /> 立即备份</button>
              <button onClick={() => exportData('json')}><Download size={16} /> JSON</button>
              <button onClick={() => exportData('csv')}><Download size={16} /> CSV</button>
              <button onClick={() => exportData('markdown')}><Download size={16} /> Markdown</button>
            </div>
            <EntryList entries={searchResults} />
          </section>
        )}

        {view === 'habits' && (
          <HabitsPage habits={stats?.habits ?? []} />
        )}

        {view === 'archive' && (
          <ArchivePage
            tasks={tasks}
            timeline={timeline}
            onUpdateReview={(taskId, archiveReview) => run(() => api.tasks.updateTask({ id: taskId, archiveReview }), '复盘已保存')}
            onRestore={(id) => run(() => api.tasks.restore(id))}
            onRemove={confirmTaskRemoval}
          />
        )}
      </section>

      {createMode === 'category' && (
        <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && setCreateMode(null)}>
          <div className="dialog-modal compact">
            <div className="dialog-header">
              <div>
                <span className="eyebrow">新建分类</span>
                <h2>整理任务的上层分组</h2>
              </div>
              <button onClick={() => setCreateMode(null)}>关闭</button>
            </div>
            <div className="form-grid">
              <input autoFocus value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="分类名称，例如：学习、开发、生活" />
              <label className="color-field">
                <span>分类颜色</span>
                <CategoryColorPalette value={categoryColor} onChange={setCategoryColor} />
              </label>
              <button onClick={createCategory}><Plus size={16} /> 新建分类</button>
            </div>
          </div>
        </div>
      )}

      {createMode === 'project' && (
        <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && setCreateMode(null)}>
          <div className="dialog-modal">
            <div className="dialog-header">
              <div>
                <span className="eyebrow">新建项目</span>
                <h2>创建可包含子任务的项目</h2>
              </div>
              <button onClick={() => setCreateMode(null)}>关闭</button>
            </div>
            <div className="form-grid">
              <input autoFocus value={taskName} onChange={(event) => setTaskName(event.target.value)} placeholder="项目名称" />
              <textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="项目描述，可空" />
              <button onClick={createProject}><Folder size={16} /> 新建项目</button>
            </div>
          </div>
        </div>
      )}

      {createMode === 'task' && (
        <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && setCreateMode(null)}>
          <div className="dialog-modal">
            <div className="dialog-header">
              <div>
                <span className="eyebrow">新建任务</span>
                <h2>创建普通任务</h2>
              </div>
              <button onClick={() => setCreateMode(null)}>关闭</button>
            </div>
            <div className="form-grid">
              <input autoFocus value={taskName} onChange={(event) => setTaskName(event.target.value)} placeholder="任务名称" />
              <textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="任务描述，可空" />
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value ? Number(event.target.value) : '')}>
                <option value="">不选择分类</option>
                {categories.filter((category) => !category.archived).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <button onClick={createTask}><Plus size={16} /> 新建任务</button>
            </div>
          </div>
        </div>
      )}

      {createMode === 'habit' && (
        <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && setCreateMode(null)}>
          <div className="dialog-modal">
            <div className="dialog-header">
              <div>
                <span className="eyebrow">新建习惯</span>
                <h2>创建每日打卡习惯</h2>
              </div>
              <button onClick={() => setCreateMode(null)}>关闭</button>
            </div>
            <div className="form-grid">
              <input autoFocus value={taskName} onChange={(event) => setTaskName(event.target.value)} placeholder="习惯名称" />
              <textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="习惯描述，可空" />
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value ? Number(event.target.value) : '')}>
                <option value="">不选择分类</option>
                {categories.filter((category) => !category.archived).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <input value={habitMinutes} onChange={(event) => setHabitMinutes(event.target.value)} placeholder="每日目标分钟" type="number" min="1" />
              <button onClick={createHabit}><Check size={16} /> 新建习惯</button>
            </div>
          </div>
        </div>
      )}

      {createMode === 'projectTask' && projectTaskParent && (
        <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && setCreateMode(null)}>
          <div className="dialog-modal compact">
            <div className="dialog-header">
              <div>
                <span className="eyebrow">新建项目任务</span>
                <h2>{projectTaskParent.name}</h2>
              </div>
              <button onClick={() => setCreateMode(null)}>关闭</button>
            </div>
            <div className="form-grid">
              <input autoFocus value={taskName} onChange={(event) => setTaskName(event.target.value)} placeholder="项目任务名称" />
              <textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="项目任务描述，可空" />
              <input value={habitMinutes} onChange={(event) => setHabitMinutes(event.target.value)} placeholder="每日目标分钟，可空" type="number" min="1" />
              <button onClick={createProjectTask}><Plus size={16} /> 新建项目任务</button>
            </div>
          </div>
        </div>
      )}

      {manualOpen && (
        <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && setManualOpen(false)}>
          <div className="dialog-modal">
            <div className="dialog-header">
              <div>
                <span className="eyebrow">补录</span>
                <h2>手动添加专注片段</h2>
              </div>
              <button onClick={() => setManualOpen(false)}>关闭</button>
            </div>
            <div className="form-grid">
              <select value={manualTaskId ?? ''} onChange={(event) => setManualTaskId(event.target.value ? Number(event.target.value) : null)}>
                <option value="">选择任务</option>
                {runnableTasks.map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}
              </select>
              <BoundedDateTimeInput label="开始时间" value={manualStart} onChange={setManualStart} />
              <BoundedDateTimeInput label="结束时间" value={manualEnd} onChange={setManualEnd} />
              <textarea value={manualLog} onChange={(event) => setManualLog(event.target.value)} placeholder="这次补录做了什么" />
              <button onClick={manualEntry}><CalendarDays size={16} /> 保存记录</button>
            </div>
          </div>
        </div>
      )}

      {editingEntry && (
        <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && setEditingEntry(null)}>
          <div className="dialog-modal">
            <div className="dialog-header">
              <div>
                <span className="eyebrow">编辑记录</span>
                <h2>{editingEntry.taskName}</h2>
              </div>
              <button onClick={() => setEditingEntry(null)}>关闭</button>
            </div>
            <div className="form-grid">
              <input type="datetime-local" value={entryStart} onChange={(event) => setEntryStart(event.target.value)} />
              <input type="datetime-local" value={entryEnd} onChange={(event) => setEntryEnd(event.target.value)} />
              <textarea value={entryLog} onChange={(event) => setEntryLog(event.target.value)} placeholder="这次专注做了什么" />
              <button onClick={updateEntry}><Check size={16} /> 保存修改</button>
            </div>
          </div>
        </div>
      )}

      {detailTask && (
        <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && setDetailTask(null)}>
          <div className="dialog-modal task-detail-modal">
            <div className="dialog-header">
              <div>
                <span className="eyebrow">{detailEditing ? '编辑' : taskTypeLabel(detailTask)}</span>
                <h2>{detailTask.name}</h2>
              </div>
              <button onClick={() => setDetailTask(null)}>关闭</button>
            </div>
            <div className={`task-detail-fields${detailEditing ? ' editing' : ''}`}>
              {detailEditing && (
                <label>
                  <span>名称</span>
                  <input aria-label="任务名称" autoFocus value={detailName} onChange={(event) => setDetailName(event.target.value)} />
                </label>
              )}
              <label>
                <span>描述</span>
                {detailEditing ? (
                  <textarea aria-label="任务描述" value={detailDescription} onChange={(event) => setDetailDescription(event.target.value)} placeholder="暂无描述" />
                ) : (
                  <p className={`task-detail-value${detailTask.description ? '' : ' is-empty'}`}>
                    {detailTask.description || '暂无描述'}
                  </p>
                )}
              </label>
              {detailTask.kind !== 'project' && (
                <label>
                  <span>归属</span>
                  {detailEditing ? (
                    <select aria-label="任务归属" value={detailAssignment} onChange={(event) => setDetailAssignment(event.target.value)}>
                      <option value="uncategorized">未分类</option>
                      {categories.filter((category) => !category.archived || category.id === detailTask.categoryId).map((category) => (
                        <option key={`detail-category-${category.id}`} value={`category:${category.id}`}>分类：{category.name}</option>
                      ))}
                      {tasks.filter((task) => task.kind === 'project' && (!task.archived || task.id === detailTask.parentId) && task.id !== detailTask.id).map((project) => (
                        <option key={`detail-project-${project.id}`} value={`project:${project.id}`}>项目：{project.name}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="task-detail-value">
                      {detailTask.parentId !== null
                        ? `项目 · ${tasks.find((task) => task.id === detailTask.parentId)?.name ?? '未知项目'}`
                        : detailTask.categoryId !== null
                          ? `分类 · ${categories.find((category) => category.id === detailTask.categoryId)?.name ?? '未知分类'}`
                          : '未分类'}
                    </p>
                  )}
                </label>
              )}
            </div>
            <div className="task-detail-summary">
              <strong>{formatDuration(detailTask.totalSeconds)}</strong>
              <span>{detailEntries.length} 条历史记录</span>
            </div>
            <div className="task-detail-records">
              <div className="panel-heading">
                <h3>最近记录</h3>
                <span>{detailEntries.length} 条</span>
              </div>
              <EntryList entries={detailEntries} visibleLimit={3} showTaskName={detailTask.kind === 'project'} />
            </div>
            <div className="task-detail-footer">
              {detailEditing ? (
                <>
                  <button onClick={() => {
                    setDetailName(detailTask.name)
                    setDetailDescription(detailTask.description ?? '')
                    setDetailAssignment(detailTask.parentId !== null
                      ? `project:${detailTask.parentId}`
                      : detailTask.categoryId !== null
                        ? `category:${detailTask.categoryId}`
                        : 'uncategorized')
                    setDetailEditing(false)
                  }}>取消</button>
                  <button onClick={saveTaskDetails}><Check size={16} /> 保存修改</button>
                </>
              ) : (
                <button onClick={() => setDetailEditing(true)}><Pencil size={16} /> 编辑</button>
              )}
              {detailTask.archived ? (
                <button title="恢复" onClick={async () => {
                  const restored = await run(() => api.tasks.restore(detailTask.id))
                  if (restored) setDetailTask({ ...detailTask, archived: false })
                }}><RotateCcw size={16} /> 恢复</button>
              ) : (
                <button title="归档" onClick={async () => {
                  const archived = await run(() => api.tasks.archive(detailTask.id))
                  if (archived) setDetailTask({ ...detailTask, archived: true })
                }}><Archive size={16} /> 归档</button>
              )}
              <button className="danger-button" title="删除" onClick={() => confirmTaskRemoval(detailTask)}><Trash2 size={16} /> 删除</button>
            </div>
          </div>
        </div>
      )}

      {renderOverlays()}
    </main>
  )
}

type TaskDashboardItem = {
  id: number
  name: string
  label: string
  totalSeconds: number
  entryCount: number
  lastWorkedAt: string
  dailySeconds: Map<string, number>
  entries: TimeEntry[]
}

function Dashboard({ stats, timer, elapsedSeconds, timeline, tasks }: {
  stats: DashboardStats | null
  timer: TimerSession | null
  elapsedSeconds: number
  timeline: TimelineDay[]
  tasks: Task[]
}) {
  const [dashboardMode, setDashboardMode] = useState<'time' | 'task'>('time')
  const [heatmapRange, setHeatmapRange] = useState<'month' | 'year'>('month')
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const trend = (stats?.trend ?? []).map((point) => ({ ...point, hours: Number((point.seconds / 3600).toFixed(1)) }))
  const heatmapPoints = heatmapRange === 'month' ? (stats?.heatmap ?? []).slice(-31) : (stats?.heatmap ?? [])
  const today = timeline.find((day) => day.date === dateKey(new Date()))
  const taskDashboard = useMemo(() => {
    const taskById = new Map(tasks.map((task) => [task.id, task]))
    const projectById = new Map(tasks.filter((task) => task.kind === 'project').map((task) => [task.id, task]))
    const items = new Map<number, TaskDashboardItem>()
    const activeDates = new Set<string>()

    for (const day of timeline) {
      for (const entry of day.entries) {
        const task = taskById.get(entry.taskId)
        const project = task?.parentId ? projectById.get(task.parentId) : null
        if (task?.archived || project?.archived) continue
        activeDates.add(dateKey(entry.startedAt))
        const current = items.get(entry.taskId) ?? {
          id: entry.taskId,
          name: task?.name ?? entry.taskName,
          label: task?.kind === 'project'
            ? '项目'
            : task?.kind === 'project_task'
              ? `项目：${project?.name ?? '未归属项目'}`
              : entry.categoryName ?? '未分类',
          totalSeconds: 0,
          entryCount: 0,
          lastWorkedAt: entry.startedAt,
          dailySeconds: new Map<string, number>(),
          entries: [],
        }
        const entryDay = dateKey(entry.startedAt)
        current.totalSeconds += entry.durationSeconds
        current.entryCount += 1
        current.lastWorkedAt = Date.parse(entry.startedAt) > Date.parse(current.lastWorkedAt) ? entry.startedAt : current.lastWorkedAt
        current.dailySeconds.set(entryDay, (current.dailySeconds.get(entryDay) ?? 0) + entry.durationSeconds)
        current.entries.push(entry)
        items.set(entry.taskId, current)
      }
    }

    const taskItems = [...items.values()].sort((a, b) => b.totalSeconds - a.totalSeconds)
    const totalSeconds = taskItems.reduce((sum, item) => sum + item.totalSeconds, 0)
    const recentTask = [...taskItems].sort((a, b) => Date.parse(b.lastWorkedAt) - Date.parse(a.lastWorkedAt))[0]
    return {
      taskItems,
      totalSeconds,
      recentTaskName: recentTask?.name ?? '暂无',
      averageDailySeconds: activeDates.size > 0 ? Math.round(totalSeconds / activeDates.size) : 0,
    }
  }, [tasks, timeline])

  const selectedTask = taskDashboard.taskItems.find((item) => item.id === selectedTaskId) ?? taskDashboard.taskItems[0]
  const selectedDailyTrend = useMemo(() => {
    const start = addDays(new Date(), -29)
    return Array.from({ length: 30 }, (_, index) => {
      const key = dateKey(addDays(start, index))
      return {
        date: key.slice(5),
        seconds: selectedTask?.dailySeconds.get(key) ?? 0,
      }
    })
  }, [selectedTask])

  return (
    <section className="dashboard">
      <div className="dashboard-switch">
        <div>
          <span className="eyebrow">仪表盘视图</span>
          <h2>{dashboardMode === 'time' ? '按时间' : '按任务'}</h2>
        </div>
        <div className="segmented-control" aria-label="切换仪表盘视图">
          <button className={dashboardMode === 'time' ? 'active' : ''} onClick={() => setDashboardMode('time')}>按时间</button>
          <button className={dashboardMode === 'task' ? 'active' : ''} onClick={() => setDashboardMode('task')}>按任务</button>
        </div>
      </div>

      {dashboardMode === 'time' ? (
        <>
          <div className="metric-row today-metrics">
            <Metric label="今日" value={formatDuration(stats?.todaySeconds ?? 0)} />
            <Metric label={timer ? timer.taskName : '当前任务'} value={timer ? formatClock(elapsedSeconds) : '未开始'} />
          </div>
          <TodayRecords day={today} />
          <div className="metric-row period-metrics">
            <Metric label="本周" value={formatDuration(stats?.weekSeconds ?? 0)} />
            <Metric label="本月" value={formatDuration(stats?.monthSeconds ?? 0)} />
          </div>
          <div className="dashboard-lower">
            <div className="panel chart-panel">
              <h2>本周趋势</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trend}>
                  <CartesianGrid vertical={false} stroke="#d7e8ed" />
                  <XAxis dataKey="date" tick={{ fill: '#63808c', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#63808c', fontSize: 12 }} />
                  <Tooltip formatter={(value) => [`${value}h`, '专注']} />
                  <Bar dataKey="hours" fill="#3ba7c9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="panel heatmap-panel">
              <div className="panel-heading">
                <h2>{heatmapRange === 'month' ? '月度热力图' : '年度热力图'}</h2>
                <div className="segmented-control" aria-label="切换热力图范围">
                  <button className={heatmapRange === 'month' ? 'active' : ''} onClick={() => setHeatmapRange('month')}>月</button>
                  <button className={heatmapRange === 'year' ? 'active' : ''} onClick={() => setHeatmapRange('year')}>年</button>
                </div>
              </div>
              <div className={heatmapRange === 'month' ? 'heatmap month' : 'heatmap year'}>
                {heatmapPoints.map((point) => <i key={point.date} title={`${point.date} ${formatDuration(point.seconds)}`} data-level={heatLevel(point.seconds)} />)}
              </div>
            </div>
          </div>
        </>
      ) : taskDashboard.taskItems.length === 0 ? (
        <Empty text="还没有任务专注记录" />
      ) : (
        <>
          <div className="metric-row task-dashboard-metrics">
            <Metric label="任务数" value={`${taskDashboard.taskItems.length}`} />
            <Metric label="总专注时长" value={formatDuration(taskDashboard.totalSeconds)} />
            <Metric label="最近有记录的任务" value={taskDashboard.recentTaskName} />
            <Metric label="平均每日投入" value={formatDuration(taskDashboard.averageDailySeconds)} />
          </div>
          <div className="task-dashboard-layout">
            <div className="panel task-rank-panel">
              <div className="panel-heading">
                <h2>任务排行</h2>
                <span>{taskDashboard.taskItems.length} 项</span>
              </div>
              <div className="task-rank-list">
                {taskDashboard.taskItems.map((item) => (
                  <button
                    key={item.id}
                    className={selectedTask?.id === item.id ? 'task-rank-item active' : 'task-rank-item'}
                    onClick={() => setSelectedTaskId(item.id)}
                  >
                    <span className="task-rank-main">
                      <strong>{item.name}</strong>
                      <small>{item.label}</small>
                    </span>
                    <span className="task-rank-time">
                      <strong>{formatDuration(item.totalSeconds)}</strong>
                      <small>{formatDate(item.lastWorkedAt)}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {selectedTask && (
              <div className="panel task-detail-panel">
                <div className="task-detail-header">
                  <div>
                    <span className="eyebrow">{selectedTask.label}</span>
                    <h2>{selectedTask.name}</h2>
                  </div>
                  <strong>{formatDuration(selectedTask.totalSeconds)}</strong>
                </div>
                <div className="task-detail-stats">
                  <Metric label="累计时长" value={formatDuration(selectedTask.totalSeconds)} />
                  <Metric label="记录次数" value={`${selectedTask.entryCount}`} />
                  <Metric label="平均单次" value={formatDuration(Math.round(selectedTask.totalSeconds / selectedTask.entryCount))} />
                  <Metric label="最近专注日期" value={formatDate(selectedTask.lastWorkedAt)} />
                </div>
                <div className="task-detail-chart">
                  <h3>最近 30 天</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={selectedDailyTrend}>
                      <CartesianGrid vertical={false} stroke="#d7e8ed" />
                      <XAxis dataKey="date" tick={{ fill: '#63808c', fontSize: 12 }} interval={4} />
                      <YAxis tick={{ fill: '#63808c', fontSize: 12 }} tickFormatter={(value) => formatDuration(Number(value))} />
                      <Tooltip formatter={(value) => [formatDuration(Number(value)), '专注']} />
                      <Bar dataKey="seconds" fill="#2f9c95" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="task-detail-records">
                  <div className="panel-heading">
                    <h3>专注记录</h3>
                    <span>{selectedTask.entries.length} 条</span>
                  </div>
                  <EntryList entries={[...selectedTask.entries].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))} visibleLimit={5} />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString()
}

const PIE_COLORS = ['#2f9c95', '#3ba7c9', '#f5c968', '#ee7f6d', '#7397c7', '#8abf8f']

function TodayRecords({ day }: { day?: TimelineDay }) {
  const distribution = useMemo(() => {
    const tasks = new Map<number, { name: string; value: number }>()
    for (const entry of day?.entries ?? []) {
      const current = tasks.get(entry.taskId) ?? { name: entry.taskName, value: 0 }
      current.value += entry.durationSeconds
      tasks.set(entry.taskId, current)
    }
    return [...tasks.values()].sort((a, b) => b.value - a.value)
  }, [day])

  return (
    <section className="panel today-records">
      <div className="panel-heading">
        <h2>今日记录</h2>
        <span>{day ? `${day.entries.length} 条 · ${formatDuration(day.totalSeconds)}` : '暂无记录'}</span>
      </div>
      {!day || distribution.length === 0 ? (
        <Empty text="今天还没有专注记录。" />
      ) : (
        <div className="today-records-content">
          <div className="today-chart">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={distribution} dataKey="value" nameKey="name" innerRadius={54} outerRadius={88} paddingAngle={2}>
                  {distribution.map((item, index) => <Cell key={item.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => [formatDuration(Number(value)), '专注']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="today-chart-legend">
              {distribution.map((item, index) => (
                <div key={item.name}>
                  <i style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} />
                  <span>{item.name}</span>
                  <strong>{formatDuration(item.value)}</strong>
                </div>
              ))}
            </div>
          </div>
          <EntryList entries={day.entries} />
        </div>
      )}
    </section>
  )
}

function HabitsPage({ habits }: { habits: DashboardStats['habits'] }) {
  const completed = habits.filter((habit) => habit.completedToday).length
  const todaySeconds = habits.reduce((total, habit) => total + habit.todaySeconds, 0)
  const longestStreak = habits.reduce((longest, habit) => Math.max(longest, habit.streakDays), 0)
  const orderedHabits = [...habits].sort((a, b) => Number(a.completedToday) - Number(b.completedToday))

  return (
    <section className="habits-page">
      <div className="habit-summary">
        <HabitSummary icon={<Target size={18} />} label="习惯总数" value={`${habits.length}`} />
        <HabitSummary icon={<Check size={18} />} label="今日完成" value={`${completed} / ${habits.length}`} />
        <HabitSummary icon={<Flame size={18} />} label="今日投入" value={formatDuration(todaySeconds)} />
        <HabitSummary icon={<Trophy size={18} />} label="最长连续" value={`${longestStreak} 天`} />
      </div>
      <div className="habit-section-heading">
        <div>
          <span className="eyebrow">今日进度</span>
          <h2>{completed === habits.length && habits.length > 0 ? '今天的习惯已全部完成' : '继续完成今天的习惯'}</h2>
        </div>
        {habits.length > 0 && <strong>{Math.round((completed / habits.length) * 100)}%</strong>}
      </div>
      <div className="habit-grid">
        {orderedHabits.map((habit) => {
          const targetSeconds = habit.targetMinutes * 60
          const percentage = Math.min(100, Math.round((habit.todaySeconds / targetSeconds) * 100))
          const remainingSeconds = Math.max(0, targetSeconds - habit.todaySeconds)
          return (
            <article className={habit.completedToday ? 'habit-card completed' : 'habit-card'} key={habit.taskId}>
              <div className="habit-card-header">
                <div>
                  <span className="habit-status">{habit.completedToday ? '今日已达标' : '进行中'}</span>
                  <h2>{habit.taskName}</h2>
                </div>
                <strong>{percentage}%</strong>
              </div>
              <div
                className="progress"
                role="progressbar"
                aria-label={`${habit.taskName} 今日进度`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percentage}
              >
                <i style={{ width: `${percentage}%` }} />
              </div>
              <div className="habit-details">
                <div><span>今日</span><strong>{formatDuration(habit.todaySeconds)}</strong></div>
                <div><span>目标</span><strong>{habit.targetMinutes}m</strong></div>
                <div><span>连续</span><strong>{habit.streakDays} 天</strong></div>
              </div>
              <p className="habit-note">{habit.completedToday ? '今日目标已完成' : `还需 ${formatDuration(remainingSeconds)}`}</p>
            </article>
          )
        })}
        {habits.length === 0 && <Empty text="还没有开启习惯模式的任务。" />}
      </div>
    </section>
  )
}

function HabitSummary({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="habit-summary-item">
      <span>{icon}</span>
      <div><small>{label}</small><strong>{value}</strong></div>
    </div>
  )
}

function RecentTaskList({ tasks, onStart, onManualEntry, onDetails }: {
  tasks: Task[]
  onStart: (taskId: number) => void
  onManualEntry: (task: Task) => void
  onDetails: (task: Task) => void
}) {
  if (tasks.length === 0) return <Empty text="还没有最近计时任务。" />
  return (
    <div className="task-list">
      {tasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          onStart={onStart}
          onManualEntry={onManualEntry}
          onDetails={onDetails}
        />
      ))}
    </div>
  )
}

function CategorizedTaskList({ tasks, categories, onStart, onManualEntry, onDetails, onCreateTask, onUpdateCategory, onRemoveCategory }: {
  tasks: Task[]
  categories: Category[]
  onStart: (taskId: number) => void
  onManualEntry: (task: Task) => void
  onDetails: (task: Task) => void
  onCreateTask: (categoryId: number | null) => void
  onUpdateCategory: (category: Category, name: string, color: string) => Promise<boolean>
  onRemoveCategory: (category: Category) => void
}) {
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingColor, setEditingColor] = useState('#3f6f68')
  const visibleCategories = categories.filter((category) => !category.archived)
  const categoryTasks = tasks.filter((task) => task.kind === 'task' && task.parentId === null && !task.archived)
  const groups = [
    ...visibleCategories.map((category) => ({
      id: `category-${category.id}`,
      name: category.name,
      category,
      tasks: categoryTasks.filter((task) => task.categoryId === category.id),
    })),
    {
      id: 'uncategorized',
      name: '未分类',
      category: null,
      tasks: categoryTasks.filter((task) => task.categoryId === null),
    },
  ].filter((group) => group.category || group.tasks.length > 0)

  if (groups.length === 0) return <Empty text="还没有分类或普通任务。" />

  function beginEditing(category: Category) {
    setEditingCategoryId(category.id)
    setEditingName(category.name)
    setEditingColor(category.color)
  }

  async function saveCategory(category: Category) {
    const updated = await onUpdateCategory(category, editingName, editingColor)
    if (updated) setEditingCategoryId(null)
  }

  return (
    <div className="category-task-list">
      {groups.map((group) => {
        const isEditing = group.category?.id === editingCategoryId
        return (
          <section className="task-category" key={group.id}>
            <header>
              {isEditing && group.category ? (
                <div className="category-editor">
                  <input aria-label="分类名称" autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} />
                  <CategoryColorPalette value={editingColor} onChange={setEditingColor} />
                  <button title="保存分类" onClick={() => saveCategory(group.category!)}><Check size={16} /> 保存</button>
                  <button title="取消编辑" onClick={() => setEditingCategoryId(null)}><X size={16} /></button>
                </div>
              ) : (
                <div className="category-heading">
                  <span className="category-color" style={group.category ? { background: group.category.color } : undefined} />
                  <h3>{group.name}</h3>
                  <span>{group.tasks.length} 项</span>
                </div>
              )}
              {!isEditing && (
                <div className="category-actions">
                  <button title={`在 ${group.name} 中新建任务`} onClick={() => onCreateTask(group.category?.id ?? null)}><Plus size={15} /> 新建任务</button>
                  {group.category && (
                    <>
                      <button title={`编辑分类 ${group.category.name}`} onClick={() => beginEditing(group.category!)}><Pencil size={15} /> 编辑</button>
                      <button className="category-delete-button" title={`删除分类 ${group.category.name}`} onClick={() => onRemoveCategory(group.category!)}>
                        <Trash2 size={15} /> 删除
                      </button>
                    </>
                  )}
                </div>
              )}
            </header>
            {group.tasks.length === 0 ? (
              <p className="category-empty">此分类下还没有任务</p>
            ) : (
              <div className="task-list">
                {group.tasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onStart={onStart}
                    onManualEntry={onManualEntry}
                    onDetails={onDetails}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function ProjectTaskList({ tasks, onStart, onManualEntry, onDetails, onCreateProjectTask }: {
  tasks: Task[]
  onStart: (taskId: number) => void
  onManualEntry: (task: Task) => void
  onDetails: (task: Task) => void
  onCreateProjectTask: (project: Task) => void
}) {
  const visibleTasks = tasks.filter((task) => !task.archived)
  const projects = visibleTasks.filter((task) => task.kind === 'project')

  if (projects.length === 0) return <Empty text="还没有项目。点击上方“新建项目”开始创建。" />

  return (
    <div className="project-overview">
      {projects.map((project) => (
        <ProjectBlock
          key={project.id}
          project={project}
          tasks={visibleTasks.filter((task) => task.parentId === project.id)}
          onStart={onStart}
          onManualEntry={onManualEntry}
          onDetails={onDetails}
          onCreateProjectTask={onCreateProjectTask}
        />
      ))}
    </div>
  )
}

function ProjectBlock({ project, tasks, onStart, onManualEntry, onDetails, onCreateProjectTask }: {
  project: Task
  tasks: Task[]
  onStart: (taskId: number) => void
  onManualEntry: (task: Task) => void
  onDetails: (task: Task) => void
  onCreateProjectTask: (project: Task) => void
}) {
  return (
    <article className={project.archived ? 'project-block archived' : 'project-block'}>
      <div className="project-header">
        <div>
          <span>项目</span>
          <h3>{project.name}</h3>
          <p>{formatDuration(project.totalSeconds)} · {tasks.length} 个项目任务</p>
        </div>
        <div className="item-actions">
          <button title="新建项目任务" onClick={() => onCreateProjectTask(project)}><Plus size={16} /></button>
          <button title="查看详情" onClick={() => onDetails(project)}><Eye size={16} /></button>
        </div>
      </div>
      <div className="project-task-list">
        {tasks.length === 0 ? (
          <p className="project-empty">还没有项目任务。</p>
        ) : (
          tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              nested
              onStart={onStart}
              onManualEntry={onManualEntry}
              onDetails={onDetails}
            />
          ))
        )}
      </div>
    </article>
  )
}

function TaskItem({ task, nested = false, onStart, onManualEntry, onDetails }: {
  task: Task
  nested?: boolean
  onStart: (taskId: number) => void
  onManualEntry: (task: Task) => void
  onDetails: (task: Task) => void
}) {
  return (
    <article className={`${task.archived ? 'task-item archived' : 'task-item'}${nested ? ' nested' : ''}`}>
      <div>
        <span>{task.kind === 'project' ? '项目' : task.kind === 'project_task' ? '项目任务' : task.habitTargetMinutes ? '习惯' : '任务'}</span>
        <h3>{task.name}</h3>
        <p>{formatDuration(task.totalSeconds)}{task.habitTargetMinutes ? ` · 每日 ${task.habitTargetMinutes}m` : ''}</p>
      </div>
      <div className="item-actions">
        {task.kind !== 'project' && <button title="开始" onClick={() => onStart(task.id)}><Play size={16} /></button>}
        {task.kind !== 'project' && <button title="补录" onClick={() => onManualEntry(task)}><CalendarDays size={16} /></button>}
        <button title="查看详情" onClick={() => onDetails(task)}><Eye size={16} /></button>
      </div>
    </article>
  )
}

type ArchiveAchievement = {
  task: Task
  entries: TimeEntry[]
  totalSeconds: number
  activeDays: number
  averageDailySeconds: number
  startedAt: string | null
  endedAt: string | null
  dailyTrend: { date: string; seconds: number }[]
  recentLogs: TimeEntry[]
}

function ArchivePage({ tasks, timeline, onUpdateReview, onRestore, onRemove }: {
  tasks: Task[]
  timeline: TimelineDay[]
  onUpdateReview: (taskId: number, archiveReview: string) => Promise<boolean>
  onRestore: (id: number) => void
  onRemove: (task: Task) => void
}) {
  const [selectedArchivedTaskId, setSelectedArchivedTaskId] = useState<number | null>(null)
  const [reviewDraft, setReviewDraft] = useState('')
  const archivedTasks = useMemo(() => (
    tasks
      .filter((task) => task.archived)
      .sort((a, b) => Date.parse(b.updatedAt || b.lastWorkedAt || b.createdAt) - Date.parse(a.updatedAt || a.lastWorkedAt || a.createdAt))
  ), [tasks])
  const achievements = useMemo(() => {
    const allEntries = timeline.flatMap((day) => day.entries)
    return archivedTasks.map((task): ArchiveAchievement => {
      const taskIds = new Set([task.id])
      if (task.kind === 'project') {
        for (const child of tasks) {
          if (child.parentId === task.id) taskIds.add(child.id)
        }
      }
      const entries = allEntries
        .filter((entry) => taskIds.has(entry.taskId))
        .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
      const totalSeconds = entries.reduce((sum, entry) => sum + entry.durationSeconds, 0)
      const activeDays = new Set(entries.map((entry) => dateKey(entry.startedAt))).size
      const startedAt = entries[0]?.startedAt ?? null
      const endedAt = [...entries].sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt))[0]?.endedAt ?? null
      const recentLogs = [...entries]
        .filter((entry) => entry.log.trim())
        .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
        .slice(0, 3)
      return {
        task,
        entries,
        totalSeconds,
        activeDays,
        averageDailySeconds: activeDays > 0 ? Math.round(totalSeconds / activeDays) : 0,
        startedAt,
        endedAt,
        dailyTrend: buildArchiveDailyTrend(entries, startedAt, endedAt),
        recentLogs,
      }
    })
  }, [archivedTasks, tasks, timeline])
  const selectedAchievement = achievements.find((item) => item.task.id === selectedArchivedTaskId) ?? null

  async function saveReview() {
    if (!selectedAchievement) return
    await onUpdateReview(selectedAchievement.task.id, reviewDraft)
  }

  if (archivedTasks.length === 0) {
    return (
      <section className="archive-page">
        <div className="archive-hero empty-archive">
          <div>
            <span className="eyebrow">完成陈列室</span>
            <h2>还没有归档任务</h2>
            <p>完成一个阶段后，把任务归档到这里，它会变成你的成果陈列。</p>
          </div>
          <Archive size={42} />
        </div>
      </section>
    )
  }

  if (selectedAchievement) {
    return (
      <section className="archive-page">
        <div className="archive-detail-topbar">
          <button onClick={() => setSelectedArchivedTaskId(null)}><ChevronUp size={16} /> 返回归档列表</button>
          <div className="item-actions">
            <button title="恢复" onClick={() => onRestore(selectedAchievement.task.id)}><RotateCcw size={16} /></button>
            <button title="删除" onClick={() => onRemove(selectedAchievement.task)}><Trash2 size={16} /></button>
          </div>
        </div>

        <article className="archive-detail-page">
          <header className="archive-detail-hero">
            <div>
              <span className="eyebrow">{taskTypeLabel(selectedAchievement.task)}</span>
              <h2>{selectedAchievement.task.name}</h2>
              <p>这段工作的投入和记录都收在这里，适合回顾节奏，也适合留下以后会用到的经验。</p>
            </div>
            <strong>{selectedAchievement.totalSeconds > 0 ? formatDuration(selectedAchievement.totalSeconds) : '暂无记录'}</strong>
          </header>

          <div className="archive-achievement-stats">
            <Metric label="开始" value={selectedAchievement.startedAt ? formatDate(selectedAchievement.startedAt) : '暂无记录'} />
            <Metric label="结束" value={selectedAchievement.endedAt ? formatDate(selectedAchievement.endedAt) : '暂无记录'} />
            <Metric label="实际投入日均" value={selectedAchievement.activeDays > 0 ? formatDuration(selectedAchievement.averageDailySeconds) : '暂无记录'} />
            <Metric label="记录次数" value={`${selectedAchievement.entries.length}`} />
          </div>

          <div className="archive-detail-grid">
            <section className="panel archive-chart-panel">
              <div className="panel-heading">
                <h3>过程投入</h3>
                <span>{selectedAchievement.activeDays} 个投入日</span>
              </div>
              {selectedAchievement.dailyTrend.length === 0 ? (
                <Empty text="还没有专注记录。" />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={selectedAchievement.dailyTrend}>
                    <CartesianGrid vertical={false} stroke="#d7e8ed" />
                    <XAxis dataKey="date" tick={{ fill: '#63808c', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#63808c', fontSize: 12 }} tickFormatter={(value) => formatDuration(Number(value))} />
                    <Tooltip formatter={(value) => [formatDuration(Number(value)), '投入']} />
                    <Bar dataKey="seconds" fill="#2f9c95" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </section>

            <section className="panel archive-review-panel">
              <div className="panel-heading">
                <h3>完成复盘</h3>
                <span>归档于 {formatDate(selectedAchievement.task.updatedAt)}</span>
              </div>
              <textarea
                value={reviewDraft}
                onChange={(event) => setReviewDraft(event.target.value)}
                placeholder="写下这个任务完成后的想法、经验或下次可以改进的地方。"
              />
              <button onClick={saveReview}><Check size={16} /> 保存复盘</button>
            </section>
          </div>

          <section className="panel archive-record-panel">
            <div className="panel-heading">
              <h3>最近记录</h3>
              <span>{selectedAchievement.entries.length} 条</span>
            </div>
            <EntryList entries={[...selectedAchievement.entries].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))} visibleLimit={5} />
          </section>
        </article>
      </section>
    )
  }

  return (
    <section className="archive-page">
      <div className="archive-hero">
        <div>
          <span className="eyebrow">完成陈列室</span>
          <h2>归档任务</h2>
          <p>已经完成的任务会留在这里，之后回看投入、记录和复盘都更轻松。</p>
        </div>
        <Archive size={42} />
      </div>

      <div className="archive-list">
        {achievements.map((achievement) => (
          <article className="archive-list-item" key={achievement.task.id}>
            <div className="archive-list-main">
              <span>{taskTypeLabel(achievement.task)}</span>
              <div>
                <h3>{achievement.task.name}</h3>
                <p>归档于 {formatDate(achievement.task.updatedAt)} · {achievement.totalSeconds > 0 ? formatDuration(achievement.totalSeconds) : '暂无记录'}</p>
              </div>
            </div>
            <div className="item-actions">
              <button className="archive-view-button" onClick={() => {
                setReviewDraft(achievement.task.archiveReview)
                setSelectedArchivedTaskId(achievement.task.id)
              }}><Eye size={15} /> 查看</button>
              <button title="恢复" onClick={() => onRestore(achievement.task.id)}><RotateCcw size={16} /></button>
              <button title="删除" onClick={() => onRemove(achievement.task)}><Trash2 size={16} /></button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function buildArchiveDailyTrend(entries: TimeEntry[], startedAt: string | null, endedAt: string | null): { date: string; seconds: number }[] {
  if (!startedAt || !endedAt) return []
  const buckets = new Map<string, number>()
  for (const entry of entries) {
    const key = dateKey(entry.startedAt)
    buckets.set(key, (buckets.get(key) ?? 0) + entry.durationSeconds)
  }
  const start = new Date(startedAt)
  const end = new Date(endedAt)
  const days = Math.max(1, Math.floor((Date.parse(dateKey(end)) - Date.parse(dateKey(start))) / 86_400_000) + 1)
  return Array.from({ length: days }, (_, index) => {
    const key = dateKey(addDays(start, index))
    return {
      date: key.slice(5),
      seconds: buckets.get(key) ?? 0,
    }
  })
}

function taskTypeLabel(task: Task): string {
  if (task.kind === 'project') return '项目'
  if (task.kind === 'project_task') return '项目任务'
  if (task.habitTargetMinutes) return '习惯'
  return '任务'
}

function Timeline({ days, compact = false, onEdit, onRemove }: {
  days: TimelineDay[]
  compact?: boolean
  onEdit?: (entry: TimeEntry) => void
  onRemove?: (entry: TimeEntry) => void
}) {
  const [selectedDate, setSelectedDate] = useState('')
  const visibleDays = selectedDate ? days.filter((day) => day.date === selectedDate) : days

  if (days.length === 0) return <Empty text="还没有专注记录。" />
  return (
    <section className={compact ? 'timeline compact' : 'timeline'}>
      {!compact && (
        <div className="timeline-filter panel">
          <div>
            <span className="eyebrow">日期筛选</span>
            <h2>{selectedDate || '全部时间线'}</h2>
          </div>
          <div className="timeline-filter-controls">
            <label>
              <CalendarDays size={16} />
              <input
                aria-label="选择时间线日期"
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
            </label>
            <button disabled={!selectedDate} onClick={() => setSelectedDate('')}>
              <X size={16} />
              全部
            </button>
          </div>
        </div>
      )}
      {visibleDays.length === 0 ? (
        <Empty text="这一天还没有专注记录。" />
      ) : visibleDays.map((day) => (
        <div className="panel" key={day.date}>
          <div className="timeline-day-heading">
            <div>
              <h2>{day.date}</h2>
            </div>
            <strong>{formatDuration(day.totalSeconds)}</strong>
          </div>
          <EntryList entries={day.entries} onEdit={onEdit} onRemove={onRemove} variant="timeline" />
        </div>
      ))}
    </section>
  )
}

function EntryList({ entries, onEdit, onRemove, visibleLimit, variant = 'default', showTaskName = true }: {
  entries: TimeEntry[]
  onEdit?: (entry: TimeEntry) => void
  onRemove?: (entry: TimeEntry) => void
  visibleLimit?: number
  variant?: 'default' | 'timeline'
  showTaskName?: boolean
}) {
  const [showAllEntries, setShowAllEntries] = useState(false)

  if (entries.length === 0) return <Empty text="没有匹配记录。" />
  const canToggleEntries = variant !== 'timeline' && visibleLimit !== undefined && entries.length > visibleLimit
  const visibleEntries = canToggleEntries && !showAllEntries ? entries.slice(0, visibleLimit) : entries
  return (
    <div className={variant === 'timeline' ? 'entry-list timeline-entry-list' : 'entry-list'}>
      {visibleEntries.map((entry) => {
        const meta = [
          entry.categoryName,
          entry.isManual ? '补录' : null,
        ].filter(Boolean)
        if (variant === 'timeline') {
          return (
            <article className="entry-item timeline-entry-item" key={entry.id}>
              <div className="entry-time-rail" aria-label={`${formatTime(entry.startedAt)} 到 ${formatTime(entry.endedAt)}`}>
                <strong>{formatTime(entry.startedAt)}</strong>
                <span>{formatTime(entry.endedAt)}</span>
                <small>{formatDuration(entry.durationSeconds)}</small>
              </div>
              <div className="entry-timeline-card">
                <div className="entry-timeline-main">
                  <div>
                    <strong>{entry.taskName}</strong>
                    <span>{formatTime(entry.startedAt)}-{formatTime(entry.endedAt)}{meta.length ? ` · ${meta.join(' · ')}` : ''}</span>
                  </div>
                  {(onEdit || onRemove) && (
                    <div className="entry-actions">
                      {onEdit && <button title="编辑记录" onClick={() => onEdit(entry)}><Pencil size={16} /></button>}
                      {onRemove && <button title="删除记录" onClick={() => onRemove(entry)}><Trash2 size={16} /></button>}
                    </div>
                  )}
                </div>
                {entry.log && <p>{entry.log}</p>}
              </div>
            </article>
          )
        }
        return (
          <article className={`entry-item${onEdit || onRemove ? ' has-actions' : ''}${entry.log ? ' has-description' : ''}`} key={entry.id}>
            <div className="entry-main">
              {showTaskName && <strong>{entry.taskName}</strong>}
              <span>{formatTime(entry.startedAt)}-{formatTime(entry.endedAt)} · {formatDuration(entry.durationSeconds)}{entry.isManual ? ' · 补录' : ''}</span>
            </div>
            {(onEdit || onRemove) && (
              <div className="entry-actions">
                {onEdit && <button title="编辑记录" onClick={() => onEdit(entry)}><Pencil size={16} /></button>}
                {onRemove && <button title="删除记录" onClick={() => onRemove(entry)}><Trash2 size={16} /></button>}
              </div>
            )}
            {entry.log && <p className="entry-description">{entry.log}</p>}
          </article>
        )
      })}
      {canToggleEntries && (
        <button
          className="entry-list-toggle"
          aria-expanded={showAllEntries}
          onClick={() => setShowAllEntries((current) => !current)}
        >
          {showAllEntries ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {showAllEntries ? '收起记录' : `展开全部 ${entries.length} 条记录`}
        </button>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={active ? 'active' : ''} onClick={onClick}>{icon}{label}</button>
}

function Empty({ text }: { text: string }) {
  return <p className="empty">{text}</p>
}

function titleFor(view: View): string {
  return {
    dashboard: '仪表盘',
    tasks: '任务',
    timeline: '时间线',
    search: '搜索与导出',
    habits: '习惯',
    archive: '归档',
  }[view]
}

function heatLevel(seconds: number): number {
  if (seconds >= 4 * 3600) return 4
  if (seconds >= 2 * 3600) return 3
  if (seconds >= 30 * 60) return 2
  if (seconds > 0) return 1
  return 0
}

export default App

