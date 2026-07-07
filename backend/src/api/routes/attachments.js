const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../../db');

const UPLOAD_DIR = path.join(__dirname, '../../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = crypto.randomBytes(16).toString('hex');
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

const router = express.Router();

router.get('/', (req, res) => {
  const { stock_id, industry_id } = req.query;
  let rows;
  if (stock_id) rows = db.prepare(`SELECT * FROM attachments WHERE stock_id = ? ORDER BY uploaded_at DESC`).all(stock_id);
  else if (industry_id) rows = db.prepare(`SELECT * FROM attachments WHERE industry_id = ? ORDER BY uploaded_at DESC`).all(industry_id);
  else rows = db.prepare(`SELECT * FROM attachments ORDER BY uploaded_at DESC`).all();
  res.json(rows);
});

router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  const { stock_id, industry_id } = req.body;
  if (!stock_id && !industry_id) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'stock_id or industry_id is required' });
  }
  const result = db.prepare(
    `INSERT INTO attachments (stock_id, industry_id, filename, original_name, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(stock_id || null, industry_id || null, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size);
  res.status(201).json(db.prepare(`SELECT * FROM attachments WHERE id = ?`).get(result.lastInsertRowid));
});

router.get('/:id/download', (req, res) => {
  const row = db.prepare(`SELECT * FROM attachments WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Attachment not found' });
  res.download(path.join(UPLOAD_DIR, row.filename), row.original_name);
});

router.delete('/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM attachments WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Attachment not found' });
  db.prepare(`DELETE FROM attachments WHERE id = ?`).run(req.params.id);
  fs.unlink(path.join(UPLOAD_DIR, row.filename), () => {});
  res.status(204).end();
});

module.exports = router;
