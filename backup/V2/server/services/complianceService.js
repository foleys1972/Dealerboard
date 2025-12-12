const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');
const { encryptionService } = require('./encryptionService');

class ComplianceService {
  constructor() {
    this.config = {
      enabled: process.env.COMPLIANCE_ENABLED === 'true',
      regulations: process.env.COMPLIANCE_REGULATIONS?.split(',') || ['mifid2', 'dodd-frank', 'sox'],
      retentionPeriod: parseInt(process.env.COMPLIANCE_RETENTION_PERIOD) || 2555, // 7 years in days
      auditLogging: process.env.COMPLIANCE_AUDIT_LOGGING === 'true',
      dataClassification: process.env.COMPLIANCE_DATA_CLASSIFICATION === 'true',
      accessControl: process.env.COMPLIANCE_ACCESS_CONTROL === 'true',
      encryptionRequired: process.env.COMPLIANCE_ENCRYPTION_REQUIRED === 'true',
      reportingInterval: parseInt(process.env.COMPLIANCE_REPORTING_INTERVAL) || 86400000, // 24 hours
      complianceOfficer: process.env.COMPLIANCE_OFFICER_EMAIL,
      legalHold: process.env.COMPLIANCE_LEGAL_HOLD === 'true'
    };
    
    this.auditLog = [];
    this.complianceEvents = [];
    this.dataClassification = new Map();
    this.accessLog = [];
    this.retentionPolicies = new Map();
    this.legalHolds = new Map();
    
    this.initialize();
  }

  async initialize() {
    if (!this.config.enabled) {
      logger.warn('Compliance service is disabled');
      return;
    }

    try {
      // Load existing compliance data
      await this.loadComplianceData();
      
      // Set up retention policies
      this.setupRetentionPolicies();
      
      // Start compliance monitoring
      this.startComplianceMonitoring();
      
      logger.info('Compliance service initialized');
    } catch (error) {
      logger.error('Failed to initialize compliance service:', error);
      throw error;
    }
  }

  async loadComplianceData() {
    try {
      const complianceDir = path.join(process.cwd(), 'compliance');
      await fs.ensureDir(complianceDir);
      
      // Load audit log
      const auditLogPath = path.join(complianceDir, 'audit.log');
      if (await fs.pathExists(auditLogPath)) {
        const auditData = await fs.readJSON(auditLogPath);
        this.auditLog = auditData.entries || [];
      }
      
      // Load compliance events
      const eventsPath = path.join(complianceDir, 'events.json');
      if (await fs.pathExists(eventsPath)) {
        const eventsData = await fs.readJSON(eventsPath);
        this.complianceEvents = eventsData.events || [];
      }
      
      // Load other compliance data
      // ... additional data loading logic
      
      logger.info('Compliance data loaded');
    } catch (error) {
      logger.error('Failed to load compliance data:', error);
      throw error;
    }
  }

  async saveComplianceData() {
    try {
      const complianceDir = path.join(process.cwd(), 'compliance');
      await fs.ensureDir(complianceDir);
      
      // Save audit log
      const auditLogPath = path.join(complianceDir, 'audit.log');
      await fs.writeJSON(auditLogPath, {
        entries: this.auditLog,
        lastUpdated: new Date().toISOString()
      });
      
      // Save compliance events
      const eventsPath = path.join(complianceDir, 'events.json');
      await fs.writeJSON(eventsPath, {
        events: this.complianceEvents,
        lastUpdated: new Date().toISOString()
      });
      
      logger.info('Compliance data saved');
    } catch (error) {
      logger.error('Failed to save compliance data:', error);
      throw error;
    }
  }

