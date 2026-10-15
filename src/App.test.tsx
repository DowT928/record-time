// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { beforeEach, expect, it, vi } from 'vitest'
import type { FocusJournalApi, Task, TimerSession } from '../shared/types'

const emptyStats = {
  todaySeconds: 0,
  weekSeconds: 0,
  monthSeconds: 0,
  trend: [],
  heatmap: [],
  habits: [],
}

window.focusJournal = {
  tasks: {
    list: vi.fn().mockResolvedValue({ categories: [], tasks: [] }),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    removeCategory: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    remove: vi.fn(),
    recent: vi.fn().mockResolvedValue([]),
  },
  timer: {
    getCurrent: vi.fn().mockResolvedValue(null),
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    end: vi.fn(),
    manualEntry: vi.fn(),
  },
  logs: {
    timeline: vi.fn().mockResolvedValue([]),
    search: vi.fn(),
    byTask: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
  stats: {
    dashboard: vi.fn().mockResolvedValue(emptyStats),
  },
  settings: {
    get: vi.fn(),
    update: vi.fn(),
    backupNow: vi.fn(),
    exportData: vi.fn(),
  },
  window: {
    setMode: vi.fn().mockResolvedValue(undefined),
    onModeChanged: vi.fn().mockReturnValue(() => undefined),
    onTimerChanged: vi.fn().mockReturnValue(() => undefined),
  },
} as FocusJournalApi

const { default: App } = await import('./App')

const focusTask: Task = {
  id: 91,
  categoryId: null,
  parentId: null,
  name: 'Write release notes',
  kind: 'task',
  color: '#3f6f68',
  archived: false,
  archiveReview: '',
  habitTargetMinutes: null,
  totalSeconds: 1800,
  lastWorkedAt: null,
  createdAt: '2026-06-30T00:00:00.000Z',
  updatedAt: '2026-06-30T00:00:00.000Z',
}

const runningTimer: TimerSession = {
  id: 1,
  taskId: focusTask.id,
  taskName: focusTask.name,
  status: 'running',
  startedAt: '2026-06-30T01:00:00.000Z',
  activeStartedAt: '2026-06-30T01:00:00.000Z',
  accumulatedSeconds: 0,
  updatedAt: '2026-06-30T01:00:00.000Z',
}

beforeEach(() => {
  vi.mocked(window.focusJournal.tasks.list).mockResolvedValue({ categories: [], tasks: [] })
  vi.mocked(window.focusJournal.tasks.createCategory).mockReset()
  vi.mocked(window.focusJournal.tasks.updateCategory).mockReset()
  vi.mocked(window.focusJournal.tasks.removeCategory).mockReset()
  vi.mocked(window.focusJournal.tasks.createTask).mockReset()
  vi.mocked(window.focusJournal.tasks.updateTask).mockReset()
  vi.mocked(window.focusJournal.tasks.archive).mockReset()
  vi.mocked(window.focusJournal.tasks.restore).mockReset()
  vi.mocked(window.focusJournal.tasks.remove).mockReset()
  vi.mocked(window.focusJournal.tasks.recent).mockResolvedValue([])
  vi.mocked(window.focusJournal.timer.getCurrent).mockResolvedValue(null)
  vi.mocked(window.focusJournal.timer.start).mockReset()
  vi.mocked(window.focusJournal.timer.start).mockResolvedValue(runningTimer)
  vi.mocked(window.focusJournal.timer.pause).mockReset()
  vi.mocked(window.focusJournal.timer.pause).mockResolvedValue(null)
  vi.mocked(window.focusJournal.timer.resume).mockReset()
  vi.mocked(window.focusJournal.timer.resume).mockResolvedValue(null)
  vi.mocked(window.focusJournal.timer.end).mockReset()
  vi.mocked(window.focusJournal.timer.end).mockResolvedValue(null)
  vi.mocked(window.focusJournal.timer.manualEntry).mockReset()
  vi.mocked(window.focusJournal.logs.timeline).mockResolvedValue([])
  vi.mocked(window.focusJournal.logs.search).mockReset()
  vi.mocked(window.focusJournal.logs.byTask).mockReset()
  vi.mocked(window.focusJournal.logs.byTask).mockResolvedValue([])
  vi.mocked(window.focusJournal.logs.update).mockReset()
  vi.mocked(window.focusJournal.logs.remove).mockReset()
  vi.mocked(window.focusJournal.stats.dashboard).mockResolvedValue(emptyStats)
  vi.mocked(window.focusJournal.settings.backupNow).mockReset()
  vi.mocked(window.focusJournal.settings.exportData).mockReset()
  vi.mocked(window.focusJournal.window.setMode).mockResolvedValue(undefined)
  vi.mocked(window.focusJournal.window.onModeChanged).mockReturnValue(() => undefined)
  vi.mocked(window.focusJournal.window.onTimerChanged).mockReturnValue(() => undefined)
})

it('shows a toast after starting a task', async () => {
  vi.mocked(window.focusJournal.tasks.list).mockResolvedValue({
    categories: [],
    tasks: [focusTask],
  })

  render(<App />)

  await screen.findByText(focusTask.name)
  fireEvent.click(document.querySelector('.mini-task-play')!)

  await waitFor(() => expect(window.focusJournal.timer.start).toHaveBeenCalledWith(focusTask.id))
  expect(await screen.findByRole('status')).toBeInTheDocument()
})

it('opens a note dialog before ending the running timer', async () => {
  vi.mocked(window.focusJournal.timer.getCurrent).mockResolvedValue(runningTimer)

  render(<App />)

  await waitFor(() => expect(document.querySelector('.mini-timer-actions button:last-child')).not.toBeDisabled())
  fireEvent.click(document.querySelector('.mini-timer-actions button:last-child')!)

  expect(await screen.findByRole('heading', { name: focusTask.name })).toBeInTheDocument()
  expect(await waitFor(() => document.querySelector('.dialog-modal textarea'))).toBeInTheDocument()
  expect(window.focusJournal.timer.pause).toHaveBeenCalled()
  expect(window.focusJournal.timer.end).not.toHaveBeenCalled()
})

it('ends the timer with the note from the dialog', async () => {
  vi.mocked(window.focusJournal.timer.getCurrent).mockResolvedValue(runningTimer)

  render(<App />)

  await waitFor(() => expect(document.querySelector('.mini-timer-actions button:last-child')).not.toBeDisabled())
  fireEvent.click(document.querySelector('.mini-timer-actions button:last-child')!)
  await waitFor(() => expect(document.querySelector('.dialog-modal textarea')).toBeInTheDocument())
  fireEvent.change(document.querySelector('.dialog-modal textarea')!, {
    target: { value: 'Finished the release notes draft.' },
  })
  fireEvent.click(document.querySelector('.dialog-modal .form-grid button')!)

  await waitFor(() => expect(window.focusJournal.timer.end).toHaveBeenCalledWith({
    log: 'Finished the release notes draft.',
  }))
  expect(await screen.findByRole('status')).toBeInTheDocument()
})

it('allows ending the timer with an empty note', async () => {
  vi.mocked(window.focusJournal.timer.getCurrent).mockResolvedValue(runningTimer)

  render(<App />)

  await waitFor(() => expect(document.querySelector('.mini-timer-actions button:last-child')).not.toBeDisabled())
  fireEvent.click(document.querySelector('.mini-timer-actions button:last-child')!)
  await waitFor(() => expect(document.querySelector('.dialog-modal .form-grid button')).toBeInTheDocument())
  fireEvent.click(document.querySelector('.dialog-modal .form-grid button')!)

  await waitFor(() => expect(window.focusJournal.timer.end).toHaveBeenCalledWith({ log: '' }))
})

it('cancels the end timer dialog without ending the timer', async () => {
  vi.mocked(window.focusJournal.timer.getCurrent).mockResolvedValue(runningTimer)

  const { container } = render(<App />)

  await waitFor(() => expect(document.querySelector('.mini-timer-actions button:last-child')).not.toBeDisabled())
  fireEvent.click(document.querySelector('.mini-timer-actions button:last-child')!)
  await waitFor(() => expect(document.querySelector('.dialog-header button')).toBeInTheDocument())
  fireEvent.click(document.querySelector('.dialog-header button')!)

  expect(window.focusJournal.timer.end).not.toHaveBeenCalled()
  await waitFor(() => expect(window.focusJournal.timer.resume).toHaveBeenCalled())

  fireEvent.click(document.querySelector('.mini-timer-actions button:last-child')!)
  await waitFor(() => expect(container.querySelector('.modal-backdrop')).toBeInTheDocument())
  fireEvent.click(container.querySelector('.modal-backdrop')!)

  expect(window.focusJournal.timer.end).not.toHaveBeenCalled()
  await waitFor(() => expect(window.focusJournal.timer.resume).toHaveBeenCalledTimes(2))
})

it('keeps the task name input focused and editable when clicked', async () => {
  render(<App />)
  await waitFor(() => expect(window.focusJournal.tasks.list).toHaveBeenCalled())

  fireEvent.click(screen.getByTitle('展开完整界面'))
  fireEvent.click(screen.getByRole('button', { name: '新建任务' }))

  const input = screen.getByPlaceholderText('任务名称')
  fireEvent.mouseDown(input)
  fireEvent.click(input)
  expect(input).toHaveFocus()

  fireEvent.change(input, { target: { value: '可输入的任务' } })
  expect(input).toHaveValue('可输入的任务')
  expect(screen.getByRole('heading', { name: '创建普通任务' })).toBeInTheDocument()
})

it('opens the task dialog with its category selected', async () => {
  vi.mocked(window.focusJournal.tasks.list).mockResolvedValue({
    categories: [{
      id: 7,
      name: '学习',
      color: '#3f6f68',
      archived: false,
      createdAt: '2026-06-19T00:00:00.000Z',
      updatedAt: '2026-06-19T00:00:00.000Z',
    }],
    tasks: [],
  })

  render(<App />)
  fireEvent.click(screen.getByTitle('展开完整界面'))
  fireEvent.click(screen.getByRole('button', { name: '按分类' }))
  fireEvent.click(await screen.findByTitle('在 学习 中新建任务'))

  expect(screen.getByRole('combobox')).toHaveValue('7')
})

it('creates a project without a category selector', async () => {
  render(<App />)
  fireEvent.click(screen.getByTitle('展开完整界面'))
  fireEvent.click(screen.getByRole('button', { name: '按项目' }))
  fireEvent.click(screen.getByRole('button', { name: '新建项目' }))

  expect(screen.getByPlaceholderText('项目名称')).toBeInTheDocument()
  expect(screen.getByPlaceholderText('项目描述，可空')).toBeInTheDocument()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
})

it('shows task description and recent records without repeating the task name', async () => {
  vi.mocked(window.focusJournal.tasks.list).mockResolvedValue({ categories: [], tasks: [focusTask] })
  vi.mocked(window.focusJournal.tasks.recent).mockResolvedValue([focusTask])
  vi.mocked(window.focusJournal.logs.byTask).mockResolvedValue([{
    id: 601,
    taskId: focusTask.id,
    taskName: focusTask.name,
    categoryName: null,
    startedAt: '2026-06-30T01:00:00.000Z',
    endedAt: '2026-06-30T01:30:00.000Z',
    durationSeconds: 1800,
    log: 'Wrote a clear summary',
    isManual: false,
    createdAt: '2026-06-30T01:30:00.000Z',
  }])

  render(<App />)
  fireEvent.click(screen.getByTitle('展开完整界面'))
  fireEvent.click(await screen.findByTitle('查看详情'))

  const detail = await screen.findByText('Wrote a clear summary')
  const dialog = detail.closest('.task-detail-modal')!
  expect(dialog.querySelector('h2')).toHaveTextContent(focusTask.name)
  expect(dialog.querySelector('[aria-label="任务名称"]')).toBeNull()
  expect(dialog.querySelector('[aria-label="任务归属"]')).toBeNull()
  expect(dialog.querySelector('.task-detail-value')).toHaveTextContent('暂无描述')
  expect(dialog.querySelector('.entry-item strong')).toBeNull()
  expect(dialog.querySelector('.entry-description')).toHaveTextContent('Wrote a clear summary')
  expect(dialog.querySelector('.entry-actions')).toBeNull()
  expect(window.focusJournal.logs.byTask).toHaveBeenCalledWith(focusTask.id)
})

it('shows the create project action only in the project view', async () => {
  render(<App />)
  fireEvent.click(screen.getByTitle('展开完整界面'))

  expect(screen.queryByRole('button', { name: '新建项目' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '按项目' }))

  expect(screen.getByRole('button', { name: '新建项目' })).toBeInTheDocument()
})

it('shows the task title and places habits directly after tasks', () => {
  render(<App />)
  fireEvent.click(screen.getByTitle('展开完整界面'))

  expect(screen.getByRole('heading', { name: '任务', level: 1 })).toBeInTheDocument()
  const navigationLabels = [...screen.getByRole('navigation').querySelectorAll('button')].map((button) => button.textContent)
  expect(navigationLabels.slice(0, 2)).toEqual(['任务', '习惯'])
})

it('opens an empty archive page from the sidebar', () => {
  render(<App />)
  fireEvent.click(screen.getByTitle('展开完整界面'))

  fireEvent.click(screen.getByRole('button', { name: '归档' }))

  expect(screen.getByRole('heading', { name: '归档', level: 1 })).toBeInTheDocument()
  expect(screen.getByText('还没有归档任务')).toBeInTheDocument()
})

it('shows timeline entries with a time rail and keeps record actions available', async () => {
  vi.mocked(window.focusJournal.logs.timeline).mockResolvedValue([
    {
      date: '2026-06-24',
      totalSeconds: 7200,
      entries: [
        {
          id: 201,
          taskId: 12,
          taskName: 'Implement timeline',
          categoryName: 'Product',
          startedAt: '2026-06-24T01:00:00.000Z',
          endedAt: '2026-06-24T02:30:00.000Z',
          durationSeconds: 5400,
          log: 'Made every record easier to scan.',
          isManual: false,
          createdAt: '2026-06-24T02:30:00.000Z',
        },
        {
          id: 202,
          taskId: 13,
          taskName: 'Review notes',
          categoryName: null,
          startedAt: '2026-06-24T03:00:00.000Z',
          endedAt: '2026-06-24T03:30:00.000Z',
          durationSeconds: 1800,
          log: '',
          isManual: true,
          createdAt: '2026-06-24T03:30:00.000Z',
        },
      ],
    },
    {
      date: '2026-06-25',
      totalSeconds: 3600,
      entries: [
        {
          id: 203,
          taskId: 14,
          taskName: 'Plan calendar filter',
          categoryName: 'Product',
          startedAt: '2026-06-25T01:00:00.000Z',
          endedAt: '2026-06-25T02:00:00.000Z',
          durationSeconds: 3600,
          log: 'Picked a day from the calendar.',
          isManual: false,
          createdAt: '2026-06-25T02:00:00.000Z',
        },
      ],
    },
  ])

  render(<App />)
  await waitFor(() => expect(window.focusJournal.logs.timeline).toHaveBeenCalled())

  fireEvent.click(document.querySelector('.mini-header button')!)
  fireEvent.click(screen.getByRole('button', { name: '时间线' }))

  expect(await screen.findByText('Implement timeline')).toBeInTheDocument()
  expect(screen.getByText('2026-06-24')).toBeInTheDocument()
  expect(screen.getByText('Plan calendar filter')).toBeInTheDocument()
  expect(screen.getByText('2026-06-25')).toBeInTheDocument()
  expect(screen.getByText('2h')).toBeInTheDocument()
  expect(screen.getByText('Made every record easier to scan.')).toBeInTheDocument()
  expect(screen.queryByText('没有记录内容')).not.toBeInTheDocument()
  expect(screen.getByText('1h 30m')).toBeInTheDocument()
  expect(document.querySelectorAll('.timeline-entry-item')).toHaveLength(3)
  expect(document.querySelector('.entry-time-rail')).toBeInTheDocument()
  expect(screen.getAllByTitle('编辑记录')).toHaveLength(3)
  expect(screen.getAllByTitle('删除记录')).toHaveLength(3)

  fireEvent.change(screen.getByLabelText('选择时间线日期'), { target: { value: '2026-06-25' } })

  expect(screen.queryByText('Implement timeline')).not.toBeInTheDocument()
  expect(screen.getByText('Plan calendar filter')).toBeInTheDocument()
  expect(document.querySelectorAll('.timeline-entry-item')).toHaveLength(1)

  fireEvent.change(screen.getByLabelText('选择时间线日期'), { target: { value: '2026-06-26' } })

  expect(screen.getByText('这一天还没有专注记录。')).toBeInTheDocument()
  expect(screen.queryByText('Plan calendar filter')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '全部' }))

  expect(screen.getByText('Implement timeline')).toBeInTheDocument()
  expect(screen.getByText('Plan calendar filter')).toBeInTheDocument()
  expect(document.querySelectorAll('.timeline-entry-item')).toHaveLength(3)

  fireEvent.click(screen.getAllByTitle('编辑记录')[0])

  expect(screen.getByDisplayValue('Made every record easier to scan.')).toBeInTheDocument()
})

