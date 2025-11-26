import { Logging } from '@google-cloud/logging';
import { currentEnv } from '../config/environment.js';

export interface LogEntry {
  timestamp: string;
  severity: string;
  message: any;
  resource: any;
}

export class CloudLoggingClient {
  private static instance: CloudLoggingClient;
  private logging: Logging;

  private constructor() {
    this.logging = new Logging({ projectId: currentEnv.projectId });
  }

  static getInstance(): CloudLoggingClient {
    if (!this.instance) {
      this.instance = new CloudLoggingClient();
    }
    return this.instance;
  }

  async queryLogs(
    filter: string,
    startTime: Date,
    endTime: Date,
    limit: number = 100
  ): Promise<LogEntry[]> {
    try {
      const timeFilter = `timestamp >= "${startTime.toISOString()}" AND timestamp <= "${endTime.toISOString()}"`;
      const fullFilter = `${filter} AND ${timeFilter}`;

      const [entries] = await this.logging.getEntries({
        filter: fullFilter,
        pageSize: Math.min(limit, 1000),
        orderBy: 'timestamp desc',
      });

      return entries.map((entry: any) => ({
        timestamp: entry.metadata.timestamp || new Date().toISOString(),
        severity: entry.metadata.severity || 'DEFAULT',
        message: entry.data || {},
        resource: entry.metadata.resource || {},
      }));
    } catch (error: any) {
      console.error('[CloudLogging] Query error:', error.message);
      // Return empty array instead of throwing - Cloud Logging permissions might not be granted
      return [];
    }
  }

  async queryFunctionLogs(
    functionName: string,
    startTime: Date,
    endTime: Date,
    limit: number = 100
  ): Promise<LogEntry[]> {
    const filter = `resource.type="cloud_function" AND resource.labels.function_name="${functionName}"`;
    return this.queryLogs(filter, startTime, endTime, limit);
  }

  async queryNotificationLogs(
    orderId: string,
    startTime: Date,
    endTime: Date
  ): Promise<LogEntry[]> {
    // Search for notification logs mentioning this order ID
    const filter = `resource.type="cloud_function" AND resource.labels.function_name="notifyOrderEvents" AND jsonPayload.order_id="${orderId}"`;
    return this.queryLogs(filter, startTime, endTime, 50);
  }

  async queryErrorLogs(
    severity: string,
    startTime: Date,
    endTime: Date,
    limit: number = 100
  ): Promise<LogEntry[]> {
    const filter = `resource.type="cloud_function" AND severity>=${severity}`;
    return this.queryLogs(filter, startTime, endTime, limit);
  }
}