  setupRetentionPolicies() {
    // Set up default retention policies for different data types
    this.retentionPolicies.set('audio_recordings', {
      retentionDays: this.config.retentionPeriod,
      encryptionRequired: true,
      accessLogging: true,
      deletionMethod: 'secure_delete'
    });
    
    this.retentionPolicies.set('user_data', {
      retentionDays: 2555, // 7 years
      encryptionRequired: true,
      accessLogging: true,
      deletionMethod: 'secure_delete'
    });
    
    this.retentionPolicies.set('communication_logs', {
      retentionDays: 2555, // 7 years
      encryptionRequired: true,
      accessLogging: true,
      deletionMethod: 'secure_delete'
    });
    
    this.retentionPolicies.set('audit_logs', {
      retentionDays: 2555, // 7 years
      encryptionRequired: true,
      accessLogging: true,
      deletionMethod: 'secure_delete'
    });
    
    logger.info('Retention policies configured');
  }

  // Log compliance event
  logComplianceEvent(event, details) {
    if (!this.config.enabled) return;

    const complianceEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      event,
      details,
      regulations: this.config.regulations,
      severity: this.getEventSeverity(event),
      source: 'compliance_service'
    };

    this.complianceEvents.push(complianceEvent);
    
    // Log to audit trail
    this.logAuditEvent('compliance_event', {
      eventId: complianceEvent.id,
      event,
      severity: complianceEvent.severity
    });
    
