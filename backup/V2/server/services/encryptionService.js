const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');

class EncryptionService {
  constructor() {
    this.config = {
      algorithm: 'aes-256-gcm',
      keyLength: 32, // 256 bits
      ivLength: 16, // 128 bits
      tagLength: 16, // 128 bits
      saltLength: 32, // 256 bits
      iterations: 100000, // PBKDF2 iterations
      enabled: process.env.ENCRYPTION_ENABLED === 'true',
      keyDerivation: process.env.ENCRYPTION_KEY_DERIVATION || 'pbkdf2',
      keyStorage: process.env.ENCRYPTION_KEY_STORAGE || 'file', // file, memory, hsm
      keyRotationInterval: parseInt(process.env.ENCRYPTION_KEY_ROTATION_INTERVAL) || 86400000, // 24 hours
      complianceMode: process.env.ENCRYPTION_COMPLIANCE_MODE === 'true',
      auditLogging: process.env.ENCRYPTION_AUDIT_LOGGING === 'true'
    };
    
    this.keys = new Map(); // Active encryption keys
    this.keyHistory = new Map(); // Historical keys for decryption
    this.auditLog = [];
    this.keyRotationTimer = null;
    
    this.initialize();
  }

  async initialize() {
    if (!this.config.enabled) {
      logger.warn('Encryption service is disabled');
      return;
    }

    try {
      // Load or generate master key
      await this.loadMasterKey();
      
      // Start key rotation timer
      this.startKeyRotation();
      
      logger.info('Encryption service initialized');
    } catch (error) {
      logger.error('Failed to initialize encryption service:', error);
      throw error;
    }
  }

  async loadMasterKey() {
    try {
      const keyPath = path.join(process.cwd(), 'keys', 'master.key');
      
      if (await fs.pathExists(keyPath)) {
        const encryptedKey = await fs.readFile(keyPath);
        const masterKey = await this.decryptMasterKey(encryptedKey);
        this.masterKey = masterKey;
        logger.info('Master key loaded from file');
      } else {
        // Generate new master key
        this.masterKey = crypto.randomBytes(32);
        await this.saveMasterKey();
        logger.info('New master key generated');
      }
    } catch (error) {
      logger.error('Failed to load master key:', error);
      throw error;
    }
  }

  async saveMasterKey() {
    try {
      const keyDir = path.join(process.cwd(), 'keys');
      await fs.ensureDir(keyDir);
      
      const keyPath = path.join(keyDir, 'master.key');
      const encryptedKey = await this.encryptMasterKey(this.masterKey);
      await fs.writeFile(keyPath, encryptedKey);
      
      // Set secure permissions
      await fs.chmod(keyPath, 0o600);
      
      logger.info('Master key saved to file');
    } catch (error) {
      logger.error('Failed to save master key:', error);
      throw error;
    }
  }

  async encryptMasterKey(key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', process.env.MASTER_KEY_PASSWORD || 'default-password');
    
    let encrypted = cipher.update(key);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    return Buffer.concat([iv, encrypted]);
  }

  async decryptMasterKey(encryptedKey) {
    const iv = encryptedKey.slice(0, 16);
    const encrypted = encryptedKey.slice(16);
    
    const decipher = crypto.createDecipher('aes-256-cbc', process.env.MASTER_KEY_PASSWORD || 'default-password');
    
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted;
  }

