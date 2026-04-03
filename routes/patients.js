const express = require('express');
const router = express.Router();
const db = require('../db/database');

// List / search patients
router.get('/', (req, res) => {
  const { q } = req.query;
  let stmt;
  if (q) {
    stmt = db.prepare(
      `SELECT * FROM patients WHERE last_name LIKE ? OR first_name LIKE ? ORDER BY last_name, first_name`
    );
    const search = `%${q}%`;
    res.json(stmt.all(search, search));
  } else {
    stmt = db.prepare('SELECT * FROM patients ORDER BY last_name, first_name');
    res.json(stmt.all());
  }
});

// Get single patient
router.get('/:id', (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Patient non trouvé' });
  res.json(patient);
});

// Create patient
router.post('/', (req, res) => {
  const { last_name, first_name, notes } = req.body;
  if (!last_name || !first_name) {
    return res.status(400).json({ error: 'Nom et prénom requis' });
  }
  const result = db.prepare(
    'INSERT INTO patients (last_name, first_name, notes) VALUES (?, ?, ?)'
  ).run(last_name.toUpperCase(), first_name, notes || null);
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(patient);
});

// Update patient
router.put('/:id', (req, res) => {
  const { last_name, first_name, notes } = req.body;
  const existing = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Patient non trouvé' });

  db.prepare(
    'UPDATE patients SET last_name = ?, first_name = ?, notes = ? WHERE id = ?'
  ).run(
    last_name ? last_name.toUpperCase() : existing.last_name,
    first_name || existing.first_name,
    notes !== undefined ? notes : existing.notes,
    req.params.id
  );
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  res.json(patient);
});

// Delete patient
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Patient non trouvé' });

  // Check if patient has sessions
  const sessionCount = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE patient_id = ?').get(req.params.id);
  if (sessionCount.count > 0) {
    return res.status(400).json({ error: 'Impossible de supprimer un patient avec des séances planifiées' });
  }

  db.prepare('DELETE FROM patients WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
