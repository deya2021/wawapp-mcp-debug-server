/**
 * Kit 6: Cloud Function Execution Observer
 *
 * Tools for monitoring and debugging Cloud Functions.
 *
 * @author WawApp Development Team
 * @date 2025-01-26
 */

import { functionExecutionTrace } from './function-execution-trace.js';
import { functionHealthCheck } from './function-health-check.js';
import { schedulerStatus, schedulerStatusSchema } from './scheduler-status.js';

// Tool: wawapp_function_execution_trace
export const functionExecutionTraceSchema = {
  name: 'wawapp_function_execution_trace',
  description: `Trace Cloud Function executions for a specific order.

Shows which Cloud Functions should have been triggered:
- notifyOrderEvents (on status changes)
- expireStaleOrders (scheduled, every 2 minutes)
- aggregateDriverRating (on trip completion with rating)

For each function, shows:
- Expected trigger condition
- Expected execution time
- Likely execution status
- Manual verification steps

Use cases:
- Order stuck in matching (check expireStaleOrders)
- Client didn't receive notification (check notifyOrderEvents)
- Driver rating not updated (check aggregateDriverRating)

Note: In v1, cannot verify actual execution from Cloud Logging.
Manual verification via Firebase CLI required.

Example:
{
  "orderId": "order_xyz789",
  "functionName": "all"
}`,
  inputSchema: {
    type: 'object',
    properties: {
      orderId: {
        type: 'string',
        description: 'Order ID to trace function executions for',
      },
      functionName: {
        type: 'string',
        enum: ['notifyOrderEvents', 'expireStaleOrders', 'aggregateDriverRating', 'all'],
        description: 'Specific function to trace, or "all" for all functions',
      },
    },
    required: ['orderId'],
  },
};

// Tool: wawapp_function_health_check
export const functionHealthCheckSchema = {
  name: 'wawapp_function_health_check',
  description: `Check overall health of Cloud Functions deployment.

Performs system-wide checks:
1. Stale orders presence (indicates expireStaleOrders issues)
2. Recent orders activity (system usage)
3. Completed orders have ratings (aggregateDriverRating working)
4. Cloud Scheduler status (manual verification required)

Returns:
- Overall health: healthy/degraded/unhealthy
- Individual check results
- Specific recommendations

Use cases:
- Proactive health monitoring
- Diagnose system-wide issues
- Verify Cloud Functions are running

Example:
{
  "timeRangeMinutes": 60
}`,
  inputSchema: {
    type: 'object',
    properties: {
      timeRangeMinutes: {
        type: 'number',
        description: 'Time range to check (1-1440 minutes, default: 60)',
        minimum: 1,
        maximum: 1440,
      },
    },
  },
};

// Export tool handlers
export { functionExecutionTrace, functionHealthCheck, schedulerStatus };

// Export schedulerStatusSchema (imported above)
export { schedulerStatusSchema };
