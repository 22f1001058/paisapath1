// SQLite via node:sqlite (stdlib, Node >= 22.5). No ORM, no migration tool.
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(join(root, 'data'), { recursive: true })

export const db = new DatabaseSync(join(root, 'data', 'paisapath.db'))
db.exec('PRAGMA journal_mode = WAL')

db.exec(`
CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT, stage TEXT, city TEXT,
  monthly_income INTEGER, pay_day INTEGER,
  dependents INTEGER DEFAULT 0,
  risk TEXT DEFAULT 'balanced',
  started_at TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY, name TEXT, institution TEXT,
  kind TEXT,            -- bank | savings | upi | card | invest
  balance INTEGER, synced_at TEXT, masked TEXT
);

CREATE TABLE IF NOT EXISTS txns (
  id TEXT PRIMARY KEY, date TEXT, merchant TEXT,
  amount INTEGER,       -- paise-free rupees; negative = money out
  category TEXT, method TEXT, account_id TEXT,
  source TEXT DEFAULT 'seed',   -- seed | ai | user
  note TEXT
);
CREATE INDEX IF NOT EXISTS txns_date ON txns(date);

CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY, name TEXT, amount INTEGER,
  due_day INTEGER, autopay INTEGER DEFAULT 0, category TEXT
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY, name TEXT, kind TEXT,   -- emergency | goal
  target INTEGER, saved INTEGER, target_date TEXT,
  priority INTEGER DEFAULT 5, emoji TEXT
);

CREATE TABLE IF NOT EXISTS budget (
  id TEXT PRIMARY KEY, category TEXT,
  amount INTEGER, bucket TEXT,   -- fixed | flexible | future
  month TEXT, origin TEXT        -- ai | rule | user
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT, kind TEXT, title TEXT, body TEXT
);

-- Every AI invocation is logged. The Trust Centre reads straight from here.
CREATE TABLE IF NOT EXISTS ai_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT, provider TEXT, model TEXT, task TEXT,
  ms INTEGER, ok INTEGER, fallback INTEGER,
  shared TEXT,          -- human-readable list of what left the device
  error TEXT
);

CREATE TABLE IF NOT EXISTS cache (
  k TEXT PRIMARY KEY, v TEXT, ts TEXT
);

CREATE TABLE IF NOT EXISTS chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT, role TEXT, content TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  k TEXT PRIMARY KEY, v TEXT
);

-- Dismissals are keyed by the nudge's own stable id, so a nudge that is dismissed
-- stays dismissed even as the list around it changes.
CREATE TABLE IF NOT EXISTS nudge_dismissed (
  id TEXT PRIMARY KEY, ts TEXT
);
`)

// Added after the first release; ALTER is the whole migration story here.
// The ALTER only succeeds once, on a database created before onboarding existed —
// and a profile that predates the feature has already been set up by definition,
// so backfill it rather than dumping an existing user into a first-run wizard.
try {
  db.exec('ALTER TABLE profile ADD COLUMN onboarded INTEGER DEFAULT 0')
  db.exec('UPDATE profile SET onboarded = 1')
} catch { /* column already present — nothing to migrate */ }

// The questionnaire's raw answers are kept so a profile can always be re-derived
// and re-explained. Storing only the verdict would make it unauditable.
try { db.exec('ALTER TABLE profile ADD COLUMN answers TEXT') } catch { /* present */ }
try { db.exec('ALTER TABLE profile ADD COLUMN profile_key TEXT') } catch { /* present */ }

// Providers stopped being a fixed list of three CLIs; "which engine" is now
// "which provider, running which model", and the Trust Centre shows both.
try { db.exec('ALTER TABLE ai_log ADD COLUMN model TEXT') } catch { /* present */ }

export const all = (sql, ...p) => db.prepare(sql).all(...p)
export const one = (sql, ...p) => db.prepare(sql).get(...p)
export const run = (sql, ...p) => db.prepare(sql).run(...p)

export function getSetting(k, fallback) {
  const r = one('SELECT v FROM settings WHERE k = ?', k)
  return r ? JSON.parse(r.v) : fallback
}

export function setSetting(k, v) {
  run('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, JSON.stringify(v))
  return v
}

export function logEvent(kind, title, body = '') {
  run('INSERT INTO events (ts, kind, title, body) VALUES (?, ?, ?, ?)', new Date().toISOString(), kind, title, body)
}
