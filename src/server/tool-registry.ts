import { applyMiddleware } from './middleware.js';

// Import kits
import * as kit1 from '../kits/kit1-order-lifecycle/index.js';
import * as kit2 from '../kits/kit2-driver-matching/index.js';
import * as kit3 from '../kits/kit3-data-quality/index.js';

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
  ];

  return tools;
}
