const express = require('express');
const router = express.Router();
const { audioRecordingService } = require('../services/audioRecordingService');
const logger = require('../utils/logger');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const jwt = require('jsonwebtoken');

// Get recording statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await audioRecordingService.getRecordingStats();
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get recording stats:', error);
    res.status(500).json({ error: 'Failed to get recording statistics' });
  }
});

// Get active recordings
router.get('/active', async (req, res) => {
  try {
    const activeRecordings = audioRecordingService.getActiveRecordings();
    res.json(activeRecordings);
  } catch (error) {
    logger.error('Failed to get active recordings:', error);
    res.status(500).json({ error: 'Failed to get active recordings' });
  }
});

// Get recordings by group
router.get('/group/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const recordings = await audioRecordingService.getRecordingsByGroup(groupId);
    res.json(recordings);
  } catch (error) {
    logger.error('Failed to get recordings by group:', error);
    res.status(500).json({ error: 'Failed to get recordings for group' });
  }
});

// Get completed recordings
router.get('/completed', async (req, res) => {
  try {
    const recordings = await audioRecordingService.getCompletedRecordings();
    res.json({
      success: true,
      recordings,
      total: recordings.length,
    });
  } catch (error) {
    logger.error('Failed to get completed recordings:', error);
    res.status(500).json({ error: 'Failed to get completed recordings' });
  }
});

// Set retention policy for a group
router.post('/retention-policy/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { retentionDays, emailDelivery, emailRecipients, emailSchedule } = req.body;

    const policy = {
      retentionDays: parseInt(retentionDays) || 2555, // 7 years default
      emailDelivery: emailDelivery || false,
      emailRecipients: emailRecipients || [],
      emailSchedule: emailSchedule || 'immediate',
    };

    audioRecordingService.setRetentionPolicy(groupId, policy);
    
    res.json({ 
      success: true, 
      message: `Retention policy set for group ${groupId}`,
      policy 
    });
  } catch (error) {
    logger.error('Failed to set retention policy:', error);
    res.status(500).json({ error: 'Failed to set retention policy' });
  }
});

// Get retention policy for a group
router.get('/retention-policy/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const policy = audioRecordingService.getRetentionPolicy(groupId);
    res.json(policy);
  } catch (error) {
    logger.error('Failed to get retention policy:', error);
    res.status(500).json({ error: 'Failed to get retention policy' });
  }
});

// Send recording email manually
router.post('/send-email/:recordingId', async (req, res) => {
  try {
    const { recordingId } = req.params;
    const { recipients } = req.body;

    // Get the recording
    const recordings = await audioRecordingService.getCompletedRecordings();
    const recording = recordings.find(r => r.id === recordingId);
    
    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    // Update recipients if provided
    if (recipients && recipients.length > 0) {
      recording.emailDelivery.recipients = recipients;
    }

    // Send email
    await audioRecordingService.sendRecordingEmail(recording);
    
    res.json({ 
      success: true, 
      message: `Email sent for recording ${recordingId}` 
    });
  } catch (error) {
    logger.error('Failed to send recording email:', error);
    res.status(500).json({ error: 'Failed to send recording email' });
  }
});

// Download recording
router.get('/download/:recordingId', async (req, res) => {
  try {
    const { recordingId } = req.params;
    const recordings = await audioRecordingService.getCompletedRecordings();
    const recording = recordings.find(r => r.id === recordingId);
    
    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    // Check if file exists
    const fs = require('fs-extra');
    if (!await fs.pathExists(recording.filePath)) {
      return res.status(404).json({ error: 'Recording file not found' });
    }

    // Set headers for download
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Disposition', `attachment; filename="${recordingId}.wav"`);
    
    // Stream the file
    const stream = require('fs').createReadStream(recording.filePath);
    stream.pipe(res);
  } catch (error) {
    logger.error('Failed to download recording:', error);
    res.status(500).json({ error: 'Failed to download recording' });
  }
});

