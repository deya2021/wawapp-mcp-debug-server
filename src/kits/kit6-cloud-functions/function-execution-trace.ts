/**
 * Kit 6: Cloud Function Execution Observer
 * Tool: wawapp_function_execution_trace
 *
 * Traces Cloud Function executions for a specific order or time range.
 * Shows function invocations, parameters, and outcomes.
 *
 * @author WawApp Development Team
 * @date 2025-01-26
 */

import { z } from 'zod';
import { FirestoreClient } from '../../data-access/firestore-client.js';

const InputSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  functionName: z
    .enum(['notifyOrderEvents', 'expireStaleOrders', 'aggregateDriverRating', 'all'])
    .optional()
    .default('all'),
});

interface FunctionExecution {
  function: string;
  expectedTrigger: string;
  expectedTime?: string;
  expectedParameters?: Record<string, any>;
  status: 'likely_executed' | 'should_have_executed' | 'not_applicable' | 'unknown';
  reasoning: string;
  manualVerification: string;
}

interface FunctionExecutionTrace {
  orderId: string;
  orderStatus: string;
  orderCreatedAt: string;
  orderUpdatedAt: string;
  executions: FunctionExecution[];
  summary: {
    totalExpected: number;
    likelyExecuted: number;
    shouldHaveExecuted: number;
    notApplicable: number;
  };
  recommendations: string[];
}

/**
 * Analyzes which Cloud Functions should have been triggered for an order
 */
function analyzeExpectedFunctions(order: any): FunctionExecution[] {
  const executions: FunctionExecution[] = [];
  const orderCreatedAt = new Date(order.createdAt);
  const now = new Date();
  const ageMinutes = Math.floor((now.getTime() - orderCreatedAt.getTime()) / 60000);

  // 1. notifyOrderEvents - triggered on order status changes
  if (order.status === 'accepted' || order.status === 'onRoute' || order.status === 'completed') {
    executions.push({
      function: 'notifyOrderEvents',
      expectedTrigger: `Order status changed to: ${order.status}`,
      expectedTime: order.updatedAt || 'Unknown',
      expectedParameters: {
        orderId: order.id,
        previousStatus: 'Unknown (requires history)',
        newStatus: order.status,
        ownerId: order.ownerId,
        driverId: order.driverId || null,
      },
      status: 'likely_executed',
      reasoning: `Order is in "${order.status}" status, which should trigger notification to client`,
      manualVerification:
        'Check Cloud Function logs: firebase functions:log --only notifyOrderEvents --lines 50 | grep ' +
        order.id,
    });
  } else if (order.status === 'matching') {
    executions.push({
      function: 'notifyOrderEvents',
      expectedTrigger: 'No status transition yet',
      status: 'not_applicable',
      reasoning: 'Order still in initial "matching" status - no notifications triggered yet',
      manualVerification: 'N/A',
    });
  }

  // 2. expireStaleOrders - runs every 2 minutes, expires orders >10 minutes old
  if (order.status === 'matching' && ageMinutes > 10) {
    executions.push({
      function: 'expireStaleOrders',
      expectedTrigger: 'Scheduled (every 2 minutes)',
      expectedTime: `Should have run ${Math.floor(ageMinutes / 2)} times since order creation`,
      expectedParameters: {
        threshold: '10 minutes',
        orderCreatedAt: order.createdAt,
        orderAge: `${ageMinutes} minutes`,
      },
      status: 'should_have_executed',
      reasoning: `Order is ${ageMinutes} minutes old and still in "matching" status - should have been expired`,
      manualVerification:
        'Check why order not expired:\n' +
        '1. firebase functions:log --only expireStaleOrders --lines 100\n' +
        '2. Verify Cloud Scheduler is enabled\n' +
        '3. Check Firestore indexes for orders collection',
    });
  } else if (order.status === 'expired') {
    executions.push({
      function: 'expireStaleOrders',
      expectedTrigger: 'Scheduled (every 2 minutes)',
      expectedTime: order.expiredAt || 'Unknown',
      status: 'likely_executed',
      reasoning: 'Order has "expired" status - expireStaleOrders function successfully ran',
      manualVerification:
        'Verify expiration in logs: firebase functions:log --only expireStaleOrders | grep ' +
        order.id,
    });
  } else {
    executions.push({
      function: 'expireStaleOrders',
      expectedTrigger: 'Scheduled (every 2 minutes)',
      status: 'not_applicable',
      reasoning: `Order in "${order.status}" status - expiration not applicable`,
      manualVerification: 'N/A',
    });
  }

  // 3. aggregateDriverRating - triggered when trip completes with rating
  if (order.status === 'completed' && order.rating !== undefined && order.rating !== null) {
    executions.push({
      function: 'aggregateDriverRating',
      expectedTrigger: 'Order marked as completed with rating',
      expectedTime: order.completedAt || order.updatedAt || 'Unknown',
      expectedParameters: {
        orderId: order.id,
        driverId: order.driverId || 'Unknown',
        rating: order.rating,
      },
      status: 'likely_executed',
      reasoning: `Order completed with rating ${order.rating} - should update driver average rating`,
      manualVerification:
        'Check driver rating was updated:\n' +
        '1. firebase functions:log --only aggregateDriverRating | grep ' +
        order.id +
        '\n' +
        `2. Check /drivers/${order.driverId || 'UNKNOWN'} for updated averageRating field`,
    });
  } else if (order.status === 'completed' && !order.rating) {
    executions.push({
      function: 'aggregateDriverRating',
      expectedTrigger: 'Order completed but no rating provided',
      status: 'not_applicable',
      reasoning: 'Order completed but client has not rated yet',
      manualVerification: 'N/A - waiting for client to submit rating',
    });
  } else {
    executions.push({
      function: 'aggregateDriverRating',
      expectedTrigger: 'Order not completed yet',
      status: 'not_applicable',
      reasoning: `Order in "${order.status}" status - rating aggregation not applicable`,
      manualVerification: 'N/A',
    });
  }

  return executions;
}

