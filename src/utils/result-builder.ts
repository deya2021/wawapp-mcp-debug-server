/**
 * Diagnostic Result Builder Utility
 *
 * Fluent API for constructing StandardDiagnosticResult objects.
 * Simplifies atom implementation by providing a consistent builder pattern.
 *
 * @author WawApp Development Team
 * @date 2025-12-13
 * @version 2.0 (Phase 1)
 */

import type {
  StandardDiagnosticResult,
  DiagnosticStatus,
  BlockingReason,
  Evidence,
  SuggestedFix,
  LinkedFailure,
} from '../types/standard-output.js';

export class DiagnosticResultBuilder {
  private status?: DiagnosticStatus;
  private summary?: string;
  private blockingReasons: BlockingReason[] = [];
  private evidence: Evidence[] = [];
  private suggestedFixes: SuggestedFix[] = [];
  private linkedFailures: LinkedFailure[] = [];
  private legacy?: any;

  constructor(
    private toolName: string,
    private toolVersion: string = '2.0'
  ) {}

  setStatus(status: DiagnosticStatus): this {
    this.status = status;
    return this;
  }

  setSummary(summary: string): this {
    this.summary = summary;
    return this;
  }

  addBlockingReason(reason: BlockingReason): this {
    this.blockingReasons.push(reason);
    return this;
  }

  addEvidence(evidence: Evidence): this {
    this.evidence.push(evidence);
    return this;
  }

  addSuggestedFix(fix: SuggestedFix): this {
    this.suggestedFixes.push(fix);
    return this;
  }

  linkFailure(
    failureId: string,
    title: string,
    likelihood: 'LOW' | 'MEDIUM' | 'HIGH'
  ): this {
    this.linkedFailures.push({ failureId, title, likelihood });
    return this;
  }

  setLegacy(legacy: any): this {
    this.legacy = legacy;
    return this;
  }

  /**
   * Build final result with metadata
   */
  build(startTime: Date): StandardDiagnosticResult {
    const endTime = new Date();
    const runId = `${this.toolName}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    return {
      status: this.status || 'INCONCLUSIVE',
      summary: this.summary || 'No summary provided',
      blockingReasons: this.blockingReasons,
      evidence: this.evidence,
      suggestedFixes: this.suggestedFixes,
      linkedFailures: this.linkedFailures,
      meta: {
        toolName: this.toolName,
        toolVersion: this.toolVersion,
        runId,
        startedAt: startTime.toISOString(),
        completedAt: endTime.toISOString(),
        durationMs: endTime.getTime() - startTime.getTime(),
      },
      _legacy: this.legacy,
    };
  }
}