// Download recording metadata
router.get('/metadata/:recordingId', async (req, res) => {
  try {
    const { recordingId } = req.params;
    const recordings = await audioRecordingService.getCompletedRecordings();
    const recording = recordings.find(r => r.id === recordingId);
    
    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    // Check if metadata file exists
    const fs = require('fs-extra');
    if (!await fs.pathExists(recording.metadataPath)) {
      return res.status(404).json({ error: 'Recording metadata not found' });
    }

    // Read and send metadata
    const metadata = await fs.readJson(recording.metadataPath);
    res.json(metadata);
  } catch (error) {
    logger.error('Failed to get recording metadata:', error);
    res.status(500).json({ error: 'Failed to get recording metadata' });
  }
});

// Delete recording
router.delete('/:recordingId', async (req, res) => {
  try {
    const { recordingId } = req.params;
    
    await audioRecordingService.deleteRecording(recordingId);
    
    res.json({ 
      success: true, 
      message: `Recording ${recordingId} deleted successfully` 
    });
  } catch (error) {
    logger.error('Failed to delete recording:', error);
    res.status(500).json({ error: 'Failed to delete recording' });
  }
});

// Get storage usage
router.get('/storage-usage', async (req, res) => {
  try {
    const usage = await audioRecordingService.calculateStorageUsage();
    res.json(usage);
  } catch (error) {
    logger.error('Failed to get storage usage:', error);
    res.status(500).json({ error: 'Failed to get storage usage' });
  }
});

// Process retention policies manually
router.post('/process-retention', async (req, res) => {
  try {
    await audioRecordingService.processRetentionPolicies();
    res.json({ 
      success: true, 
      message: 'Retention policies processed successfully' 
    });
  } catch (error) {
    logger.error('Failed to process retention policies:', error);
    res.status(500).json({ error: 'Failed to process retention policies' });
  }
});

// Process email delivery manually
router.post('/process-email-delivery', async (req, res) => {
  try {
    await audioRecordingService.processEmailDelivery();
    res.json({ 
      success: true, 
      message: 'Email delivery processed successfully' 
    });
  } catch (error) {
    logger.error('Failed to process email delivery:', error);
    res.status(500).json({ error: 'Failed to process email delivery' });
  }
});

module.exports = router;

// Upload recording (client-side recorded media)
const upload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      try {
        const dir = audioRecordingService.recordingDir;
        await fs.ensureDir(dir);
        cb(null, dir);
      } catch (e) {
        cb(e);
      }
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.webm';
      const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      cb(null, `${id}${ext}`);
    }
  }),
  limits: { fileSize: 1024 * 1024 * 200 } // 200MB
});

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    // Optional auth
    const auth = req.headers.authorization || '';
    if (auth && auth.startsWith('Bearer ')) {
      try { jwt.verify(auth.slice(7), process.env.JWT_SECRET || process.env.JWT_ACCESS_TOKEN_SECRET || 'dev_secret'); } catch {}
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const metaRaw = req.body?.metadata;
    let meta = {};
    try { if (metaRaw) meta = JSON.parse(metaRaw); } catch {}

    const recordingId = path.basename(req.file.filename, path.extname(req.file.filename));
    const rec = {
      id: recordingId,
      groupId: meta.groupId || meta.callId || null,
      participants: meta.participants || [],
      startTime: meta.startTime ? new Date(meta.startTime) : new Date(),
      endTime: meta.endTime ? new Date(meta.endTime) : new Date(),
      duration: meta.durationMs || 0,
      filePath: req.file.path,
      status: 'completed',
      metadataPath: path.join(audioRecordingService.recordingDir, `${recordingId}.json`),
      metadata: {
        ...meta,
        uploadedBy: meta.userId || null,
        format: path.extname(req.file.originalname || req.file.filename || '').replace('.', '') || 'webm'
      }
    };

    // Persist metadata and register as completed
    await fs.writeJson(rec.metadataPath, rec.metadata, { spaces: 2 });
    audioRecordingService.completedRecordings.unshift(rec);
    if (audioRecordingService.completedRecordings.length > 200) {
      audioRecordingService.completedRecordings.pop();
    }

    return res.json({ success: true, recordingId, path: req.file.path });
  } catch (error) {
    logger.error('Failed to upload recording:', error);
    return res.status(500).json({ error: 'Failed to upload recording' });
  }
});
