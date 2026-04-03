const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Get sessions for a month
router.get('/', (req, res) => {
  const { month } = req.query; // format: YYYY-MM
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Paramètre month requis (format: YYYY-MM)' });
  }
  const stmt = db.prepare(`
    SELECT s.*, p.last_name, p.first_name
    FROM sessions s
    JOIN patients p ON s.patient_id = p.id
    WHERE s.date LIKE ?
    ORDER BY s.date, s.slot, s.position
  `);
  res.json(stmt.all(`${month}%`));
});

// Create session
router.post('/', (req, res) => {
  const { patient_id, date, slot, position, type } = req.body;

  // Validate day is not Sunday
  const dayOfWeek = new Date(date).getDay();
  if (dayOfWeek === 0) {
    return res.status(400).json({ error: 'Pas de séance le dimanche' });
  }

  // Validate slot and position
  if (![1, 2, 3].includes(slot) || ![1, 2].includes(position)) {
    return res.status(400).json({ error: 'Créneau ou position invalide' });
  }

  // Check if position is already taken
  const existing = db.prepare(
    'SELECT id FROM sessions WHERE date = ? AND slot = ? AND position = ?'
  ).get(date, slot, position);
  if (existing) {
    return res.status(409).json({ error: 'Cette position est déjà occupée' });
  }

  // Validate patient exists
  const patient = db.prepare('SELECT id FROM patients WHERE id = ?').get(patient_id);
  if (!patient) {
    return res.status(400).json({ error: 'Patient non trouvé' });
  }

  const result = db.prepare(
    'INSERT INTO sessions (patient_id, date, slot, position, type) VALUES (?, ?, ?, ?, ?)'
  ).run(patient_id, date, slot, position, type || 'isolee');

  const session = db.prepare(`
    SELECT s.*, p.last_name, p.first_name
    FROM sessions s JOIN patients p ON s.patient_id = p.id
    WHERE s.id = ?
  `).get(result.lastInsertRowid);

  // Broadcast to connected clients
  const io = req.app.get('io');
  const monthKey = date.substring(0, 7);
  io.to(monthKey).emit('session:created', session);

  res.status(201).json(session);
});

// Update session (move, change type)
router.put('/:id', (req, res) => {
  const { date, slot, position, type, patient_id } = req.body;
  const existing = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Séance non trouvée' });

  const newDate = date || existing.date;
  const newSlot = slot || existing.slot;
  const newPosition = position || existing.position;
  const newType = type || existing.type;
  const newPatientId = patient_id || existing.patient_id;

  // Check if new position is taken by another session
  if (newDate !== existing.date || newSlot !== existing.slot || newPosition !== existing.position) {
    const conflict = db.prepare(
      'SELECT id FROM sessions WHERE date = ? AND slot = ? AND position = ? AND id != ?'
    ).get(newDate, newSlot, newPosition, req.params.id);
    if (conflict) {
      return res.status(409).json({ error: 'Cette position est déjà occupée' });
    }
  }

  db.prepare(`
    UPDATE sessions SET patient_id = ?, date = ?, slot = ?, position = ?, type = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(newPatientId, newDate, newSlot, newPosition, newType, req.params.id);

  const session = db.prepare(`
    SELECT s.*, p.last_name, p.first_name
    FROM sessions s JOIN patients p ON s.patient_id = p.id
    WHERE s.id = ?
  `).get(req.params.id);

  const io = req.app.get('io');
  const oldMonth = existing.date.substring(0, 7);
  const newMonth = newDate.substring(0, 7);
  io.to(oldMonth).emit('session:updated', session);
  if (oldMonth !== newMonth) {
    io.to(newMonth).emit('session:updated', session);
  }

  res.json(session);
});

// Cancel session
router.put('/:id/cancel', (req, res) => {
  const { cancel_reason, cancel_comment } = req.body;
  if (!cancel_reason || !['medical', 'patient_absence', 'staff_absence'].includes(cancel_reason)) {
    return res.status(400).json({ error: 'Raison d\'annulation invalide' });
  }

  const existing = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Séance non trouvée' });

  db.prepare(`
    UPDATE sessions SET cancelled = 1, cancel_reason = ?, cancel_comment = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(cancel_reason, cancel_comment || null, req.params.id);

  const session = db.prepare(`
    SELECT s.*, p.last_name, p.first_name
    FROM sessions s JOIN patients p ON s.patient_id = p.id
    WHERE s.id = ?
  `).get(req.params.id);

  const io = req.app.get('io');
  io.to(existing.date.substring(0, 7)).emit('session:updated', session);

  res.json(session);
});

// Restore cancelled session
router.put('/:id/restore', (req, res) => {
  const existing = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Séance non trouvée' });

  db.prepare(`
    UPDATE sessions SET cancelled = 0, cancel_reason = NULL, cancel_comment = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(req.params.id);

  const session = db.prepare(`
    SELECT s.*, p.last_name, p.first_name
    FROM sessions s JOIN patients p ON s.patient_id = p.id
    WHERE s.id = ?
  `).get(req.params.id);

  const io = req.app.get('io');
  io.to(existing.date.substring(0, 7)).emit('session:updated', session);

  res.json(session);
});

// Delete session
router.delete('/:id', (req, res) => {
  const existing = db.prepare(`
    SELECT s.*, p.last_name, p.first_name
    FROM sessions s JOIN patients p ON s.patient_id = p.id
    WHERE s.id = ?
  `).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Séance non trouvée' });

  db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);

  const io = req.app.get('io');
  io.to(existing.date.substring(0, 7)).emit('session:deleted', existing);

  res.json({ success: true });
});

module.exports = router;