it('shows archived tasks as a quiet list before opening the detail page', async () => {
  vi.mocked(window.focusJournal.tasks.list).mockResolvedValue({
    categories: [],
    tasks: [
      {
        id: 31,
        categoryId: null,
        parentId: null,
        name: '完成发布准备',
        kind: 'task',
        color: '#3f6f68',
        archived: true,
        archiveReview: '',
        habitTargetMinutes: null,
        totalSeconds: 5400,
        lastWorkedAt: '2026-06-22T09:00:00.000Z',
        createdAt: '2026-06-19T00:00:00.000Z',
        updatedAt: '2026-06-23T10:00:00.000Z',
      },
    ],
  })
  vi.mocked(window.focusJournal.logs.timeline).mockResolvedValue([
    {
      date: '2026-06-03',
      totalSeconds: 7200,
      entries: [{
        id: 302,
        taskId: 31,
        taskName: '完成发布准备',
        categoryName: null,
        startedAt: '2026-06-03T09:00:00.000Z',
        endedAt: '2026-06-03T11:00:00.000Z',
        durationSeconds: 7200,
        log: '完成发布检查',
        isManual: false,
        createdAt: '2026-06-03T11:00:00.000Z',
      }],
    },
    {
      date: '2026-06-01',
      totalSeconds: 3600,
      entries: [{
        id: 301,
        taskId: 31,
        taskName: '完成发布准备',
        categoryName: null,
        startedAt: '2026-06-01T09:00:00.000Z',
        endedAt: '2026-06-01T10:00:00.000Z',
        durationSeconds: 3600,
        log: '整理发布清单',
        isManual: false,
        createdAt: '2026-06-01T10:00:00.000Z',
      }],
    },
  ])

  render(<App />)
  fireEvent.click(screen.getByTitle('展开完整界面'))
  fireEvent.click(screen.getByRole('button', { name: '归档' }))

  expect(await screen.findByText('完成发布准备')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '查看' })).toBeInTheDocument()
  expect(screen.queryByText('实际投入日均')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '查看' }))

  expect(screen.getAllByText(new Date('2026-06-01T09:00:00.000Z').toLocaleDateString()).length).toBeGreaterThan(0)
  expect(screen.getAllByText(new Date('2026-06-03T11:00:00.000Z').toLocaleDateString()).length).toBeGreaterThan(0)
  expect(screen.getByText('3h')).toBeInTheDocument()
  expect(screen.getByText('1h 30m')).toBeInTheDocument()
  expect(screen.getByText('2')).toBeInTheDocument()
  expect(screen.getByText('完成发布检查')).toBeInTheDocument()

  fireEvent.change(screen.getByPlaceholderText('写下这个任务完成后的想法、经验或下次可以改进的地方。'), {
    target: { value: '这次发布节奏更清楚。' },
  })
  fireEvent.click(screen.getByRole('button', { name: '保存复盘' }))

  await waitFor(() => expect(window.focusJournal.tasks.updateTask).toHaveBeenCalledWith({
    id: 31,
    archiveReview: '这次发布节奏更清楚。',
  }))

  fireEvent.click(screen.getByTitle('恢复'))

  await waitFor(() => expect(window.focusJournal.tasks.restore).toHaveBeenCalledWith(31))
})

