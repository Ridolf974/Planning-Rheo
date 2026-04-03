const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Monthly analytics
router.get('/monthly', (req, res) => {
  const { month } = req.query; // YYYY-MM
  if (!month) return res.status(400).json({ error: 'Paramètre month requis' });

  const prefix = `${month}%`;

  const total = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE date LIKE ?').get(prefix).count;
  const tandem = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE date LIKE ? AND type = ?').get(prefix, 'tandem').count;
  const isolee = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE date LIKE ? AND type = ?').get(prefix, 'isolee').count;
  const cancelled = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE date LIKE ? AND cancelled = 1').get(prefix).count;
  const active = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE date LIKE ? AND cancelled = 0').get(prefix).count;

  const cancelByReason = db.prepare(`
    SELECT cancel_reason, COUNT(*) as count FROM sessions
    WHERE date LIKE ? AND cancelled = 1
    GROUP BY cancel_reason
  `).all(prefix);

  const cancelReasons = { medical: 0, patient_absence: 0, staff_absence: 0 };
  cancelByReason.forEach(r => { cancelReasons[r.cancel_reason] = r.count; });

  // Unique patients
  const patients = db.prepare('SELECT COUNT(DISTINCT patient_id) as count FROM sessions WHERE date LIKE ?').get(prefix).count;

  // Sessions per day
  const perDay = db.prepare(`
    SELECT date, COUNT(*) as total,
      SUM(CASE WHEN cancelled = 0 THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN cancelled = 1 THEN 1 ELSE 0 END) as cancelled_count
    FROM sessions WHERE date LIKE ?
    GROUP BY date ORDER BY date
  `).all(prefix);

  // Occupation rate
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  let workDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, mon - 1, d).getDay();
    if (dow !== 0) workDays++; // Mon-Sat
  }
  const maxSessions = workDays * 6; // 3 slots * 2 positions
  const occupationRate = maxSessions > 0 ? ((active / maxSessions) * 100).toFixed(1) : 0;

  // Cancellation rate
  const cancelRate = total > 0 ? ((cancelled / total) * 100).toFixed(1) : 0;

  res.json({
    total, tandem, isolee, cancelled, active, patients,
    cancelReasons, perDay,
    maxSessions, occupationRate: parseFloat(occupationRate),
    cancelRate: parseFloat(cancelRate)
  });
});

// Yearly analytics
router.get('/yearly', (req, res) => {
  const { year } = req.query;
  if (!year) return res.status(400).json({ error: 'Paramètre year requis' });

  const prefix = `${year}%`;

  const total = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE date LIKE ?').get(prefix).count;
  const tandem = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE date LIKE ? AND type = ?').get(prefix, 'tandem').count;
  const isolee = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE date LIKE ? AND type = ?').get(prefix, 'isolee').count;
  const cancelled = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE date LIKE ? AND cancelled = 1').get(prefix).count;
  const active = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE date LIKE ? AND cancelled = 0').get(prefix).count;
  const patients = db.prepare('SELECT COUNT(DISTINCT patient_id) as count FROM sessions WHERE date LIKE ?').get(prefix).count;

  const cancelByReason = db.prepare(`
    SELECT cancel_reason, COUNT(*) as count FROM sessions
    WHERE date LIKE ? AND cancelled = 1
    GROUP BY cancel_reason
  `).all(prefix);

  const cancelReasons = { medical: 0, patient_absence: 0, staff_absence: 0 };
  cancelByReason.forEach(r => { cancelReasons[r.cancel_reason] = r.count; });

  // Per month breakdown
  const perMonth = db.prepare(`
    SELECT substr(date, 1, 7) as month,
      COUNT(*) as total,
      SUM(CASE WHEN cancelled = 0 THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN cancelled = 1 THEN 1 ELSE 0 END) as cancelled_count,
      SUM(CASE WHEN type = 'tandem' THEN 1 ELSE 0 END) as tandem,
      SUM(CASE WHEN type = 'isolee' THEN 1 ELSE 0 END) as isolee
    FROM sessions WHERE date LIKE ?
    GROUP BY substr(date, 1, 7) ORDER BY month
  `).all(prefix);

  const cancelRate = total > 0 ? ((cancelled / total) * 100).toFixed(1) : 0;

  res.json({
    total, tandem, isolee, cancelled, active, patients,
    cancelReasons, perMonth,
    cancelRate: parseFloat(cancelRate)
  });
});

module.exports = router;
