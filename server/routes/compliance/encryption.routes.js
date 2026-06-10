const express = require('express');
const router = express.Router();
const { encryptionService } = require('../../services/encryptionService');
const logger = require('../../utils/logger');
router.get('/encryption/status', async (req, res) => {
  try {
    const status = encryptionService.getStatus();
    
    res.json({
      success: true,
      status
    });
  } catch (error) {
    logger.error('Failed to get encryption status:', error);
    res.status(500).json({ error: 'Failed to get encryption status' });
  }
});

// Get encryption keys
router.get('/encryption/keys', async (req, res) => {
  try {
    const keys = encryptionService.getActiveKeys();
    
    res.json({
      success: true,
      keys: keys.map(key => ({
        id: key.id,
        purpose: key.purpose,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        isActive: key.isActive
      }))
    });
  } catch (error) {
    logger.error('Failed to get encryption keys:', error);
    res.status(500).json({ error: 'Failed to get encryption keys' });
  }
});

// Generate encryption key
router.post('/encryption/keys', async (req, res) => {
  try {
    const { purpose, metadata } = req.body;
    
    if (!purpose) {
      return res.status(400).json({ error: 'Purpose is required' });
    }
    
    const key = await encryptionService.generateKey(purpose, metadata);
    
    res.json({
      success: true,
      key: {
        id: key.id,
        purpose: key.purpose,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        isActive: key.isActive
      }
    });
  } catch (error) {
    logger.error('Failed to generate encryption key:', error);
    res.status(500).json({ error: 'Failed to generate encryption key' });
  }
});

// Rotate encryption key
router.post('/encryption/keys/:keyId/rotate', async (req, res) => {
  try {
    const { keyId } = req.params;
    
    const newKey = await encryptionService.rotateKey(keyId);
    
    res.json({
      success: true,
      newKey: {
        id: newKey.id,
        purpose: newKey.purpose,
        createdAt: newKey.createdAt,
        expiresAt: newKey.expiresAt,
        isActive: newKey.isActive
      }
    });
  } catch (error) {
    logger.error('Failed to rotate encryption key:', error);
    res.status(500).json({ error: 'Failed to rotate encryption key' });
  }
});

// Revoke encryption key
router.delete('/encryption/keys/:keyId', async (req, res) => {
  try {
    const { keyId } = req.params;
    
    await encryptionService.revokeKey(keyId);
    
    res.json({
      success: true,
      message: 'Key revoked successfully'
    });
  } catch (error) {
    logger.error('Failed to revoke encryption key:', error);
    res.status(500).json({ error: 'Failed to revoke encryption key' });
  }
});

// Get encryption audit log
router.get('/encryption/audit', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    
    const auditLog = encryptionService.getAuditLog(parseInt(limit));
    
    res.json({
      success: true,
      auditLog
    });
  } catch (error) {
    logger.error('Failed to get encryption audit log:', error);
    res.status(500).json({ error: 'Failed to get encryption audit log' });
  }
});

// Encrypt data
router.post('/encryption/encrypt', async (req, res) => {
  try {
    const { data, keyId, additionalData } = req.body;
    
    if (!data || !keyId) {
      return res.status(400).json({ error: 'Data and key ID are required' });
    }
    
    const encrypted = await encryptionService.encryptData(data, keyId, additionalData);
    
    res.json({
      success: true,
      encrypted
    });
  } catch (error) {
    logger.error('Failed to encrypt data:', error);
    res.status(500).json({ error: 'Failed to encrypt data' });
  }
});

// Decrypt data
router.post('/encryption/decrypt', async (req, res) => {
  try {
    const { encryptedData, keyId, additionalData } = req.body;
    
    if (!encryptedData || !keyId) {
      return res.status(400).json({ error: 'Encrypted data and key ID are required' });
    }
    
    const decrypted = await encryptionService.decryptData(encryptedData, keyId, additionalData);
    
    res.json({
      success: true,
      decrypted
    });
  } catch (error) {
    logger.error('Failed to decrypt data:', error);
    res.status(500).json({ error: 'Failed to decrypt data' });
  }
});

module.exports = router;
