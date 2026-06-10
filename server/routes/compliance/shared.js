const { complianceService } = require('../../services/complianceService');

// Helper function to convert to CSV
function convertToCSV(data) {
  const headers = ['timestamp', 'event', 'severity', 'source'];
  const rows = data.events.map(event => [
    event.timestamp,
    event.event,
    event.severity,
    event.source
  ]);
  
  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

module.exports = { convertToCSV };
