/**
 * Data Audit Tool
 * Scans Firestore collections for documents that would crash Flutter apps
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';
import { validateOrder } from './validators/order-validator.js';
import { validateDriver } from './validators/driver-validator.js';
import type {
  DocumentValidationResult,
  AuditSummary,
} from './validators/validation-types.js';

const InputSchema = z.object({
  collection: z
    .enum(['orders', 'drivers', 'all'])
    .default('all')
    .describe('Collection to audit (orders, drivers, or all)'),
  city: z
    .string()
    .optional()
    .describe('Filter by city field (for drivers)'),
  region: z
    .string()
    .optional()
    .describe('Filter by region field (for drivers)'),
  limit: z
    .number()
    .int()
    .positive()
    .max(1000)
    .default(100)
    .describe('Maximum documents to scan per collection'),
});

type AuditInput = z.infer<typeof InputSchema>;

/**
 * Main audit function
 */
export async function dataAudit(params: unknown): Promise<any> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();

  const results: AuditSummary[] = [];

  // Audit orders collection
  if (input.collection === 'orders' || input.collection === 'all') {
    const orderAudit = await auditOrders(firestore, input);
    results.push(orderAudit);
  }

  // Audit drivers collection
  if (input.collection === 'drivers' || input.collection === 'all') {
    const driverAudit = await auditDrivers(firestore, input);
    results.push(driverAudit);
  }

  // Calculate overall summary
  const totalScanned = results.reduce((sum, r) => sum + r.totalScanned, 0);
  const totalValid = results.reduce((sum, r) => sum + r.validCount, 0);
  const totalInvalid = results.reduce((sum, r) => sum + r.invalidCount, 0);

  const allProblematicDocs = results.flatMap((r) => r.problematicDocs);

  return {
    summary: {
      totalDocumentsScanned: totalScanned,
      validDocuments: totalValid,
      invalidDocuments: totalInvalid,
      healthScore: totalScanned > 0
        ? `${((totalValid / totalScanned) * 100).toFixed(1)}%`
        : 'N/A',
    },
    collectionResults: results,
    problematicDocuments: allProblematicDocs,
    recommendations: generateRecommendations(allProblematicDocs),
  };
}

/**
 * Audit orders collection
 */
async function auditOrders(
  firestore: FirestoreClient,
  input: AuditInput
): Promise<AuditSummary> {
  const filters: any[] = [];
  const options = { limit: input.limit };

  try {
    const orders = await firestore.queryDocuments('orders', filters, options);

    const problematicDocs: DocumentValidationResult[] = [];
    let validCount = 0;

    for (const order of orders) {
      const validation = validateOrder(order);

      if (!validation.isValid || validation.errors.length > 0) {
        problematicDocs.push({
          docId: order.id,
          collectionName: 'orders',
          isValid: validation.isValid,
          errors: validation.errors,
        });
      } else {
        validCount++;
      }
    }

    return {
      totalScanned: orders.length,
      validCount,
      invalidCount: problematicDocs.length,
      problematicDocs,
      collectionName: 'orders',
      filters: {},
    };
  } catch (error: any) {
    console.error('[data-audit] Error auditing orders:', error);
    return {
      totalScanned: 0,
      validCount: 0,
      invalidCount: 0,
      problematicDocs: [],
      collectionName: 'orders',
      filters: {},
    };
  }
}

/**
 * Audit drivers collection
 */