it('aggregates child task records for archived project achievements', async () => {
  vi.mocked(window.focusJournal.tasks.list).mockResolvedValue({
    categories: [],
    tasks: [
      { id: 61, categoryId: null, parentId: null, name: '网站改版', kind: 'project', color: '#3f6f68', archived: true, archiveReview: '', habitTargetMinutes: null, totalSeconds: 0, lastWorkedAt: null, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-06T00:00:00.000Z' },
      { id: 62, categoryId: null, parentId: 61, name: '视觉调整', kind: 'project_task', color: '#3f6f68', archived: false, archiveReview: '', habitTargetMinutes: null, totalSeconds: 0, lastWorkedAt: null, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-06T00:00:00.000Z' },
    ],
  })
  vi.mocked(window.focusJournal.logs.timeline).mockResolvedValue([
    {
      date: '2026-06-04',
      totalSeconds: 7200,
      entries: [{
        id: 401,
        taskId: 62,
        taskName: '视觉调整',
        categoryName: null,
        startedAt: '2026-06-04T08:00:00.000Z',
        endedAt: '2026-06-04T10:00:00.000Z',
        durationSeconds: 7200,
        log: '完成首页视觉',
        isManual: false,
        createdAt: '2026-06-04T10:00:00.000Z',
      }],
    },
  ])

  render(<App />)
  fireEvent.click(screen.getByTitle('展开完整界面'))
  fireEvent.click(screen.getByRole('button', { name: '归档' }))

  expect(await screen.findByText('网站改版')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '查看' }))

  expect(screen.getAllByText('2h').length).toBeGreaterThan(0)
  expect(screen.getAllByText('1').length).toBeGreaterThan(0)
  expect(screen.getByText('完成首页视觉')).toBeInTheDocument()
})

