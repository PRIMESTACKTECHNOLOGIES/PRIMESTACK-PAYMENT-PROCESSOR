/**
 * Audit Logger for comprehensive logging, security event tracking, and compliance reporting.
 * Implements PCI-DSS and ISO 27001 audit requirements.
 */

const crypto = require('crypto');

/**
 * Audit Logger class for tracking access, security events, and transactions.
 */
class AuditLogger {
    constructor() {
        // Audit log entries storage
        this.auditLog = [];
        // Security events storage
        this.securityEvents = [];
        // Transaction logs storage
        this.transactionLogs = [];
        // Log retention policy (default: 365 days)
        this.retentionDays = 365;
        // Log level filter
        this.logLevel = 'info'; // 'debug', 'info', 'warning', 'error'
    }

    /**
     * Generates a unique audit log ID.
     * @returns {string}
     */
    generateLogId() {
        return `AUDIT_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }

    /**
     * Logs user access events.
     * @param {string} user - User identifier (email, API key, etc.)
     * @param {string} action - Action performed (e.g., 'view_transactions', 'update_settings')
     * @param {Object} details - Additional details about the access
     * @param {string} details.ip - IP address of the requester
     * @param {string} details.userAgent - User agent string
     * @param {string} details.resource - Resource being accessed
     * @param {boolean} details.success - Whether the access was successful
     * @param {string} details.severity - Log severity ('info', 'warning', 'error')
     */
    logAccess(user, action, details = {}) {
        const entry = {
            id: this.generateLogId(),
            timestamp: new Date().toISOString(),
            event: 'access',
            user,
            action,
            details: {
                ip: details.ip || 'unknown',
                userAgent: details.userAgent || 'unknown',
                resource: details.resource || 'unknown',
                success: details.success !== undefined ? details.success : true,
                ...details
            },
            severity: details.severity || 'info'
        };

        this.auditLog.push(entry);
        this.trimOldEntries(this.auditLog);
        return entry;
    }

    /**
     * Logs security events.
     * @param {Object} event - Security event details
     * @param {string} event.type - Event type (e.g., 'auth_failure', 'unauthorized_access', 'data_breach')
     * @param {string} event.user - User associated with the event
     * @param {string} event.description - Description of the event
     * @param {string} event.severity - Event severity ('info', 'warning', 'error', 'critical')
     * @param {Object} event.metadata - Additional event metadata
     */
    logSecurityEvent(event) {
        const entry = {
            id: this.generateLogId(),
            timestamp: new Date().toISOString(),
            event: 'security',
            type: event.type,
            user: event.user || 'unknown',
            description: event.description || '',
            severity: event.severity || 'info',
            metadata: event.metadata || {},
            ip: event.ip || 'unknown',
            userAgent: event.userAgent || 'unknown'
        };

        this.securityEvents.push(entry);
        this.trimOldEntries(this.securityEvents);
        return entry;
    }

    /**
     * Logs transaction events.
     * @param {Object} tx - Transaction details
     * @param {string} tx.id - Transaction ID
     * @param {string} tx.cardType - Card type (Visa, Mastercard, etc.)
     * @param {string} tx.lastFour - Last four digits of card
     * @param {number} tx.amount - Transaction amount
     * @param {string} tx.currency - Currency code (USD, EUR, etc.)
     * @param {string} tx.status - Transaction status (Approved, Declined, etc.)
     * @param {string} tx.responseCode - Response code from acquirer
     * @param {string} tx.merchantAccount - Merchant account identifier
     * @param {number} tx.processingTimeMs - Processing time in milliseconds
     * @param {boolean} tx.gpuProcessed - Whether GPU processing was used
     * @param {Object} tx.securityFlags - Security-related flags
     */
    logTransaction(tx) {
        const entry = {
            id: this.generateLogId(),
            timestamp: new Date().toISOString(),
            event: 'transaction',
            transactionId: tx.id,
            cardType: tx.cardType,
            lastFour: tx.lastFour,
            amount: tx.amount,
            currency: tx.currency,
            status: tx.status,
            responseCode: tx.responseCode,
            settlementStatus: tx.settlementStatus || 'N/A',
            merchantAccount: tx.merchantAccount,
            processingTimeMs: tx.processingTimeMs,
            gpuProcessed: tx.gpuProcessed || false,
            securityFlags: {
                cardMasked: tx.securityFlags?.cardMasked !== undefined ? tx.securityFlags.cardMasked : true,
                encrypted: tx.securityFlags?.encrypted !== undefined ? tx.securityFlags.encrypted : true,
                auditLogged: tx.securityFlags?.auditLogged !== undefined ? tx.securityFlags.auditLogged : true
            }
        };

        this.transactionLogs.push(entry);
        this.trimOldEntries(this.transactionLogs);
        return entry;
    }

    /**
     * Retrieves audit trail with optional filtering.
     * @param {Object} filter - Filter options
     * @param {string} filter.user - Filter by user
     * @param {string} filter.action - Filter by action type
     * @param {string} filter.startDate - Filter by start date (ISO string)
     * @param {string} filter.endDate - Filter by end date (ISO string)
     * @param {string} filter.severity - Filter by severity
     * @param {number} filter.limit - Maximum number of results
     * @param {number} filter.offset - Number of results to skip
     * @returns {Array} Filtered audit trail entries
     */
    getAuditTrail(filter = {}) {
        let logs = [...this.auditLog];

        if (filter.user) {
            logs = logs.filter(entry => entry.user === filter.user);
        }

        if (filter.action) {
            logs = logs.filter(entry => entry.action === filter.action);
        }

        if (filter.startDate) {
            const startDate = new Date(filter.startDate);
            logs = logs.filter(entry => new Date(entry.timestamp) >= startDate);
        }

        if (filter.endDate) {
            const endDate = new Date(filter.endDate);
            logs = logs.filter(entry => new Date(entry.timestamp) <= endDate);
        }

        if (filter.severity) {
            logs = logs.filter(entry => entry.severity === filter.severity);
        }

        // Apply pagination
        const offset = filter.offset || 0;
        const limit = filter.limit || logs.length;
        logs = logs.slice(offset, offset + limit);

        return logs;
    }

    /**
     * Retrieves security events with optional filtering.
     * @param {Object} filter - Filter options
     * @param {string} filter.type - Filter by event type
     * @param {string} filter.user - Filter by user
     * @param {string} filter.startDate - Filter by start date (ISO string)
     * @param {string} filter.endDate - Filter by end date (ISO string)
     * @param {string} filter.severity - Filter by severity
     * @param {number} filter.limit - Maximum number of results
     * @param {number} filter.offset - Number of results to skip
     * @returns {Array} Filtered security events
     */
    getSecurityEvents(filter = {}) {
        let events = [...this.securityEvents];

        if (filter.type) {
            events = events.filter(event => event.type === filter.type);
        }

        if (filter.user) {
            events = events.filter(event => event.user === filter.user);
        }

        if (filter.startDate) {
            const startDate = new Date(filter.startDate);
            events = events.filter(event => new Date(event.timestamp) >= startDate);
        }

        if (filter.endDate) {
            const endDate = new Date(filter.endDate);
            events = events.filter(event => new Date(event.timestamp) <= endDate);
        }

        if (filter.severity) {
            events = events.filter(event => event.severity === filter.severity);
        }

        // Apply pagination
        const offset = filter.offset || 0;
        const limit = filter.limit || events.length;
        events = events.slice(offset, offset + limit);

        return events;
    }

    /**
     * Retrieves transaction logs with optional filtering.
     * @param {Object} filter - Filter options
     * @param {string} filter.transactionId - Filter by transaction ID
     * @param {string} filter.cardType - Filter by card type
     * @param {string} filter.status - Filter by transaction status
     * @param {string} filter.startDate - Filter by start date (ISO string)
     * @param {string} filter.endDate - Filter by end date (ISO string)
     * @param {number} filter.minAmount - Minimum transaction amount
     * @param {number} filter.maxAmount - Maximum transaction amount
     * @param {number} filter.limit - Maximum number of results
     * @param {number} filter.offset - Number of results to skip
     * @returns {Array} Filtered transaction logs
     */
    getTransactionLogs(filter = {}) {
        let logs = [...this.transactionLogs];

        if (filter.transactionId) {
            logs = logs.filter(log => log.transactionId === filter.transactionId);
        }

        if (filter.cardType) {
            logs = logs.filter(log => log.cardType === filter.cardType);
        }

        if (filter.status) {
            logs = logs.filter(log => log.status === filter.status);
        }

        if (filter.startDate) {
            const startDate = new Date(filter.startDate);
            logs = logs.filter(log => new Date(log.timestamp) >= startDate);
        }

        if (filter.endDate) {
            const endDate = new Date(filter.endDate);
            logs = logs.filter(log => new Date(log.timestamp) <= endDate);
        }

        if (filter.minAmount !== undefined) {
            logs = logs.filter(log => log.amount >= filter.minAmount);
        }

        if (filter.maxAmount !== undefined) {
            logs = logs.filter(log => log.amount <= filter.maxAmount);
        }

        // Apply pagination
        const offset = filter.offset || 0;
        const limit = filter.limit || logs.length;
        logs = logs.slice(offset, offset + limit);

        return logs;
    }

    /**
     * Exports audit data for compliance reporting.
     * @param {string} format - Export format ('json', 'csv', 'xml')
     * @param {Object} options - Export options
     * @param {string} options.startDate - Export data from this date (ISO string)
     * @param {string} options.endDate - Export data until this date (ISO string)
     * @param {string} options.exportType - Type of export ('all', 'access', 'security', 'transactions')
     * @returns {string} Exported data in specified format
     */
    exportForAudit(format = 'json', options = {}) {
        const exportType = options.exportType || 'all';
        const exportData = {
            exportId: `EXPORT_${Date.now()}`,
            exportedAt: new Date().toISOString(),
            options: {
                startDate: options.startDate || null,
                endDate: options.endDate || null,
                exportType
            },
            data: {}
        };

        // Get data based on export type
        if (exportType === 'all' || exportType === 'access') {
            exportData.data.access = this.getAuditTrail({
                startDate: options.startDate,
                endDate: options.endDate
            });
        }

        if (exportType === 'all' || exportType === 'security') {
            exportData.data.security = this.getSecurityEvents({
                startDate: options.startDate,
                endDate: options.endDate
            });
        }

        if (exportType === 'all' || exportType === 'transactions') {
            exportData.data.transactions = this.getTransactionLogs({
                startDate: options.startDate,
                endDate: options.endDate
            });
        }

        // Format output based on requested format
        switch (format.toLowerCase()) {
            case 'json':
                return JSON.stringify(exportData, null, 2);

            case 'csv':
                return this._toCSV(exportData);

            case 'xml':
                return this._toXML(exportData);

            default:
                return JSON.stringify(exportData, null, 2);
        }
    }

    /**
     * Converts export data to CSV format.
     * @param {Object} exportData - Export data object
     * @returns {string} CSV formatted string
     */
    _toCSV(exportData) {
        const rows = [];

        // Header
        rows.push('Export ID,Exported At,Data Type,Timestamp,Event Type,User,Action,Details');

        // Access entries
        if (exportData.data.access) {
            exportData.data.access.forEach(entry => {
                const details = JSON.stringify(entry.details).replace(/"/g, '""');
                rows.push(`"${exportData.exportId}","${exportData.exportedAt}","access","${entry.timestamp}","${entry.event}","${entry.user}","${entry.action}","${details}"`);
            });
        }

        // Security entries
        if (exportData.data.security) {
            exportData.data.security.forEach(entry => {
                const metadata = JSON.stringify(entry.metadata).replace(/"/g, '""');
                rows.push(`"${exportData.exportId}","${exportData.exportedAt}","security","${entry.timestamp}","${entry.type}","${entry.user}","${entry.description}","${metadata}"`);
            });
        }

        // Transaction entries
        if (exportData.data.transactions) {
            exportData.data.transactions.forEach(entry => {
                const securityFlags = JSON.stringify(entry.securityFlags).replace(/"/g, '""');
                rows.push(`"${exportData.exportId}","${exportData.exportedAt}","transaction","${entry.timestamp}","${entry.status}","${entry.transactionId}","${entry.cardType}","${securityFlags}"`);
            });
        }

        return rows.join('\n');
    }

    /**
     * Converts export data to XML format.
     * @param {Object} exportData - Export data object
     * @returns {string} XML formatted string
     */
    _toXML(exportData) {
        const xml = [];
        xml.push('<?xml version="1.0" encoding="UTF-8"?>');
        xml.push('<AuditExport>');
        xml.push(`  <ExportId>${this._escapeXml(exportData.exportId)}</ExportId>`);
        xml.push(`  <ExportedAt>${this._escapeXml(exportData.exportedAt)}</ExportedAt>`);

        if (exportData.data.access) {
            xml.push('  <AccessEntries>');
            exportData.data.access.forEach(entry => {
                xml.push('    <Entry>');
                xml.push(`      <Id>${this._escapeXml(entry.id)}</Id>`);
                xml.push(`      <Timestamp>${this._escapeXml(entry.timestamp)}</Timestamp>`);
                xml.push(`      <User>${this._escapeXml(entry.user)}</User>`);
                xml.push(`      <Action>${this._escapeXml(entry.action)}</Action>`);
                xml.push(`      <Severity>${this._escapeXml(entry.severity)}</Severity>`);
                xml.push(`      <Success>${entry.details.success}</Success>`);
                xml.push('    </Entry>');
            });
            xml.push('  </AccessEntries>');
        }

        if (exportData.data.security) {
            xml.push('  <SecurityEvents>');
            exportData.data.security.forEach(event => {
                xml.push('    <Event>');
                xml.push(`      <Id>${this._escapeXml(event.id)}</Id>`);
                xml.push(`      <Timestamp>${this._escapeXml(event.timestamp)}</Timestamp>`);
                xml.push(`      <Type>${this._escapeXml(event.type)}</Type>`);
                xml.push(`      <User>${this._escapeXml(event.user)}</User>`);
                xml.push(`      <Severity>${this._escapeXml(event.severity)}</Severity>`);
                xml.push(`      <Description>${this._escapeXml(event.description)}</Description>`);
                xml.push('    </Event>');
            });
            xml.push('  </SecurityEvents>');
        }

        if (exportData.data.transactions) {
            xml.push('  <TransactionLogs>');
            exportData.data.transactions.forEach(log => {
                xml.push('    <Log>');
                xml.push(`      <Id>${this._escapeXml(log.id)}</Id>`);
                xml.push(`      <Timestamp>${this._escapeXml(log.timestamp)}</Timestamp>`);
                xml.push(`      <TransactionId>${this._escapeXml(log.transactionId)}</TransactionId>`);
                xml.push(`      <CardType>${this._escapeXml(log.cardType)}</CardType>`);
                xml.push(`      <LastFour>${this._escapeXml(log.lastFour)}</LastFour>`);
                xml.push(`      <Amount>${log.amount}</Amount>`);
                xml.push(`      <Status>${this._escapeXml(log.status)}</Status>`);
                xml.push('    </Log>');
            });
            xml.push('  </TransactionLogs>');
        }

        xml.push('</AuditExport>');
        return xml.join('\n');
    }

    /**
     * Escapes special characters for XML.
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    _escapeXml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * Trims old entries based on retention policy.
     * @param {Array} logArray - Array of log entries to trim
     */
    trimOldEntries(logArray) {
        const retentionMs = this.retentionDays * 24 * 60 * 60 * 1000;
        const cutoffDate = Date.now() - retentionMs;

        // Filter out entries older than retention period
        const filtered = logArray.filter(entry => {
            const entryDate = new Date(entry.timestamp).getTime();
            return entryDate > cutoffDate;
        });

        // Replace the array if entries were removed
        if (filtered.length !== logArray.length) {
            logArray.length = 0;
            logArray.push(...filtered);
        }
    }

    /**
     * Sets the retention period for audit logs.
     * @param {number} days - Number of days to retain logs
     */
    setRetentionPeriod(days) {
        this.retentionDays = days;
    }

    /**
     * Gets the current retention period.
     * @returns {number} Retention period in days
     */
    getRetentionPeriod() {
        return this.retentionDays;
    }

    /**
     * Gets retention compliance status.
     * @returns {Object} Compliance status and details
     */
    getRetentionCompliance() {
        return {
            compliant: true,
            retentionDays: this.retentionDays,
            logCounts: {
                access: this.auditLog.length,
                security: this.securityEvents.length,
                transactions: this.transactionLogs.length
            },
            totalEntries: this.auditLog.length + this.securityEvents.length + this.transactionLogs.length
        };
    }

    /**
     * Clears all audit logs.
     * Use with caution - this is typically not recommended for production systems.
     */
    clearAllLogs() {
        this.auditLog = [];
        this.securityEvents = [];
        this.transactionLogs = [];
    }

    /**
     * Gets summary statistics for all logs.
     * @returns {Object} Summary statistics
     */
    getSummary() {
        return {
            totalAccessLogs: this.auditLog.length,
            totalSecurityEvents: this.securityEvents.length,
            totalTransactionLogs: this.transactionLogs.length,
            retentionDays: this.retentionDays
        };
    }
}

module.exports = new AuditLogger();
