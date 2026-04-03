const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { stringify } = require('csv-stringify/sync');
const PDFDocument = require('pdfkit');

const CANCEL_REASONS_FR = {
  medical: 'Raison médicale',
  patient_absence: 'Absence patient',
  staff_absence: 'Absence personnel'
};

const SLOT_LABELS = { 1: '6h', 2: '11h', 3: '17h' };
const TYPE_LABELS = { isolee: 'Isolée', tandem: 'Tandem' };

// CSV export
router.get('/csv', (req, res) => {
  const { month, year } = req.query;
  let prefix, filename;
  if (month) {
    prefix = `${month}%`;
    filename = `planning-${month}.csv`;
  } else if (year) {
    prefix = `${year}%`;
    filename = `planning-${year}.csv`;
  } else {
    return res.status(400).json({ error: 'Paramètre month ou year requis' });
  }

  const sessions = db.prepare(`
    SELECT s.date, s.slot, s.position, s.type, s.cancelled, s.cancel_reason, s.cancel_comment,
           p.last_name, p.first_name
    FROM sessions s JOIN patients p ON s.patient_id = p.id
    WHERE s.date LIKE ?
    ORDER BY s.date, s.slot, s.position
  `).all(prefix);

  const rows = sessions.map(s => ({
    Date: s.date,
    Créneau: SLOT_LABELS[s.slot] || s.slot,
    Position: s.position,
    Patient: `${s.last_name} ${s.first_name}`,
    Type: TYPE_LABELS[s.type] || s.type,
    Statut: s.cancelled ? 'Annulée' : 'Réalisée',
    'Raison annulation': s.cancelled ? (CANCEL_REASONS_FR[s.cancel_reason] || '') : '',
    Commentaire: s.cancel_comment || ''
  }));

  const csv = stringify(rows, { header: true, delimiter: ';' });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=\"${filename}\"`);
  // BOM for Excel UTF-8
  res.send('\ufeff' + csv);
});

// PDF export
router.get('/pdf', (req, res) => {
  const { month, year } = req.query;
  let prefix, title;
  if (month) {
    prefix = `${month}%`;
    const [y, m] = month.split('-');
    const MOIS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    title = `Planning Rhéophérèse - ${MOIS[parseInt(m)]} ${y}`;
  } else if (year) {
    prefix = `${year}%`;
    title = `Bilan Rhéophérèse - Année ${year}`;
  } else {
    return res.status(400).json({ error: 'Paramètre month ou year requis' });
  }

  const sessions = db.prepare(`
    SELECT s.date, s.slot, s.position, s.type, s.cancelled, s.cancel_reason, s.cancel_comment,
           p.last_name, p.first_name
    FROM sessions s JOIN patients p ON s.patient_id = p.id
    WHERE s.date LIKE ?
    ORDER BY s.date, s.slot, s.position
  `).all(prefix);

  // Analytics
  const total = sessions.length;
  const active = sessions.filter(s => !s.cancelled).length;
  const cancelled = sessions.filter(s => s.cancelled).length;
  const tandem = sessions.filter(s => s.type === 'tandem').length;
  const isolee = sessions.filter(s => s.type === 'isolee').length;
  const cancelMedical = sessions.filter(s => s.cancelled && s.cancel_reason === 'medical').length;
  const cancelPatient = sessions.filter(s => s.cancelled && s.cancel_reason === 'patient_absence').length;
  const cancelStaff = sessions.filter(s => s.cancelled && s.cancel_reason === 'staff_absence').length;

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=\"planning-${month || year}.pdf\"`);
  doc.pipe(res);

  // Title
  doc.fontSize(18).text(title, { align: 'center' });
  doc.moveDown();

  // Summary
  doc.fontSize(12);
  doc.text(`Séances totales: ${total}  |  Réalisées: ${active}  |  Annulées: ${cancelled}`);
  doc.text(`Tandem: ${tandem}  |  Isolées: ${isolee}`);
  doc.text(`Annulations - Médicale: ${cancelMedical}  |  Abs. patient: ${cancelPatient}  |  Abs. personnel: ${cancelStaff}`);
  if (total > 0) {
    doc.text(`Taux d'annulation: ${((cancelled / total) * 100).toFixed(1)}%`);
  }
  doc.moveDown();

  // Table
  const colWidths = [80, 50, 35, 140, 60, 60, 120, 150];
  const headers = ['Date', 'Créneau', 'Pos.', 'Patient', 'Type', 'Statut', 'Raison ann.', 'Commentaire'];
  const startX = 40;
  let y = doc.y;

  // Header row
  doc.fontSize(9).font('Helvetica-Bold');
  let x = startX;
  headers.forEach((h, i) => {
    doc.text(h, x, y, { width: colWidths[i], align: 'left' });
    x += colWidths[i];
  });
  y += 15;
  doc.moveTo(startX, y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y).stroke();
  y += 5;

  // Data rows
  doc.font('Helvetica').fontSize(8);
  sessions.forEach(s => {
    if (y > 540) {
      doc.addPage();
      y = 40;
    }
    x = startX;
    const row = [
      s.date,
      SLOT_LABELS[s.slot],
      String(s.position),
      `${s.last_name} ${s.first_name}`,
      TYPE_LABELS[s.type],
      s.cancelled ? 'Annulée' : 'Réalisée',
      s.cancelled ? (CANCEL_REASONS_FR[s.cancel_reason] || '') : '',
      s.cancel_comment || ''
    ];
    row.forEach((cell, i) => {
      doc.text(cell, x, y, { width: colWidths[i], align: 'left' });
      x += colWidths[i];
    });
    y += 13;
  });

  doc.end();
});

// Lines export
router.get('/lines-csv', (req, res) => {
  const { year } = req.query;
  let lines;
  if (year) {
    lines = db.prepare(`
      SELECT * FROM lines WHERE placement_date LIKE ? OR disposal_date LIKE ?
      ORDER BY placement_date
    `).all(`${year}%`, `${year}%`);
  } else {
    lines = db.prepare('SELECT * FROM lines ORDER BY placement_date').all();
  }

  const rows = lines.map(l => ({
    'Libellé': l.label,
    'Date de pose': l.placement_date,
    'Date de retrait': l.disposal_date || '',
    'Raison de retrait': l.disposal_reason || '',
    Notes: l.notes || ''
  }));

  const csv = stringify(rows, { header: true, delimiter: ';' });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=\"lignes-${year || 'all'}.csv\"`);
  res.send('\ufeff' + csv);
});

module.exports = router;