it('hides archived tasks from category and project task views', async () => {
  vi.mocked(window.focusJournal.tasks.list).mockResolvedValue({
    categories: [
      { id: 1, name: '工作', color: '#3f6f68', archived: false, createdAt: '2026-06-19T00:00:00.000Z', updatedAt: '2026-06-19T00:00:00.000Z' },
    ],
    tasks: [
      { id: 41, categoryId: 1, parentId: null, name: '活跃任务', kind: 'task', color: '#3f6f68', archived: false, archiveReview: '', habitTargetMinutes: null, totalSeconds: 600, lastWorkedAt: null, createdAt: '2026-06-19T00:00:00.000Z', updatedAt: '2026-06-19T00:00:00.000Z' },
      { id: 42, categoryId: 1, parentId: null, name: '已归档任务', kind: 'task', color: '#3f6f68', archived: true, archiveReview: '', habitTargetMinutes: null, totalSeconds: 1200, lastWorkedAt: null, createdAt: '2026-06-19T00:00:00.000Z', updatedAt: '2026-06-20T00:00:00.000Z' },
      { id: 43, categoryId: 1, parentId: null, name: '活跃项目', kind: 'project', color: '#3f6f68', archived: false, archiveReview: '', habitTargetMinutes: null, totalSeconds: 1800, lastWorkedAt: null, createdAt: '2026-06-19T00:00:00.000Z', updatedAt: '2026-06-19T00:00:00.000Z' },
      { id: 44, categoryId: 1, parentId: 43, name: '活跃项目任务', kind: 'project_task', color: '#3f6f68', archived: false, archiveReview: '', habitTargetMinutes: null, totalSeconds: 900, lastWorkedAt: null, createdAt: '2026-06-19T00:00:00.000Z', updatedAt: '2026-06-19T00:00:00.000Z' },
      { id: 45, categoryId: 1, parentId: 43, name: '已归档项目任务', kind: 'project_task', color: '#3f6f68', archived: true, archiveReview: '', habitTargetMinutes: null, totalSeconds: 900, lastWorkedAt: null, createdAt: '2026-06-19T00:00:00.000Z', updatedAt: '2026-06-20T00:00:00.000Z' },
      { id: 46, categoryId: 1, parentId: null, name: '已归档项目', kind: 'project', color: '#3f6f68', archived: true, archiveReview: '', habitTargetMinutes: null, totalSeconds: 900, lastWorkedAt: null, createdAt: '2026-06-19T00:00:00.000Z', updatedAt: '2026-06-20T00:00:00.000Z' },
    ],
  })

  render(<App />)
  fireEvent.click(screen.getByTitle('展开完整界面'))
  fireEvent.click(screen.getByRole('button', { name: '按分类' }))

  expect(await screen.findByText('活跃任务')).toBeInTheDocument()
  expect(screen.queryByText('已归档任务')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '按项目' }))

  expect(await screen.findByText('活跃项目')).toBeInTheDocument()
  expect(screen.getByText('活跃项目任务')).toBeInTheDocument()
  expect(screen.queryByText('已归档项目')).not.toBeInTheDocument()
  expect(screen.queryByText('已归档项目任务')).not.toBeInTheDocument()
})


