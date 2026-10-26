/**
 * trafficGuardBackend.js — Express Router for TrafficGuard
 * Mounts at `/api/traffic`
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const trafficDb = require('./trafficDb');
const trafficVision = require('./trafficVision');

// Setup multer storage for incoming traffic media
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, trafficVision.UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `traffic_${Date.now()}_${safeBase}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit for video/photo
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|webp|mp4|webm|mov|avi|mkv)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Format file tidak didukung. Gunakan JPG, PNG, WEBP, MP4, atau WEBM.'));
    }
  }
});

/**
 * Health & MongoDB connection check
 */
router.get('/status', async (req, res) => {
  try {
    const status = await trafficDb.getDbStatus();
    res.json({
      success: true,
      service: 'TrafficGuard AI & Transit Vision',
      version: '2.0.0',
      database: status
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Summary statistics for dashboard widgets & charts
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await trafficDb.getTrafficStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Get paginated & filtered traffic logs
 */
router.get('/logs', async (req, res) => {
  try {
    const { limit = 50, skip = 0, vehicleType, timeOfDay, searchPlate } = req.query;
    const result = await trafficDb.getTrafficLogs({
      limit: parseInt(limit, 10),
      skip: parseInt(skip, 10),
      vehicleType,
      timeOfDay,
      searchPlate
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Save single detection record to MongoDB Atlas
 */
router.post('/log', async (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.vehicleType) {
      return res.status(400).json({ success: false, error: 'Field vehicleType wajib diisi' });
    }
    const saved = await trafficDb.saveTrafficLog(data);
    res.status(201).json({ success: true, message: 'Log berhasil disimpan', data: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Save multiple detection records in batch (e.g. from photo or video session)
 */
router.post('/batch', async (req, res) => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, error: 'Array records kosong atau tidak valid' });
    }
    const saved = await trafficDb.saveTrafficBatch(records);
    res.status(201).json({
      success: true,
      message: `${saved.insertedCount} deteksi berhasil disimpan ke MongoDB Atlas`,
      data: saved
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Delete a traffic log by ID
 */
router.delete('/logs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await trafficDb.deleteTrafficLog(id);
    res.json({ success: true, message: 'Log berhasil dihapus', result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Upload single media (Photo or Video)
 */
router.post('/upload', upload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Tidak ada file yang diunggah' });
    }

    const isVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(req.file.originalname);
    const fileUrl = `/uploads/traffic/${req.file.filename}`;

    res.json({
      success: true,
      file: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        isVideo,
        url: fileUrl,
        path: req.file.path
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Extract frames and process video
 */
router.post('/process-video', async (req, res) => {
  try {
    const { filename, maxFrames = 6, fps = 1 } = req.body;
    if (!filename) {
      return res.status(400).json({ success: false, error: 'Nama file video diperlukan' });
    }

    const videoPath = path.join(trafficVision.UPLOADS_DIR, filename);
    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ success: false, error: 'File video tidak ditemukan di server' });
    }

    const framePaths = await trafficVision.extractVideoFrames(videoPath, maxFrames, fps);
    const frameUrls = framePaths.map(fp => `/uploads/frames/${path.basename(fp)}`);

    res.json({
      success: true,
      message: `${framePaths.length} frame berhasil diekstrak`,
      frames: frameUrls,
      count: framePaths.length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Server-side heuristic analysis endpoint for testing/direct calls
 */
router.post('/analyze', async (req, res) => {
  try {
    const {
      detectedItems,
      filename,
      mediaType = 'photo',
      width = 1280,
      height = 720,
      metrics
    } = req.body;

    const analysis = trafficVision.detectTrafficObjects({
      detectedItems,
      filename,
      mediaType,
      width,
      height,
      metrics
    });

    res.json({ success: true, data: analysis });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
