export class MCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'MCPError';
  }
}

export function normalizeError(error: any): MCPError {
  if (error instanceof MCPError) {
    return error;
  }

  // Firestore errors
  if (error.code === 'permission-denied' || error.code === 7) {
    return new MCPError(
      'Insufficient permissions to access Firestore',
      'PERMISSION_DENIED',
      { originalError: error.message }
    );
  }

  if (error.code === 'not-found' || error.code === 5) {
    return new MCPError(
      'Document not found',
      'NOT_FOUND',
      { originalError: error.message }
    );
  }

  // Cloud Logging errors
  if (error.code === 403 || error.statusCode === 403) {
    return new MCPError(
      'Insufficient permissions to access Cloud Logging',
      'PERMISSION_DENIED',
      { originalError: error.message }
    );
  }

  // Validation errors
  if (error.name === 'ZodError') {
    return new MCPError(
      'Invalid input parameters',
      'VALIDATION_ERROR',
      { errors: error.errors }
    );
  }

  // Generic error
  return new MCPError(
    error.message || 'Unknown error',
    'INTERNAL_ERROR',
    { originalError: error.toString() }
  );
}