export async function functionExecutionTrace(
  params: unknown
): Promise<FunctionExecutionTrace> {
  const input = InputSchema.parse(params);
  const firestore = FirestoreClient.getInstance();
  const recommendations: string[] = [];

  // Fetch order document
  const orderDoc = await firestore.getDocument('orders', input.orderId);

  if (!orderDoc) {
    throw new Error(`Order ${input.orderId} not found in /orders collection`);
  }

  const order = {
    id: input.orderId,
    ...orderDoc,
    createdAt:
      firestore.timestampToDate(orderDoc.createdAt)?.toISOString() || 'Unknown',
    updatedAt:
      firestore.timestampToDate(orderDoc.updatedAt)?.toISOString() || 'Unknown',
    expiredAt: orderDoc.expiredAt
      ? firestore.timestampToDate(orderDoc.expiredAt)?.toISOString()
      : undefined,
    completedAt: orderDoc.completedAt
      ? firestore.timestampToDate(orderDoc.completedAt)?.toISOString()
      : undefined,
  };

  // Analyze expected function executions
  const allExecutions = analyzeExpectedFunctions(order);

  // Filter by function name if specified
  const executions =
    input.functionName === 'all'
      ? allExecutions
      : allExecutions.filter((e) => e.function === input.functionName);

  // Calculate summary
  const summary = {
    totalExpected: executions.length,
    likelyExecuted: executions.filter((e) => e.status === 'likely_executed').length,
    shouldHaveExecuted: executions.filter((e) => e.status === 'should_have_executed')
      .length,
    notApplicable: executions.filter((e) => e.status === 'not_applicable').length,
  };

  // Generate recommendations
  if (summary.shouldHaveExecuted > 0) {
    recommendations.push(
      '⚠️ Some functions SHOULD have executed but may not have:'
    );
    executions
      .filter((e) => e.status === 'should_have_executed')
      .forEach((e) => {
        recommendations.push(`  - ${e.function}: ${e.reasoning}`);
      });
  }

  if (summary.likelyExecuted > 0) {
    recommendations.push(
      `✅ ${summary.likelyExecuted} function(s) likely executed successfully`
    );
  }

  recommendations.push(
    '\n📋 Manual Verification Required:',
    'Cloud Function execution cannot be verified automatically in v1.',
    'Please check Cloud Function logs manually:',
    '',
    '1. View all function logs:',
    '   firebase functions:log --lines 100',
    '',
    '2. Filter by order ID:',
    `   firebase functions:log --lines 100 | grep ${input.orderId}`,
    '',
    '3. View specific function:',
    '   firebase functions:log --only <functionName> --lines 50',
    '',
    '4. Check Cloud Scheduler (for expireStaleOrders):',
    '   https://console.cloud.google.com/cloudscheduler'
  );

  return {
    orderId: input.orderId,
    orderStatus: order.status,
    orderCreatedAt: order.createdAt,
    orderUpdatedAt: order.updatedAt,
    executions,
    summary,
    recommendations,
  };
}