it('keeps three actions on task rows and edits task details in the same modal', async () => {
  vi.mocked(window.focusJournal.tasks.list).mockResolvedValue({
    categories: [
      { id: 1, name: '工作', color: '#3f6f68', archived: false, createdAt: '2026-06-19T00:00:00.000Z', updatedAt: '2026-06-19T00:00:00.000Z' },
      { id: 2, name: '学习', color: '#3ba7c9', archived: false, createdAt: '2026-06-19T00:00:00.000Z', updatedAt: '2026-06-19T00:00:00.000Z' },
    ],
    tasks: [
      { id: 10, categoryId: 1, parentId: null, name: '旧任务', kind: 'task', color: '#3f6f68', archived: false, archiveReview: '', habitTargetMinutes: null, totalSeconds: 0, lastWorkedAt: null, createdAt: '2026-06-19T00:00:00.000Z', updatedAt: '2026-06-19T00:00:00.000Z' },
      { id: 20, categoryId: null, parentId: null, name: '学习项目', kind: 'project', color: '#3f6f68', archived: false, archiveReview: '', habitTargetMinutes: null, totalSeconds: 0, lastWorkedAt: null, createdAt: '2026-06-19T00:00:00.000Z', updatedAt: '2026-06-19T00:00:00.000Z' },
    ],
  })
  vi.mocked(window.focusJournal.tasks.recent).mockResolvedValue([
    { id: 10, categoryId: 1, parentId: null, name: '旧任务', kind: 'task', color: '#3f6f68', archived: false, archiveReview: '', habitTargetMinutes: null, totalSeconds: 0, lastWorkedAt: null, createdAt: '2026-06-19T00:00:00.000Z', updatedAt: '2026-06-19T00:00:00.000Z' },
  ])
  vi.mocked(window.focusJournal.logs.byTask).mockResolvedValue([])
  vi.mocked(window.focusJournal.tasks.updateTask).mockResolvedValue({
    id: 10,
    categoryId: null,
    parentId: 20,
    name: '新任务',
    kind: 'project_task',
    color: '#3f6f68',
    archived: false,
    archiveReview: '',
    habitTargetMinutes: null,
    totalSeconds: 0,
    lastWorkedAt: null,
    createdAt: '2026-06-19T00:00:00.000Z',
    updatedAt: '2026-06-19T00:00:00.000Z',
  })

  render(<App />)
  await waitFor(() => expect(screen.getByText('旧任务')).toBeInTheDocument())
  fireEvent.click(screen.getByTitle('展开完整界面'))
  const taskRow = screen.getByText('旧任务').closest('.task-item')!
  expect(taskRow.querySelectorAll('.item-actions button')).toHaveLength(3)
  expect(taskRow.querySelector('[title="编辑名称"]')).toBeNull()
  expect(taskRow.querySelector('[title="归档"]')).toBeNull()
  expect(taskRow.querySelector('[title="删除"]')).toBeNull()
  fireEvent.click(taskRow.querySelector('[title="查看详情"]')!)

  const dialog = screen.getByText('归属').closest('.task-detail-modal')!
  expect(dialog.querySelector('[aria-label="任务名称"]')).toBeNull()
  expect(dialog.querySelector('[aria-label="任务归属"]')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '编辑' }))
  expect(document.querySelectorAll('.task-detail-modal')).toHaveLength(1)
  expect(document.querySelector('.task-detail-modal')).toBe(dialog)
  expect(screen.getByRole('textbox', { name: '任务名称' })).toBeEnabled()
  expect(screen.getByRole('combobox', { name: '任务归属' })).toBeEnabled()

  fireEvent.change(screen.getByRole('textbox', { name: '任务名称' }), { target: { value: '新任务' } })
  fireEvent.change(screen.getByRole('combobox', { name: '任务归属' }), { target: { value: 'project:20' } })
  fireEvent.click(screen.getByRole('button', { name: '保存修改' }))

  await waitFor(() => expect(window.focusJournal.tasks.updateTask).toHaveBeenCalledWith({
    id: 10,
    name: '新任务',
    description: '',
    categoryId: null,
    parentId: 20,
  }))
})

