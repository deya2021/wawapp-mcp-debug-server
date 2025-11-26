import { applyMiddleware } from './middleware.js';

// Import kits
import * as kit1 from '../kits/kit1-order-lifecycle/index.js';
import * as kit2 from '../kits/kit2-driver-matching/index.js';
import * as kit3 from '../kits/kit3-data-quality/index.js';
import * as kit4 from '../kits/kit4-location-intelligence/index.js';
import * as kit5 from '../kits/kit5-notifications/index.js';
import * as kit6 from '../kits/kit6-cloud-functions/index.js';
import * as kit7 from '../kits/kit7-system-health/index.js';
import * as kit8 from '../kits/kit8-auth-flow/index.js';

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

    // Kit 1: Order Lifecycle Inspector (NEW TOOLS)
    {
      name: kit1.orderSearchSchema.name,
      description: kit1.orderSearchSchema.description,
      inputSchema: kit1.orderSearchSchema.inputSchema,
      handler: applyMiddleware(kit1.orderSearchSchema.name, kit1.orderSearch),
    },
    {
      name: kit1.orderAnomaliesSchema.name,
      description: kit1.orderAnomaliesSchema.description,
      inputSchema: kit1.orderAnomaliesSchema.inputSchema,
      handler: applyMiddleware(kit1.orderAnomaliesSchema.name, kit1.orderAnomalies),
    },
    {
      name: kit1.orderStatsSchema.name,
      description: kit1.orderStatsSchema.description,
      inputSchema: kit1.orderStatsSchema.inputSchema,
      handler: applyMiddleware(kit1.orderStatsSchema.name, kit1.orderStats),
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
    {
      name: kit2.orderVisibilitySchema.name,
      description: kit2.orderVisibilitySchema.description,
      inputSchema: kit2.orderVisibilitySchema.inputSchema,
      handler: applyMiddleware(kit2.orderVisibilitySchema.name, kit2.orderVisibility),
    },
    {
      name: kit2.nearbyDriversSchema.name,
      description: kit2.nearbyDriversSchema.description,
      inputSchema: kit2.nearbyDriversSchema.inputSchema,
      handler: applyMiddleware(kit2.nearbyDriversSchema.name, kit2.nearbyDrivers),
    },
    {
      name: kit2.matchingPerformanceSchema.name,
      description: kit2.matchingPerformanceSchema.description,
      inputSchema: kit2.matchingPerformanceSchema.inputSchema,
      handler: applyMiddleware(kit2.matchingPerformanceSchema.name, kit2.matchingPerformance),
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

    // Kit 4: Real-time Location Intelligence (NEW KIT)
    {
      name: kit4.driverLocationStatusSchema.name,
      description: kit4.driverLocationStatusSchema.description,
      inputSchema: kit4.driverLocationStatusSchema.inputSchema,
      handler: applyMiddleware(kit4.driverLocationStatusSchema.name, kit4.driverLocationStatus),
    },
    {
      name: kit4.locationDensityHeatmapSchema.name,
      description: kit4.locationDensityHeatmapSchema.description,
      inputSchema: kit4.locationDensityHeatmapSchema.inputSchema,
      handler: applyMiddleware(kit4.locationDensityHeatmapSchema.name, kit4.locationDensityHeatmap),
    },
    {
      name: kit4.tripRouteAnalyzerSchema.name,
      description: kit4.tripRouteAnalyzerSchema.description,
      inputSchema: kit4.tripRouteAnalyzerSchema.inputSchema,
      handler: applyMiddleware(kit4.tripRouteAnalyzerSchema.name, kit4.tripRouteAnalyzer),
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
    {
      name: kit5.notificationBatchCheckSchema.name,
      description: kit5.notificationBatchCheckSchema.description,
      inputSchema: kit5.notificationBatchCheckSchema.inputSchema,
      handler: applyMiddleware(
        kit5.notificationBatchCheckSchema.name,
        kit5.notificationBatchCheck
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
    {
      name: kit6.schedulerStatusSchema.name,
      description: kit6.schedulerStatusSchema.description,
      inputSchema: kit6.schedulerStatusSchema.inputSchema,
      handler: applyMiddleware(
        kit6.schedulerStatusSchema.name,
        kit6.schedulerStatus
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
    {
      name: kit7.performanceTrendsSchema.name,
      description: kit7.performanceTrendsSchema.description,
      inputSchema: kit7.performanceTrendsSchema.inputSchema,
      handler: applyMiddleware(
        kit7.performanceTrendsSchema.name,
        kit7.performanceTrends
      ),
    },
    {
      name: kit7.errorRateMonitorSchema.name,
      description: kit7.errorRateMonitorSchema.description,
      inputSchema: kit7.errorRateMonitorSchema.inputSchema,
      handler: applyMiddleware(
        kit7.errorRateMonitorSchema.name,
        kit7.errorRateMonitor
      ),
    },
    {
      name: kit7.incidentReportSchema.name,
      description: kit7.incidentReportSchema.description,
      inputSchema: kit7.incidentReportSchema.inputSchema,
      handler: applyMiddleware(
        kit7.incidentReportSchema.name,
        kit7.incidentReport
      ),
    },

    // Kit 8: Auth & App Flow Diagnostics
    {
      name: kit8.authSessionCheckSchema.name,
      description: kit8.authSessionCheckSchema.description,
      inputSchema: kit8.authSessionCheckSchema.inputSchema,
      handler: applyMiddleware(
        kit8.authSessionCheckSchema.name,
        kit8.authSessionCheck
      ),
    },
    {
      name: kit8.authFlowAuditSchema.name,
      description: kit8.authFlowAuditSchema.description,
      inputSchema: kit8.authFlowAuditSchema.inputSchema,
      handler: applyMiddleware(
        kit8.authFlowAuditSchema.name,
        kit8.authFlowAudit
      ),
    },
    {
      name: kit8.authLoopDetectorSchema.name,
      description: kit8.authLoopDetectorSchema.description,
      inputSchema: kit8.authLoopDetectorSchema.inputSchema,
      handler: applyMiddleware(
        kit8.authLoopDetectorSchema.name,
        kit8.authLoopDetector
      ),
    },
    {
      name: kit8.routeLoopDiagnoserSchema.name,
      description: kit8.routeLoopDiagnoserSchema.description,
      inputSchema: kit8.routeLoopDiagnoserSchema.inputSchema,
      handler: applyMiddleware(
        kit8.routeLoopDiagnoserSchema.name,
        kit8.routeLoopDiagnoser
      ),
    },
    {
      name: kit8.pinFlowCheckerSchema.name,
      description: kit8.pinFlowCheckerSchema.description,
      inputSchema: kit8.pinFlowCheckerSchema.inputSchema,
      handler: applyMiddleware(
        kit8.pinFlowCheckerSchema.name,
        kit8.pinFlowChecker
      ),
    },
    {
      name: kit8.multiDeviceSessionAuditSchema.name,
      description: kit8.multiDeviceSessionAuditSchema.description,
      inputSchema: kit8.multiDeviceSessionAuditSchema.inputSchema,
      handler: applyMiddleware(
        kit8.multiDeviceSessionAuditSchema.name,
        kit8.multiDeviceSessionAudit
      ),
    },
  ];

  return tools;
}
