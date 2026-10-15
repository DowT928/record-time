import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { openDatabase } from './database'
import { FocusJournalService } from './focusJournal'

async function createService() {
  const dir = mkdtempSync(join(tmpdir(), 'focus-journal-'))
  const dbPath = join(dir, 'test.sqlite')
  return new FocusJournalService(await openDatabase(dbPath), {
    dbPath,
    backupDir: join(dir, 'backups'),
    exportDir: join(dir, 'exports'),
  })
}

describe('FocusJournalService', () => {
  it('creates tasks and records manual entries', async () => {
    const service = await createService()
    const category = service.createCategory({ name: 'Tests' })
    const task = service.createTask({ name: 'Write tests', description: 'Cover service behavior', kind: 'task', categoryId: category.id, habitTargetMinutes: 30 })

    service.manualEntry({
      taskId: task.id,
      startedAt: '2026-06-01T01:00:00.000Z',
      endedAt: '2026-06-01T02:00:00.000Z',
      log: 'Completed service tests',
    })

    expect(service.entriesByTask(task.id)).toHaveLength(1)
    expect(service.searchLogs('service tests')[0].taskName).toBe('Write tests')
    expect(task.description).toBe('Cover service behavior')
  })

  it('pauses a running task when starting another task', async () => {
    const service = await createService()
    const first = service.createTask({ name: 'Task A', kind: 'task' })
    const second = service.createTask({ name: 'Task B', kind: 'task' })

    service.startTimer(first.id)
    const current = service.startTimer(second.id)

    expect(current.taskId).toBe(second.id)
    expect(current.status).toBe('running')
  })

  it('deletes a category without deleting its tasks', async () => {
    const service = await createService()
    const category = service.createCategory({ name: 'Temporary' })
    const task = service.createTask({ name: 'Keep me', kind: 'task', categoryId: category.id })

    service.removeCategory(category.id)

    const result = service.listTasks()
    expect(result.categories.some((item) => item.id === category.id)).toBe(false)
    expect(result.tasks.find((item) => item.id === task.id)?.categoryId).toBeNull()
  })

  it('updates a category name and color', async () => {
    const service = await createService()
    const category = service.createCategory({ name: 'Old name' })

    const updated = service.updateCategory({ id: category.id, name: 'New name', color: '#ee7f6d' })

    expect(updated.name).toBe('New name')
    expect(updated.color).toBe('#ee7f6d')
  })

  it('updates and returns an archive review for a task', async () => {
    const service = await createService()
    const task = service.createTask({ name: 'Archived task', kind: 'task' })

    service.updateTask({ id: task.id, archiveReview: 'Finished with a cleaner flow.' })

    const updated = service.listTasks().tasks.find((item) => item.id === task.id)
    expect(updated?.archiveReview).toBe('Finished with a cleaner flow.')
  })

  it('moves saved task time between projects and categories, including archived project tasks', async () => {
    const service = await createService()
    const category = service.createCategory({ name: 'Work' })
    const firstProject = service.createTask({ name: 'First project', kind: 'project', categoryId: category.id })
    const secondProject = service.createTask({ name: 'Second project', kind: 'project' })
    const task = service.createTask({ name: 'Moved task', kind: 'task', categoryId: category.id })
    const entry = service.manualEntry({
      taskId: task.id,
      startedAt: '2026-06-01T01:00:00.000Z',
      endedAt: '2026-06-01T02:30:00.000Z',
      log: 'Historical work',
    })

    service.updateTask({ id: task.id, parentId: firstProject.id, categoryId: null })
    service.archiveTask(task.id)
    expect(service.listTasks().tasks.find((item) => item.id === firstProject.id)?.totalSeconds).toBe(90 * 60)
    expect(service.entriesByTask(firstProject.id).map((item) => item.id)).toContain(entry.id)

    const movedToSecondProject = service.updateTask({ id: task.id, parentId: secondProject.id, categoryId: null })
    expect(movedToSecondProject.kind).toBe('project_task')
    expect(service.listTasks().tasks.find((item) => item.id === firstProject.id)?.totalSeconds).toBe(0)
    expect(service.listTasks().tasks.find((item) => item.id === secondProject.id)?.totalSeconds).toBe(90 * 60)

    const movedToCategory = service.updateTask({ id: task.id, parentId: null, categoryId: category.id })
    expect(movedToCategory.kind).toBe('task')
    expect(movedToCategory.categoryId).toBe(category.id)
    expect(service.listTasks().tasks.find((item) => item.id === secondProject.id)?.totalSeconds).toBe(0)
    expect(service.entriesByTask(task.id).map((item) => item.id)).toContain(entry.id)
  })

  it('clears legacy project categories during database startup migration', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'focus-journal-migration-'))
    const dbPath = join(dir, 'test.sqlite')
    const paths = { dbPath, backupDir: join(dir, 'backups'), exportDir: join(dir, 'exports') }
    const db = await openDatabase(dbPath)
    const service = new FocusJournalService(db, paths)
    const category = service.createCategory({ name: 'Legacy category' })
    const project = service.createTask({ name: 'Legacy project', kind: 'project' })
    const child = service.createTask({ name: 'Legacy project task', kind: 'project_task', parentId: project.id })
    service.manualEntry({
      taskId: child.id,
      startedAt: '2026-06-01T01:00:00.000Z',
      endedAt: '2026-06-01T02:00:00.000Z',
    })
    db.prepare('UPDATE tasks SET category_id = ? WHERE id IN (?, ?)').run(category.id, project.id, child.id)

    const migrated = new FocusJournalService(await openDatabase(dbPath), paths)
    const tasks = migrated.listTasks().tasks

    expect(tasks.find((item) => item.id === project.id)?.categoryId).toBeNull()
    expect(tasks.find((item) => item.id === child.id)).toMatchObject({
      categoryId: null,
      parentId: project.id,
      kind: 'project_task',
      totalSeconds: 3600,
    })
    expect(migrated.entriesByTask(child.id)).toHaveLength(1)
  })

  it('does not allow time entries directly on a project', async () => {
    const service = await createService()
    const project = service.createTask({ name: 'Container project', kind: 'project' })

    expect(() => service.startTimer(project.id)).toThrow('项目不能直接开始计时')
    expect(() => service.manualEntry({
      taskId: project.id,
      startedAt: '2026-06-01T01:00:00.000Z',
      endedAt: '2026-06-01T02:00:00.000Z',
    })).toThrow('项目不能直接补录时间')
    expect(service.entriesByTask(project.id)).toHaveLength(0)
  })

  it('clears the active timer when ending a record', async () => {
    const service = await createService()
    const task = service.createTask({ name: 'Record task', kind: 'task' })

    service.startTimer(task.id)
    const entry = service.endTimer('')

    expect(entry?.taskId).toBe(task.id)
    expect(service.getCurrentTimer()).toBeNull()
    expect(service.entriesByTask(task.id)).toHaveLength(1)
  })

  it('rejects manual entries with an invalid range', async () => {
    const service = await createService()
    const task = service.createTask({ name: 'Manual task', kind: 'task' })

    expect(() => service.manualEntry({
      taskId: task.id,
      startedAt: '2026-06-01T02:00:00.000Z',
      endedAt: '2026-06-01T01:00:00.000Z',
    })).toThrow()
  })

  it('updates and deletes time entries', async () => {
    const service = await createService()
    const task = service.createTask({ name: 'Editable entry task', kind: 'task' })
    const entry = service.manualEntry({
      taskId: task.id,
      startedAt: '2026-06-01T01:00:00.000Z',
      endedAt: '2026-06-01T02:00:00.000Z',
      log: 'Before edit',
    })

    const updated = service.updateEntry({
      id: entry.id,
      startedAt: '2026-06-01T01:15:00.000Z',
      endedAt: '2026-06-01T03:00:00.000Z',
      log: 'After edit',
    })

    expect(updated.durationSeconds).toBe(105 * 60)
    expect(updated.log).toBe('After edit')

    service.removeEntry(entry.id)

    expect(service.entriesByTask(task.id)).toHaveLength(0)
  })

  it('creates backups and exports', async () => {
    const service = await createService()
    const backup = service.backupNow('test')
    const exported = service.exportData('json')

    expect(backup.path.endsWith('test-focus-journal.sqlite')).toBe(true)
    expect(exported.path.endsWith('.json')).toBe(true)
  })
})