it('shows task based dashboard totals and switches selected task detail', async () => {
  vi.mocked(window.focusJournal.tasks.list).mockResolvedValue({
    categories: [{ id: 1, name: '工作', color: '#3f6f68', archived: false, createdAt: '2026-06-19T00:00:00.000Z', updatedAt: '2026-06-19T00:00:00.000Z' }],
    tasks: [
      { id: 1, categoryId: 1, parentId: null, name: '写代码', kind: 'task', color: '#3f6f68', archived: false, archiveReview: '', habitTargetMinutes: null, totalSeconds: 10800, lastWorkedAt: '2026-06-23T09:00:00.000Z', createdAt: '2026-06-19T00:00:00.000Z', updatedAt: '2026-06-19T00:00:00.000Z' },
      { id: 2, categoryId: 1, parentId: null, name: '阅读', kind: 'task', color: '#3ba7c9', archived: false, archiveReview: '', habitTargetMinutes: null, totalSeconds: 1800, lastWorkedAt: '2026-06-22T09:00:00.000Z', createdAt: '2026-06-19T00:00:00.000Z', updatedAt: '2026-06-19T00:00:00.000Z' },
    ],
  })
  vi.mocked(window.focusJournal.logs.timeline).mockResolvedValue([
    {
      date: '2026-06-23',
      totalSeconds: 7200,
      entries: [{
        id: 101,
        taskId: 1,
        taskName: '写代码',
        categoryName: '工作',
        startedAt: '2026-06-23T09:00:00.000Z',
        endedAt: '2026-06-23T11:00:00.000Z',
        durationSeconds: 7200,
        log: '实现仪表盘',
        isManual: false,
        createdAt: '2026-06-23T11:00:00.000Z',
      }],
    },
    {
      date: '2026-06-22',
      totalSeconds: 5400,
      entries: [
        {
          id: 102,
          taskId: 1,
          taskName: '写代码',
          categoryName: '工作',
          startedAt: '2026-06-22T09:00:00.000Z',
          endedAt: '2026-06-22T10:00:00.000Z',
          durationSeconds: 3600,
          log: '整理结构',
          isManual: false,
          createdAt: '2026-06-22T10:00:00.000Z',
        },
        {
          id: 103,
          taskId: 2,
          taskName: '阅读',
          categoryName: '工作',
          startedAt: '2026-06-22T11:00:00.000Z',
          endedAt: '2026-06-22T11:30:00.000Z',
          durationSeconds: 1800,
          log: '看文档',
          isManual: false,
          createdAt: '2026-06-22T11:30:00.000Z',
        },
      ],
    },
  ])

  render(<App />)
  fireEvent.click(screen.getByTitle('展开完整界面'))
  fireEvent.click(screen.getByRole('button', { name: '仪表盘' }))

  expect(screen.getByRole('heading', { name: '本周趋势' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '按任务' }))

  expect(await screen.findByRole('heading', { name: '任务排行' })).toBeInTheDocument()
  expect(screen.getByText('总专注时长')).toBeInTheDocument()
  expect(screen.getByText('3h 30m')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '写代码' })).toBeInTheDocument()
  expect(screen.getByText('实现仪表盘')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /阅读/ }))

  expect(screen.getByRole('heading', { name: '阅读' })).toBeInTheDocument()
  expect(screen.getByText('看文档')).toBeInTheDocument()
})

