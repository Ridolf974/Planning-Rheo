const express = require('express');
const router = express.Router();
const db = require('../db/database');

// List all lines
router.get('/', (req, res) => {
  const { year } = req.query;
  let stmt;
  if (year) {
    stmt = db.prepare(`
      SELECT * FROM lines
      WHERE placement_date LIKE ? OR disposal_date LIKE ?
      ORDER BY placement_date DESC
    `);
    res.json(stmt.all(`${year}%`, `${year}%`));
  } else {
    stmt = db.prepare('SELECT * FROM lines ORDER BY placement_date DESC');
    res.json(stmt.all());
  }
});

// Create line
router.post('/', (req, res) => {
  const { label, placement_date, notes } = req.body;
  if (!label || !placement_date) {
    return res.status(400).json({ error: 'Libellé et date de pose requis' });
  }
  const result = db.prepare(
    'INSERT INTO lines (label, placement_date, notes) VALUES (?, ?, ?)'
  ).run(label, placement_date, notes || null);
  const line = db.prepare('SELECT * FROM lines WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(line);
});

// Update line (dispose)
router.put('/:id', (req, res) => {
  const { label, placement_date, disposal_date, disposal_reason, notes } = req.body;
  const existing = db.prepare('SELECT * FROM lines WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Ligne non trouvée' });

  db.prepare(`
    UPDATE lines SET label = ?, placement_date = ?, disposal_date = ?, disposal_reason = ?, notes = ?
    WHERE id = ?
  `).run(
    label || existing.label,
    placement_date || existing.placement_date,
    disposal_date !== undefined ? disposal_date : existing.disposal_date,
    disposal_reason !== undefined ? disposal_reason : existing.disposal_reason,
    notes !== undefined ? notes : existing.notes,
    req.params.id
  );

  const line = db.prepare('SELECT * FROM lines WHERE id = ?').get(req.params.id);
  res.json(line);
});

// Delete line
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM lines WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Ligne non trouvée' });
  db.prepare('DELETE FROM lines WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
