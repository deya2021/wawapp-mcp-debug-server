import { applyMiddleware } from './middleware.js';

// Import kits
import * as kit1 from '../kits/kit1-order-lifecycle/index.js';
import * as kit2 from '../kits/kit2-driver-matching/index.js';
import * as kit3 from '../kits/kit3-data-quality/index.js';
import * as kit5 from '../kits/kit5-notifications/index.js';
import * as kit6 from '../kits/kit6-cloud-functions/index.js';
import * as kit7 from '../kits/kit7-system-health/index.js';

export interface Tool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (params: any) => Promise<any>;
}

let tools: Tool[] | null = null;

export function getTools(): Tool[] {
  if (tools) return tools;

  tools = [
    // Kit 1: Order Lifecycle Inspector
    {
      name: kit1.orderTraceSchema.name,
      description: kit1.orderTraceSchema.description,
      inputSchema: kit1.orderTraceSchema.inputSchema,
      handler: applyMiddleware(kit1.orderTraceSchema.name, kit1.orderTrace),
    },

    // Kit 2: Driver Matching Diagnostics
    {
      name: kit2.driverEligibilitySchema.name,
      description: kit2.driverEligibilitySchema.description,
      inputSchema: kit2.driverEligibilitySchema.inputSchema,
      handler: applyMiddleware(
        kit2.driverEligibilitySchema.name,
        kit2.driverEligibility
      ),
    },
    {
      name: kit2.driverViewOrdersSchema.name,
      description: kit2.driverViewOrdersSchema.description,
      inputSchema: kit2.driverViewOrdersSchema.inputSchema,
      handler: applyMiddleware(
        kit2.driverViewOrdersSchema.name,
        kit2.driverViewOrders
      ),
    },

    // Kit 3: Data Quality & Diagnostics
    {
      name: kit3.dataAuditSchema.name,
      description: kit3.dataAuditSchema.description,
      inputSchema: kit3.dataAuditSchema.inputSchema,
      handler: applyMiddleware(
        kit3.dataAuditSchema.name,
        kit3.dataAudit
      ),
    },
    {
      name: kit3.backendSimulatorSchema.name,
      description: kit3.backendSimulatorSchema.description,
      inputSchema: kit3.backendSimulatorSchema.inputSchema,
      handler: applyMiddleware(
        kit3.backendSimulatorSchema.name,
        kit3.backendSimulator
      ),
    },
    {
      name: kit3.logAnalyzerSchema.name,
      description: kit3.logAnalyzerSchema.description,
      inputSchema: kit3.logAnalyzerSchema.inputSchema,
      handler: applyMiddleware(
        kit3.logAnalyzerSchema.name,
        kit3.logAnalyzer
      ),
    },

    // Kit 5: Notification Delivery Tracker
    {
      name: kit5.fcmTokenStatusSchema.name,
      description: kit5.fcmTokenStatusSchema.description,
      inputSchema: kit5.fcmTokenStatusSchema.inputSchema,
      handler: applyMiddleware(
        kit5.fcmTokenStatusSchema.name,
        kit5.fcmTokenStatus
      ),
    },
    {
      name: kit5.notificationTraceSchema.name,
      description: kit5.notificationTraceSchema.description,
      inputSchema: kit5.notificationTraceSchema.inputSchema,
      handler: applyMiddleware(
        kit5.notificationTraceSchema.name,
        kit5.notificationTrace
      ),
    },
    {
      name: kit5.notificationDeliveryCheckSchema.name,
      description: kit5.notificationDeliveryCheckSchema.description,
      inputSchema: kit5.notificationDeliveryCheckSchema.inputSchema,
      handler: applyMiddleware(
        kit5.notificationDeliveryCheckSchema.name,
        kit5.notificationDeliveryCheck
      ),
    },

    // Kit 6: Cloud Function Execution Observer
    {
      name: kit6.functionExecutionTraceSchema.name,
      description: kit6.functionExecutionTraceSchema.description,
      inputSchema: kit6.functionExecutionTraceSchema.inputSchema,
      handler: applyMiddleware(
        kit6.functionExecutionTraceSchema.name,
        kit6.functionExecutionTrace
      ),
    },
    {
      name: kit6.functionHealthCheckSchema.name,
      description: kit6.functionHealthCheckSchema.description,
      inputSchema: kit6.functionHealthCheckSchema.inputSchema,
      handler: applyMiddleware(
        kit6.functionHealthCheckSchema.name,
        kit6.functionHealthCheck
      ),
    },

    // Kit 7: System Health Dashboard
    {
      name: kit7.systemHealthSchema.name,
      description: kit7.systemHealthSchema.description,
      inputSchema: kit7.systemHealthSchema.inputSchema,
      handler: applyMiddleware(
        kit7.systemHealthSchema.name,
        kit7.systemHealth
      ),
    },
    {
      name: kit7.activeUsersSchema.name,
      description: kit7.activeUsersSchema.description,
      inputSchema: kit7.activeUsersSchema.inputSchema,
      handler: applyMiddleware(
        kit7.activeUsersSchema.name,
        kit7.activeUsers
      ),
    },
  ];

  return tools;
}
