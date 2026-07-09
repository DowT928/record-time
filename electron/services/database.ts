import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import initSqlJs from 'sql.js'

type SqlValue = string | number | Uint8Array | null
type SqlParams = SqlValue[]

type SqlJsStatement = {
  bind: (values?: SqlParams) => boolean
  step: () => boolean
  getAsObject: () => Record<string, SqlValue>
  free: () => void
}

type SqlJsDatabase = {
  exec: (sql: string) => unknown[]
  run: (sql: string, params?: SqlParams) => void
  prepare: (sql: string) => SqlJsStatement
  export: () => Uint8Array
}

type SqlJsStatic = {
  Database: new (data?: Uint8Array) => SqlJsDatabase
}

type RunResult = {
  lastInsertRowid: number
  changes: number
}

export class Db {
  private readonly database: SqlJsDatabase
  private readonly dbPath: string

  constructor(database: SqlJsDatabase, dbPath: string) {
    this.database = database
    this.dbPath = dbPath
  }

  exec(sql: string): void {
    this.database.exec(sql)
    this.persist()
  }

  prepare(sql: string): PreparedStatement {
    return new PreparedStatement(this.database, sql, () => this.persist())
  }

  persist(): void {
    writeFileSync(this.dbPath, Buffer.from(this.database.export()))
  }
}

class PreparedStatement {
  private readonly database: SqlJsDatabase
  private readonly sql: string
  private readonly persist: () => void

  constructor(database: SqlJsDatabase, sql: string, persist: () => void) {
    this.database = database
    this.sql = sql
    this.persist = persist
  }

  get(...params: SqlValue[]): Record<string, SqlValue> | undefined {
    const statement = this.database.prepare(this.sql)
    try {
      statement.bind(params)
      return statement.step() ? statement.getAsObject() : undefined
    } finally {
      statement.free()
    }
  }

  all(...params: SqlValue[]): Record<string, SqlValue>[] {
    const statement = this.database.prepare(this.sql)
    const rows: Record<string, SqlValue>[] = []
    try {
      statement.bind(params)
      while (statement.step()) {
        rows.push(statement.getAsObject())
      }
      return rows
    } finally {
      statement.free()
    }
  }

  run(...params: SqlValue[]): RunResult {
    this.database.run(this.sql, params)
    const lastInsertRowid = readNumber(this.database, 'SELECT last_insert_rowid() AS value')
    const changes = readNumber(this.database, 'SELECT changes() AS value')
    this.persist()
    return { lastInsertRowid, changes }
  }
}

export async function openDatabase(dbPath: string): Promise<Db> {
  const folder = dirname(dbPath)
  if (!existsSync(folder)) {
    mkdirSync(folder, { recursive: true })
  }

  const require = createRequire(import.meta.url)
  const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
  const SQL = await initSqlJs({
    locateFile: (file: string) => join(dirname(wasmPath), file),
  }) as SqlJsStatic

  const data = existsSync(dbPath) ? readFileSync(dbPath) : undefined
  const db = new Db(new SQL.Database(data), dbPath)
  db.prepare('PRAGMA foreign_keys = ON').run()
  migrate(db)
  seedDefaults(db)
  db.persist()
  return db
}

function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#3f6f68',
      archived INTEGER NOT NULL DEFAULT 0,
      user_id TEXT,
      sync_status TEXT NOT NULL DEFAULT 'local',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      parent_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('task', 'project', 'project_task')),
      color TEXT NOT NULL DEFAULT '#3f6f68',
      archived INTEGER NOT NULL DEFAULT 0,
      archive_review TEXT NOT NULL DEFAULT '',
      habit_target_minutes INTEGER,
      user_id TEXT,
      sync_status TEXT NOT NULL DEFAULT 'local',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS time_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      log TEXT NOT NULL DEFAULT '',
      is_manual INTEGER NOT NULL DEFAULT 0,
      user_id TEXT,
      sync_status TEXT NOT NULL DEFAULT 'local',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS timer_sessions (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('running', 'paused')),
      started_at TEXT NOT NULL,
      active_started_at TEXT,
      accumulated_seconds INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
    CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id);
    CREATE INDEX IF NOT EXISTS idx_time_entries_started ON time_entries(started_at);
  `)
  ensureColumn(db, 'tasks', 'archive_review', "TEXT NOT NULL DEFAULT ''")
}

function ensureColumn(db: Db, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (columns.some((item) => item.name === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

function seedDefaults(db: Db): void {
  const now = new Date().toISOString()
  const categoryCount = db.prepare('SELECT COUNT(*) AS count FROM categories').get() as { count: number }
  if (categoryCount.count === 0) {
    const insertCategory = db.prepare(`
      INSERT INTO categories (name, color, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `)
    insertCategory.run('学习', '#3f6f68', now, now)
    insertCategory.run('开发', '#8a5a44', now, now)
    insertCategory.run('生活', '#6c6f2f', now, now)
  }

  const taskCount = db.prepare('SELECT COUNT(*) AS count FROM tasks').get() as { count: number }
  if (taskCount.count === 0) {
    const learning = db.prepare('SELECT id FROM categories WHERE name = ?').get('学习') as { id: number }
    const dev = db.prepare('SELECT id FROM categories WHERE name = ?').get('开发') as { id: number }
    const insertTask = db.prepare(`
      INSERT INTO tasks (category_id, parent_id, name, kind, color, habit_target_minutes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    insertTask.run(learning.id, null, '算法刷题', 'task', '#3f6f68', 30, now, now)
    insertTask.run(learning.id, null, '阅读', 'task', '#6c6f2f', null, now, now)
    const project = insertTask.run(dev.id, null, 'Focus Journal', 'project', '#8a5a44', null, now, now)
    insertTask.run(dev.id, Number(project.lastInsertRowid), 'MVP 开发', 'project_task', '#8a5a44', null, now, now)
  }

  const defaults = new Map<string, string>([
    ['backupFrequency', 'daily'],
    ['remindersEnabled', 'false'],
    ['habitReminders', 'false'],
    ['longFocusReminder', 'false'],
    ['sedentaryReminder', 'false'],
    ['dailyReviewReminder', 'false'],
    ['lastBackupAt', ''],
  ])

  const insertSetting = db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)')
  for (const [key, value] of defaults) {
    insertSetting.run(key, value)
  }
}

function readNumber(database: SqlJsDatabase, sql: string): number {
  const statement = database.prepare(sql)
  try {
    statement.step()
    const value = statement.getAsObject().value
    return typeof value === 'number' ? value : Number(value ?? 0)
  } finally {
    statement.free()
  }
}