it('hides archived tasks and archived project children from the task dashboard', async () => {
  vi.mocked(window.focusJournal.tasks.list).mockResolvedValue({
    categories: [],
    tasks: [
      { id: 71, categoryId: null, parentId: null, name: '活跃任务', kind: 'task', color: '#3f6f68', archived: false, archiveReview: '', habitTargetMinutes: null, totalSeconds: 3600, lastWorkedAt: '2026-06-24T09:00:00.000Z', createdAt: '2026-06-20T00:00:00.000Z', updatedAt: '2026-06-24T00:00:00.000Z' },
      { id: 72, categoryId: null, parentId: null, name: '归档任务', kind: 'task', color: '#3f6f68', archived: true, archiveReview: '', habitTargetMinutes: null, totalSeconds: 3600, lastWorkedAt: '2026-06-24T10:00:00.000Z', createdAt: '2026-06-20T00:00:00.000Z', updatedAt: '2026-06-24T00:00:00.000Z' },
      { id: 73, categoryId: null, parentId: null, name: '归档项目', kind: 'project', color: '#3f6f68', archived: true, archiveReview: '', habitTargetMinutes: null, totalSeconds: 0, lastWorkedAt: null, createdAt: '2026-06-20T00:00:00.000Z', updatedAt: '2026-06-24T00:00:00.000Z' },
      { id: 74, categoryId: null, parentId: 73, name: '归档项目子任务', kind: 'project_task', color: '#3f6f68', archived: false, archiveReview: '', habitTargetMinutes: null, totalSeconds: 3600, lastWorkedAt: '2026-06-24T11:00:00.000Z', createdAt: '2026-06-20T00:00:00.000Z', updatedAt: '2026-06-24T00:00:00.000Z' },
    ],
  })
  vi.mocked(window.focusJournal.logs.timeline).mockResolvedValue([{
    date: '2026-06-24',
    totalSeconds: 10800,
    entries: [
      { id: 501, taskId: 71, taskName: '活跃任务', categoryName: null, startedAt: '2026-06-24T09:00:00.000Z', endedAt: '2026-06-24T10:00:00.000Z', durationSeconds: 3600, log: 'active', isManual: false, createdAt: '2026-06-24T10:00:00.000Z' },
      { id: 502, taskId: 72, taskName: '归档任务', categoryName: null, startedAt: '2026-06-24T10:00:00.000Z', endedAt: '2026-06-24T11:00:00.000Z', durationSeconds: 3600, log: 'archived', isManual: false, createdAt: '2026-06-24T11:00:00.000Z' },
      { id: 503, taskId: 74, taskName: '归档项目子任务', categoryName: null, startedAt: '2026-06-24T11:00:00.000Z', endedAt: '2026-06-24T12:00:00.000Z', durationSeconds: 3600, log: 'child', isManual: false, createdAt: '2026-06-24T12:00:00.000Z' },
    ],
  }])

  render(<App />)
  fireEvent.click(screen.getByTitle('展开完整界面'))
  fireEvent.click(screen.getByRole('button', { name: '仪表盘' }))
  fireEvent.click(screen.getByRole('button', { name: '按任务' }))

  await waitFor(() => expect(screen.getAllByText('活跃任务').length).toBeGreaterThan(0))
  expect(screen.queryByText('归档任务')).not.toBeInTheDocument()
  expect(screen.queryByText('归档项目子任务')).not.toBeInTheDocument()
  expect(screen.getAllByText('1h').length).toBeGreaterThan(0)
})


