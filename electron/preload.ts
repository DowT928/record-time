import { contextBridge, ipcRenderer } from 'electron'
import type { FocusJournalApi, WindowMode } from '../shared/types'

const invoke = <T>(channel: string, payload?: unknown): Promise<T> => ipcRenderer.invoke(channel, payload) as Promise<T>

const api: FocusJournalApi = {
  tasks: {
    list: () => invoke('tasks:list'),
    createCategory: (input) => invoke('tasks:createCategory', input),
    updateCategory: (input) => invoke('tasks:updateCategory', input),
    removeCategory: (id) => invoke('tasks:removeCategory', id),
    createTask: (input) => invoke('tasks:createTask', input),
    updateTask: (input) => invoke('tasks:updateTask', input),
    archive: (id) => invoke('tasks:archive', id),
    restore: (id) => invoke('tasks:restore', id),
    remove: (id) => invoke('tasks:remove', id),
    recent: () => invoke('tasks:recent'),
  },
  timer: {
    getCurrent: () => invoke('timer:getCurrent'),
    start: (taskId) => invoke('timer:start', taskId),
    pause: () => invoke('timer:pause'),
    resume: () => invoke('timer:resume'),
    end: (input) => invoke('timer:end', input),
    manualEntry: (input) => invoke('timer:manualEntry', input),
  },
  logs: {
    timeline: () => invoke('logs:timeline'),
    search: (query) => invoke('logs:search', query),
    byTask: (taskId) => invoke('logs:byTask', taskId),
    update: (input) => invoke('logs:update', input),
    remove: (id) => invoke('logs:remove', id),
  },
  stats: {
    dashboard: () => invoke('stats:dashboard'),
  },
  settings: {
    get: () => invoke('settings:get'),
    update: (input) => invoke('settings:update', input),
    backupNow: () => invoke('settings:backupNow'),
    exportData: (format) => invoke('settings:exportData', format),
  },
  window: {
    setMode: (mode: WindowMode) => invoke('window:setMode', mode),
    onModeChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, mode: WindowMode) => callback(mode)
      ipcRenderer.on('window:modeChanged', listener)
      return () => { ipcRenderer.removeListener('window:modeChanged', listener) }
    },
    onTimerChanged: (callback) => {
      const listener = () => callback()
      ipcRenderer.on('timer:changed', listener)
      return () => ipcRenderer.removeListener('timer:changed', listener)
    },
  },
}

contextBridge.exposeInMainWorld('focusJournal', api)
