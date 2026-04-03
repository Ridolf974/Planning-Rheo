CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  last_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK(slot IN (1, 2, 3)),
  position INTEGER NOT NULL CHECK(position IN (1, 2)),
  type TEXT NOT NULL CHECK(type IN ('isolee', 'tandem')),
  cancelled INTEGER DEFAULT 0,
  cancel_reason TEXT CHECK(cancel_reason IN ('medical', 'patient_absence', 'staff_absence')),
  cancel_comment TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  UNIQUE(date, slot, position)
);

CREATE TABLE IF NOT EXISTS lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  placement_date TEXT NOT NULL,
  disposal_date TEXT,
  disposal_reason TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
CREATE INDEX IF NOT EXISTS idx_sessions_patient ON sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date_slot ON sessions(date, slot);
CREATE INDEX IF NOT EXISTS idx_lines_placement ON lines(placement_date);