async function auditDrivers(
  firestore: FirestoreClient,
  input: AuditInput
): Promise<AuditSummary> {
  const filters: any[] = [];

  // Add city filter if provided
  if (input.city) {
    filters.push({
      field: 'city',
      operator: '==' as const,
      value: input.city,
    });
  }

  // Add region filter if provided
  if (input.region) {
    filters.push({
      field: 'region',
      operator: '==' as const,
      value: input.region,
    });
  }

  const options = { limit: input.limit };

  try {
    const drivers = await firestore.queryDocuments('drivers', filters, options);

    const problematicDocs: DocumentValidationResult[] = [];
    let validCount = 0;

    for (const driver of drivers) {
      const validation = validateDriver(driver);

      if (!validation.isValid || validation.errors.length > 0) {
        problematicDocs.push({
          docId: driver.id,
          collectionName: 'drivers',
          isValid: validation.isValid,
          errors: validation.errors,
        });
      } else {
        validCount++;
      }
    }

    return {
      totalScanned: drivers.length,
      validCount,
      invalidCount: problematicDocs.length,
      problematicDocs,
      collectionName: 'drivers',
      filters: {
        city: input.city,
        region: input.region,
      },
    };
  } catch (error: any) {
    console.error('[data-audit] Error auditing drivers:', error);
    return {
      totalScanned: 0,
      validCount: 0,
      invalidCount: 0,
      problematicDocs: [],
      collectionName: 'drivers',
      filters: {
        city: input.city,
        region: input.region,
      },
    };
  }
}

/**
 * Generate actionable recommendations based on found issues
 */
function generateRecommendations(
  problematicDocs: DocumentValidationResult[]
): string[] {
  const recommendations: string[] = [];
  const issueTypes = new Set<string>();

  for (const doc of problematicDocs) {
    for (const error of doc.errors) {
      issueTypes.add(error.field + ':' + error.issue);
    }
  }

  // Analyze common patterns
  const hasCreatedAtIssues = Array.from(issueTypes).some((issue) =>
    issue.includes('createdAt')
  );
  const hasGeoPointIssues = Array.from(issueTypes).some(
    (issue) => issue.includes('.lat') || issue.includes('.lng')
  );
  const hasStatusIssues = Array.from(issueTypes).some((issue) =>
    issue.includes('status')
  );
  const hasDriverProfileIssues = Array.from(issueTypes).some(
    (issue) => issue.includes('isVerified') || issue.includes('name')
  );

  if (hasCreatedAtIssues) {
    recommendations.push(
      '🔴 CRITICAL: Fix createdAt fields - ensure all documents use Firestore Timestamp, not String or null'
    );
    recommendations.push(
      '   → In Flutter: Use FieldValue.serverTimestamp() when creating documents'
    );
    recommendations.push(
      '   → Add null checks in getNearbyOrders() and similar methods'
    );
  }

  if (hasGeoPointIssues) {
    recommendations.push(
      '🔴 CRITICAL: Fix GeoPoint fields - ensure pickup/dropoff have valid lat/lng numbers'
    );
    recommendations.push(
      '   → Validate coordinates before saving: -90 <= lat <= 90, -180 <= lng <= 180'
    );
    recommendations.push(
      '   → Add validation in order creation flow'
    );
  }

  if (hasStatusIssues) {
    recommendations.push(
      '⚠️  WARNING: Fix invalid status values - use only the predefined OrderStatus enum values'
    );
    recommendations.push(
      '   → Valid statuses: matching, requested, assigning, accepted, onRoute, completed, expired, cancelled'
    );
  }

  if (hasDriverProfileIssues) {
    recommendations.push(
      '⚠️  WARNING: Fix incomplete driver profiles - ensure all required fields are set'
    );
    recommendations.push(
      '   → Required fields: name, phone, isVerified (boolean)'
    );
    recommendations.push(
      '   → Add validation in driver registration flow'
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ No critical issues found. All scanned documents are valid!');
  }

  return recommendations;
}

/**
 * Schema for MCP tool registration
 */
export const dataAuditSchema = {
  name: 'wawapp_data_audit',
  description:
    'Scan Firestore data to detect documents that would crash Flutter apps. Validates orders and driver profiles for missing/invalid fields (createdAt, GeoPoints, status, etc.). Returns problematic document IDs with specific validation errors and actionable recommendations.',
  inputSchema: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        enum: ['orders', 'drivers', 'all'],
        description: 'Collection to audit (orders, drivers, or all)',
        default: 'all',
      },
      city: {
        type: 'string',
        description: 'Filter drivers by city (optional)',
      },
      region: {
        type: 'string',
        description: 'Filter drivers by region (optional)',
      },
      limit: {
        type: 'number',
        description: 'Maximum documents to scan per collection (default: 100, max: 1000)',
        default: 100,
      },
    },
  },
};
