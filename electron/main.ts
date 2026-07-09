import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { openDatabase } from './services/database'
import { FocusJournalService } from './services/focusJournal'
import type { AppSettings, CreateCategoryInput, CreateTaskInput, EndTimerInput, ManualEntryInput, UpdateCategoryInput, UpdateTimeEntryInput, UpdateTaskInput, WindowMode } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let service: FocusJournalService
let isQuitting = false

const MINI_WINDOW = { width: 360, height: 520, minWidth: 320, minHeight: 460 }
const FULL_WINDOW = { width: 1280, height: 820, minWidth: 1040, minHeight: 700 }

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
const hasSingleInstanceLock = app.requestSingleInstanceLock()

function applyWindowMode(mode: WindowMode): void {
  if (!mainWindow) return
  const cfg = mode === 'mini' ? MINI_WINDOW : FULL_WINDOW
  mainWindow.setMinimumSize(cfg.minWidth, cfg.minHeight)
  mainWindow.setSize(cfg.width, cfg.height)
  mainWindow.center()
  mainWindow.webContents.send('window:modeChanged', mode)
}

function createWindow(): void {
  const preloadPath = existsSync(join(__dirname, 'preload.mjs'))
    ? join(__dirname, 'preload.mjs')
    : join(__dirname, 'preload.js')

  const cfg = MINI_WINDOW
  mainWindow = new BrowserWindow({
    width: cfg.width,
    height: cfg.height,
    minWidth: cfg.minWidth,
    minHeight: cfg.minHeight,
    title: 'Focus Journal',
    backgroundColor: '#f4f9fb',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!)
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
}

function showWindow(): void {
  if (!mainWindow) createWindow()
  mainWindow?.show()
  mainWindow?.focus()
}

function createTray(): void {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKUlEQVR4AWP4z8Dwn4ECwESJ5lEDRg0YNYAEGDUYNYAEGDUYAAAj6gIfVLrYsgAAAABJRU5ErkJggg==',
  )
  tray = new Tray(icon)
  tray.setToolTip('Focus Journal')
  tray.on('click', showWindow)
  refreshTray()
}

function refreshTray(): void {
  if (!tray || !service) return
  const current = service.getCurrentTimer()
  const recent = service.recentTasks().slice(0, 5)
  const template: Electron.MenuItemConstructorOptions[] = [
    { label: current ? `${current.status === 'running' ? '进行中' : '已暂停'}：${current.taskName}` : '没有正在计时的任务', enabled: false },
    { type: 'separator' },
    {
      label: current?.status === 'running' ? '暂停' : '继续',
      enabled: Boolean(current),
      click: () => {
        if (current?.status === 'running') service.pauseTimer()
        else service.resumeTimer()
        emitChanged()
      },
    },
    {
      label: '结束',
      enabled: Boolean(current),
      click: () => {
        service.endTimer('')
        emitChanged()
      },
    },
    { type: 'separator' },
    ...recent.map((task) => ({
      label: `开始：${task.name}`,
      click: () => {
        service.startTimer(task.id)
        emitChanged()
      },
    })),
    { type: 'separator' },
    { label: '打开 Focus Journal', click: showWindow },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ]
  tray.setContextMenu(Menu.buildFromTemplate(template))
}

function emitChanged(): void {
  refreshTray()
  mainWindow?.webContents.send('timer:changed')
}

function registerIpc(): void {
  ipcMain.handle('tasks:list', () => service.listTasks())
  ipcMain.handle('tasks:createCategory', (_, input: CreateCategoryInput) => service.createCategory(input))
  ipcMain.handle('tasks:updateCategory', (_, input: UpdateCategoryInput) => service.updateCategory(input))
  ipcMain.handle('tasks:removeCategory', (_, id: number) => service.removeCategory(id))
  ipcMain.handle('tasks:createTask', (_, input: CreateTaskInput) => service.createTask(input))
  ipcMain.handle('tasks:updateTask', (_, input: UpdateTaskInput) => service.updateTask(input))
  ipcMain.handle('tasks:archive', (_, id: number) => service.archiveTask(id))
  ipcMain.handle('tasks:restore', (_, id: number) => service.restoreTask(id))
  ipcMain.handle('tasks:remove', (_, id: number) => service.removeTask(id))
  ipcMain.handle('tasks:recent', () => service.recentTasks())

  ipcMain.handle('timer:getCurrent', () => service.getCurrentTimer())
  ipcMain.handle('timer:start', (_, taskId: number) => service.startTimer(taskId))
  ipcMain.handle('timer:pause', () => service.pauseTimer())
  ipcMain.handle('timer:resume', () => service.resumeTimer())
  ipcMain.handle('timer:end', (_, input?: EndTimerInput) => service.endTimer(input?.log ?? ''))
  ipcMain.handle('timer:manualEntry', (_, input: ManualEntryInput) => service.manualEntry(input))

  ipcMain.handle('logs:timeline', () => service.timeline())
  ipcMain.handle('logs:search', (_, query: string) => service.searchLogs(query))
  ipcMain.handle('logs:byTask', (_, taskId: number) => service.entriesByTask(taskId))
  ipcMain.handle('logs:update', (_, input: UpdateTimeEntryInput) => service.updateEntry(input))
  ipcMain.handle('logs:remove', (_, id: number) => service.removeEntry(id))
  ipcMain.handle('stats:dashboard', () => service.dashboard())

  ipcMain.handle('settings:get', () => service.getSettings())
  ipcMain.handle('settings:update', (_, input: Partial<AppSettings>) => service.updateSettings(input))
  ipcMain.handle('settings:backupNow', () => service.backupNow())
  ipcMain.handle('settings:exportData', (_, format: 'json' | 'csv' | 'markdown') => service.exportData(format))

  ipcMain.handle('window:setMode', (_, mode: WindowMode) => {
    applyWindowMode(mode)
  })
}

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    showWindow()
  })

  app.whenReady().then(async () => {
    const userData = app.getPath('userData')
    service = new FocusJournalService(
      await openDatabase(join(userData, 'focus-journal.sqlite')),
      {
        dbPath: join(userData, 'focus-journal.sqlite'),
        backupDir: join(userData, 'backups'),
        exportDir: join(userData, 'exports'),
      },
      emitChanged,
    )

    service.maybeAutoBackup()
    registerIpc()
    createWindow()
    createTray()

    app.on('activate', showWindow)
  })
}

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {})