  // Generate encryption key for a specific purpose
  async generateKey(purpose, metadata = {}) {
    try {
      const keyId = crypto.randomUUID();
      const key = crypto.randomBytes(this.config.keyLength);
      const salt = crypto.randomBytes(this.config.saltLength);
      
      const keyData = {
        id: keyId,
        purpose,
        key,
        salt,
        metadata,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.config.keyRotationInterval),
        isActive: true
      };
      
      this.keys.set(keyId, keyData);
      
      // Log key generation
      this.logAuditEvent('key_generated', {
        keyId,
        purpose,
        metadata
      });
      
      logger.info(`Encryption key generated: ${keyId} for purpose: ${purpose}`);
      return keyData;
    } catch (error) {
      logger.error('Failed to generate encryption key:', error);
      throw error;
    }
  }

  // Encrypt data with specified key
  async encryptData(data, keyId, additionalData = '') {
    try {
      if (!this.config.enabled) {
        return data; // Return unencrypted if encryption is disabled
      }

      const keyData = this.keys.get(keyId);
      if (!keyData) {
        throw new Error(`Encryption key not found: ${keyId}`);
      }

      const iv = crypto.randomBytes(this.config.ivLength);
      const cipher = crypto.createCipher(this.config.algorithm, keyData.key);
      
      // Add additional authenticated data
      cipher.setAAD(Buffer.from(additionalData, 'utf8'));
      
      let encrypted = cipher.update(data, 'utf8', 'binary');
      encrypted += cipher.final('binary');
      
      const tag = cipher.getAuthTag();
      
      const result = {
        encrypted: Buffer.from(encrypted, 'binary'),
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        keyId,
        algorithm: this.config.algorithm,
        timestamp: new Date().toISOString()
      };
      
      // Log encryption event
      this.logAuditEvent('data_encrypted', {
        keyId,
        dataSize: data.length,
        algorithm: this.config.algorithm
      });
      
      return result;
    } catch (error) {
      logger.error('Failed to encrypt data:', error);
      throw error;
    }
  }

  // Decrypt data with specified key
  async decryptData(encryptedData, keyId, additionalData = '') {
    try {
      if (!this.config.enabled) {
        return encryptedData; // Return as-is if encryption is disabled
      }

      let keyData = this.keys.get(keyId);
      if (!keyData) {
        // Try to find key in history
        keyData = this.keyHistory.get(keyId);
        if (!keyData) {
          throw new Error(`Encryption key not found: ${keyId}`);
        }
      }

      const decipher = crypto.createDecipher(this.config.algorithm, keyData.key);
      
      // Set authentication tag
      decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
      
      // Add additional authenticated data
      decipher.setAAD(Buffer.from(additionalData, 'utf8'));
      
      let decrypted = decipher.update(encryptedData.encrypted, 'binary', 'utf8');
      decrypted += decipher.final('utf8');
      
      // Log decryption event
      this.logAuditEvent('data_decrypted', {
        keyId,
        dataSize: decrypted.length,
        algorithm: this.config.algorithm
      });
      
      return decrypted;
    } catch (error) {
      logger.error('Failed to decrypt data:', error);
      throw error;
    }
  }

  // Encrypt file
  async encryptFile(filePath, keyId, outputPath = null) {
    try {
      const data = await fs.readFile(filePath);
      const encrypted = await this.encryptData(data, keyId, filePath);
      
      const output = outputPath || `${filePath}.encrypted`;
      await fs.writeFile(output, JSON.stringify(encrypted));
      
      // Log file encryption
      this.logAuditEvent('file_encrypted', {
        filePath,
        outputPath: output,
        keyId,
        fileSize: data.length
      });
      
      logger.info(`File encrypted: ${filePath} -> ${output}`);
      return output;
    } catch (error) {
      logger.error('Failed to encrypt file:', error);
      throw error;
    }
  }

  // Decrypt file
  async decryptFile(encryptedFilePath, keyId, outputPath = null) {
    try {
      const encryptedData = JSON.parse(await fs.readFile(encryptedFilePath, 'utf8'));
      const decrypted = await this.decryptData(encryptedData, keyId, encryptedFilePath);
      
      const output = outputPath || encryptedFilePath.replace('.encrypted', '');
      await fs.writeFile(output, decrypted);
      
      // Log file decryption
      this.logAuditEvent('file_decrypted', {
        encryptedFilePath,
        outputPath: output,
        keyId,
        fileSize: decrypted.length
      });
      
      logger.info(`File decrypted: ${encryptedFilePath} -> ${output}`);
      return output;
    } catch (error) {
      logger.error('Failed to decrypt file:', error);
      throw error;
    }
  }

  // Rotate encryption key
  async rotateKey(keyId) {
    try {
      const oldKey = this.keys.get(keyId);
      if (!oldKey) {
        throw new Error(`Key not found: ${keyId}`);
      }

      // Generate new key
      const newKey = await this.generateKey(oldKey.purpose, oldKey.metadata);
      
      // Move old key to history
      this.keyHistory.set(keyId, oldKey);
      this.keys.delete(keyId);
      
      // Log key rotation
      this.logAuditEvent('key_rotated', {
        oldKeyId: keyId,
        newKeyId: newKey.id,
        purpose: oldKey.purpose
      });
      
      logger.info(`Key rotated: ${keyId} -> ${newKey.id}`);
      return newKey;
    } catch (error) {
      logger.error('Failed to rotate key:', error);
      throw error;
    }
  }

  // Start automatic key rotation
  startKeyRotation() {
    if (this.keyRotationTimer) {
      clearInterval(this.keyRotationTimer);
    }

    this.keyRotationTimer = setInterval(async () => {
      try {
        const now = new Date();
        const keysToRotate = [];

        for (const [keyId, keyData] of this.keys) {
          if (keyData.expiresAt <= now) {
            keysToRotate.push(keyId);
          }
        }

        for (const keyId of keysToRotate) {
          await this.rotateKey(keyId);
        }

        if (keysToRotate.length > 0) {
          logger.info(`Rotated ${keysToRotate.length} encryption keys`);
        }
      } catch (error) {
        logger.error('Key rotation failed:', error);
      }
    }, this.config.keyRotationInterval);

    logger.info('Key rotation timer started');
  }

  // Stop automatic key rotation
  stopKeyRotation() {
    if (this.keyRotationTimer) {
      clearInterval(this.keyRotationTimer);
      this.keyRotationTimer = null;
      logger.info('Key rotation timer stopped');
    }
  }

  // Log audit event
  logAuditEvent(event, details) {
    if (!this.config.auditLogging) return;

    const auditEntry = {
      timestamp: new Date().toISOString(),
      event,
      details,
      source: 'encryption_service'
    };

    this.auditLog.push(auditEntry);
    
    // Keep only last 1000 entries
    if (this.auditLog.length > 1000) {
      this.auditLog.shift();
    }

    logger.info(`Encryption audit: ${event}`, details);
  }

  // Get audit log
  getAuditLog(limit = 100) {
    return this.auditLog.slice(-limit);
  }

  // Get encryption status
  getStatus() {
    return {
      enabled: this.config.enabled,
      algorithm: this.config.algorithm,
      keyCount: this.keys.size,
      historyKeyCount: this.keyHistory.size,
      complianceMode: this.config.complianceMode,
      auditLogging: this.config.auditLogging,
      keyRotationInterval: this.config.keyRotationInterval,
      lastRotation: this.lastRotation || null
    };
  }

  // Get all active keys
  getActiveKeys() {
    return Array.from(this.keys.values());
  }

  // Get key by ID
  getKey(keyId) {
    return this.keys.get(keyId) || this.keyHistory.get(keyId);
  }

  // Revoke key
  async revokeKey(keyId) {
    try {
      const key = this.keys.get(keyId);
      if (!key) {
        throw new Error(`Key not found: ${keyId}`);
      }

      key.isActive = false;
      this.keyHistory.set(keyId, key);
      this.keys.delete(keyId);
      
      // Log key revocation
      this.logAuditEvent('key_revoked', {
        keyId,
        purpose: key.purpose
      });
      
      logger.info(`Key revoked: ${keyId}`);
      return true;
    } catch (error) {
      logger.error('Failed to revoke key:', error);
      throw error;
    }
  }

  // Clean up resources
  async cleanup() {
    this.stopKeyRotation();
    
    // Clear sensitive data
    this.keys.clear();
    this.keyHistory.clear();
    this.auditLog = [];
    
    if (this.masterKey) {
      this.masterKey.fill(0);
      this.masterKey = null;
    }
    
    logger.info('Encryption service cleaned up');
  }
}

// Initialize the service
const encryptionService = new EncryptionService();

// Initialize on startup
encryptionService.initialize().catch(error => {
  logger.error('Failed to initialize encryption service:', error);
});

module.exports = {
  encryptionService,
  EncryptionService,
};
