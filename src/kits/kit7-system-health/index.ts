/**
 * Kit 7: System Health Dashboard
 *
 * Tools for system-wide monitoring and health assessment.
 *
 * @author WawApp Development Team
 * @date 2025-01-26
 */

import { systemHealth } from './system-health.js';
import { activeUsers } from './active-users.js';
import { performanceTrends, performanceTrendsSchema } from './performance-trends.js';
import { errorRateMonitor, errorRateMonitorSchema } from './error-rate-monitor.js';
import { incidentReport, incidentReportSchema } from './incident-report.js';

// Tool: wawapp_system_health
export const systemHealthSchema = {
  name: 'wawapp_system_health',
  description: `Comprehensive system health overview for WawApp.

Provides metrics across:
- Orders: total, active, completed, expired, stale
- Drivers: total, online, verified
- Clients: total, active today
- Performance: completion rate, rating rate

Returns:
- Overall health: healthy/degraded/critical
- Individual metric statuses
- Critical alerts
- Actionable recommendations

Use cases:
- Daily system health check
- Proactive issue detection
- Executive dashboard
- Incident investigation

Example:
{
  "timeRangeMinutes": 60
}`,
  inputSchema: {
    type: 'object',
    properties: {
      timeRangeMinutes: {
        type: 'number',
        description: 'Time range to analyze (1-1440 minutes, default: 60)',
        minimum: 1,
        maximum: 1440,
      },
    },
  },
};

// Tool: wawapp_active_users
export const activeUsersSchema = {
  name: 'wawapp_active_users',
  description: `Shows active users (drivers and clients) in the system.

Provides insights on:
- Active drivers and clients count
- Online/offline status (drivers)
- Verified status (drivers)
- Client-to-driver ratio
- Last activity timestamps

Use cases:
- Monitor current system load
- Understand user engagement
- Track peak usage times
- Identify inactive periods

Example:
{
  "timeRangeMinutes": 60,
  "userType": "all"
}`,
  inputSchema: {
    type: 'object',
    properties: {
      timeRangeMinutes: {
        type: 'number',
        description: 'Time range to analyze (1-1440 minutes, default: 60)',
        minimum: 1,
        maximum: 1440,
      },
      userType: {
        type: 'string',
        enum: ['all', 'drivers', 'clients'],
        description: 'Filter by user type (default: all)',
      },
    },
  },
};

// Export tool handlers
export { systemHealth, activeUsers, performanceTrends, errorRateMonitor, incidentReport };

// Export schemas
export { performanceTrendsSchema, errorRateMonitorSchema, incidentReportSchema };