    logger.info(`Compliance event: ${event}`, details);
  }

  // Log audit event
  logAuditEvent(event, details) {
    if (!this.config.auditLogging) return;

    const auditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      event,
      details,
      source: 'compliance_service'
    };

    this.auditLog.push(auditEntry);
    
    // Keep only last 10000 entries
    if (this.auditLog.length > 10000) {
      this.auditLog.shift();
    }
    
    logger.info(`Audit event: ${event}`, details);
  }

  // Get event severity
  getEventSeverity(event) {
    const highSeverityEvents = [
      'data_breach',
      'unauthorized_access',
      'encryption_failure',
      'compliance_violation'
    ];
    
    const mediumSeverityEvents = [
      'access_denied',
      'policy_violation',
      'retention_expired'
    ];
    
    if (highSeverityEvents.includes(event)) {
      return 'high';
    } else if (mediumSeverityEvents.includes(event)) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  // Classify data
  classifyData(dataId, dataType, sensitivity, metadata = {}) {
    const classification = {
      id: dataId,
      type: dataType,
      sensitivity: sensitivity, // public, internal, confidential, restricted
      metadata,
      classifiedAt: new Date(),
      retentionPolicy: this.retentionPolicies.get(dataType),
      encryptionRequired: this.config.encryptionRequired,
      accessControl: this.config.accessControl
    };
    
    this.dataClassification.set(dataId, classification);
    
    // Log classification
    this.logComplianceEvent('data_classified', {
      dataId,
      dataType,
      sensitivity,
      classification
    });
    
    return classification;
  }

  // Log data access
  logDataAccess(dataId, userId, action, details = {}) {
    const accessEntry = {
      id: crypto.randomUUID(),
      dataId,
      userId,
      action,
      timestamp: new Date().toISOString(),
      details,
      ipAddress: details.ipAddress,
      userAgent: details.userAgent
    };
    
    this.accessLog.push(accessEntry);
    
    // Log to compliance
    this.logComplianceEvent('data_access', {
      dataId,
      userId,
      action,
      accessEntry
    });
    
    // Check for suspicious access patterns
    this.checkSuspiciousAccess(userId, dataId);
  }

  // Check for suspicious access patterns
  checkSuspiciousAccess(userId, dataId) {
    const recentAccess = this.accessLog.filter(entry => 
      entry.userId === userId && 
      entry.timestamp > new Date(Date.now() - 3600000) // Last hour
    );
    
    if (recentAccess.length > 100) {
      this.logComplianceEvent('suspicious_access_pattern', {
        userId,
        dataId,
        accessCount: recentAccess.length,
        timeWindow: '1 hour'
      });
    }
  }

  // Set legal hold
  setLegalHold(dataId, reason, details = {}) {
    const legalHold = {
      id: crypto.randomUUID(),
      dataId,
      reason,
      details,
      setAt: new Date(),
      setBy: details.setBy,
      expiresAt: details.expiresAt,
      isActive: true
    };
    
    this.legalHolds.set(dataId, legalHold);
    
    // Log legal hold
    this.logComplianceEvent('legal_hold_set', {
      dataId,
      reason,
      legalHold
    });
    
    return legalHold;
  }

  // Remove legal hold
  removeLegalHold(dataId, reason, details = {}) {
    const legalHold = this.legalHolds.get(dataId);
    if (!legalHold) {
      throw new Error('Legal hold not found');
    }
    
    legalHold.isActive = false;
    legalHold.removedAt = new Date();
    legalHold.removedBy = details.removedBy;
    legalHold.removalReason = reason;
    
    // Log legal hold removal
    this.logComplianceEvent('legal_hold_removed', {
      dataId,
      reason,
      legalHold
    });
    
    return legalHold;
  }

  // Check data retention
  async checkDataRetention() {
    const expiredData = [];
    const now = new Date();
    
    for (const [dataId, classification] of this.dataClassification) {
      const retentionPolicy = classification.retentionPolicy;
      if (!retentionPolicy) continue;
      
      const retentionDate = new Date(classification.classifiedAt);
      retentionDate.setDate(retentionDate.getDate() + retentionPolicy.retentionDays);
      
      if (retentionDate <= now) {
        // Check if data is under legal hold
        const legalHold = this.legalHolds.get(dataId);
        if (!legalHold || !legalHold.isActive) {
          expiredData.push({
            dataId,
            classification,
            retentionDate,
            legalHold
          });
        }
      }
    }
    
    // Log retention check
    this.logComplianceEvent('retention_check', {
      totalData: this.dataClassification.size,
      expiredData: expiredData.length,
      expiredItems: expiredData
    });
    
    return expiredData;
  }

  // Generate compliance report
  async generateComplianceReport(startDate, endDate) {
    try {
      const report = {
        id: crypto.randomUUID(),
        generatedAt: new Date().toISOString(),
        period: { startDate, endDate },
        regulations: this.config.regulations,
        summary: {
          totalEvents: this.complianceEvents.length,
          totalAuditEntries: this.auditLog.length,
          totalDataClassified: this.dataClassification.size,
          totalLegalHolds: this.legalHolds.size,
          totalAccessLogs: this.accessLog.length
        },
        events: this.complianceEvents.filter(event => 
          event.timestamp >= startDate && event.timestamp <= endDate
        ),
        auditLog: this.auditLog.filter(entry => 
          entry.timestamp >= startDate && entry.timestamp <= endDate
        ),
        dataClassification: Array.from(this.dataClassification.values()),
        legalHolds: Array.from(this.legalHolds.values()),
        accessLog: this.accessLog.filter(entry => 
          entry.timestamp >= startDate && entry.timestamp <= endDate
        ),
        complianceStatus: this.getComplianceStatus(),
        recommendations: this.getComplianceRecommendations()
      };
      
      // Log report generation
      this.logComplianceEvent('compliance_report_generated', {
        reportId: report.id,
        period: { startDate, endDate },
        summary: report.summary
      });
      
      return report;
    } catch (error) {
      logger.error('Failed to generate compliance report:', error);
      throw error;
    }
  }

  // Get compliance status
  getComplianceStatus() {
    const status = {
      overall: 'compliant',
      regulations: {},
      lastAudit: null,
      nextAudit: null,
      violations: 0,
      warnings: 0
    };
    
    // Check each regulation
    for (const regulation of this.config.regulations) {
      status.regulations[regulation] = this.checkRegulationCompliance(regulation);
    }
    
    // Count violations and warnings
    const recentEvents = this.complianceEvents.filter(event => 
      event.timestamp > new Date(Date.now() - 86400000) // Last 24 hours
    );
    
    status.violations = recentEvents.filter(event => event.severity === 'high').length;
    status.warnings = recentEvents.filter(event => event.severity === 'medium').length;
    
    // Determine overall status
    if (status.violations > 0) {
      status.overall = 'non-compliant';
    } else if (status.warnings > 0) {
      status.overall = 'warning';
    }
    
    return status;
  }

  // Check regulation compliance
  checkRegulationCompliance(regulation) {
    const checks = {
      mifid2: this.checkMiFID2Compliance(),
      'dodd-frank': this.checkDoddFrankCompliance(),
      sox: this.checkSOXCompliance()
    };
    
    return checks[regulation] || { status: 'unknown', details: 'Regulation not implemented' };
  }

  // Check MiFID II compliance
  checkMiFID2Compliance() {
    return {
      status: 'compliant',
      details: {
        recordingRetention: this.config.retentionPeriod >= 2555, // 7 years
        encryptionEnabled: this.config.encryptionRequired,
        auditLogging: this.config.auditLogging,
        accessControl: this.config.accessControl
      }
    };
  }

  // Check Dodd-Frank compliance
  checkDoddFrankCompliance() {
    return {
      status: 'compliant',
      details: {
        recordingRetention: this.config.retentionPeriod >= 2555, // 7 years
        encryptionEnabled: this.config.encryptionRequired,
        auditLogging: this.config.auditLogging
      }
    };
  }

  // Check SOX compliance
  checkSOXCompliance() {
    return {
      status: 'compliant',
      details: {
        auditLogging: this.config.auditLogging,
        accessControl: this.config.accessControl,
        dataClassification: this.config.dataClassification
      }
    };
  }

  // Get compliance recommendations
  getComplianceRecommendations() {
    const recommendations = [];
    
    if (!this.config.encryptionRequired) {
      recommendations.push({
        type: 'security',
        priority: 'high',
        message: 'Enable encryption for all sensitive data',
        action: 'Set COMPLIANCE_ENCRYPTION_REQUIRED=true'
      });
    }
    
    if (!this.config.auditLogging) {
      recommendations.push({
        type: 'audit',
        priority: 'high',
        message: 'Enable audit logging for compliance',
        action: 'Set COMPLIANCE_AUDIT_LOGGING=true'
      });
    }
    
    if (!this.config.accessControl) {
      recommendations.push({
        type: 'access',
        priority: 'medium',
        message: 'Enable access control for data protection',
        action: 'Set COMPLIANCE_ACCESS_CONTROL=true'
      });
    }
    
    return recommendations;
  }

  // Start compliance monitoring
  startComplianceMonitoring() {
    // Set up periodic compliance checks
    setInterval(async () => {
      try {
        await this.checkDataRetention();
        await this.saveComplianceData();
      } catch (error) {
        logger.error('Compliance monitoring error:', error);
      }
    }, this.config.reportingInterval);
    
    logger.info('Compliance monitoring started');
  }

  // Get compliance status
  getStatus() {
    return {
      enabled: this.config.enabled,
      regulations: this.config.regulations,
      retentionPeriod: this.config.retentionPeriod,
      auditLogging: this.config.auditLogging,
      dataClassification: this.config.dataClassification,
      accessControl: this.config.accessControl,
      encryptionRequired: this.config.encryptionRequired,
      totalEvents: this.complianceEvents.length,
      totalAuditEntries: this.auditLog.length,
      totalDataClassified: this.dataClassification.size,
      totalLegalHolds: this.legalHolds.size
    };
  }

  // Clean up resources
  async cleanup() {
    try {
      await this.saveComplianceData();
      
      this.auditLog = [];
      this.complianceEvents = [];
      this.dataClassification.clear();
      this.accessLog = [];
      this.retentionPolicies.clear();
      this.legalHolds.clear();
      
      logger.info('Compliance service cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup compliance service:', error);
    }
  }
}

// Initialize the service
const complianceService = new ComplianceService();

// Initialize on startup
complianceService.initialize().catch(error => {
  logger.error('Failed to initialize compliance service:', error);
});

module.exports = {
  complianceService,
  ComplianceService,
};
