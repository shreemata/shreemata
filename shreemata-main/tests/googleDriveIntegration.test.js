const googleDriveService = require('../services/googleDriveService');

describe('Google Drive Service Integration', () => {
  beforeEach(() => {
    // Reset service state
    googleDriveService.auth = null;
    googleDriveService.drive = null;
    googleDriveService.initialized = false;
    googleDriveService.rootFolderId = null;
  });

  it('should have all required methods', () => {
    expect(typeof googleDriveService.initialize).toBe('function');
    expect(typeof googleDriveService.uploadPDF).toBe('function');
    expect(typeof googleDriveService.getFileStream).toBe('function');
    expect(typeof googleDriveService.deleteFile).toBe('function');
    expect(typeof googleDriveService.verifyFileExists).toBe('function');
    expect(typeof googleDriveService.getFileMetadata).toBe('function');
    expect(typeof googleDriveService.retryOperation).toBe('function');
    expect(typeof googleDriveService.getHealthStatus).toBe('function');
  });

  it('should handle initialization failure gracefully', async () => {
    // Test without service account file
    await expect(googleDriveService.initialize()).rejects.toThrow();
    expect(googleDriveService.initialized).toBe(false);
  });

  it('should require initialization before operations', async () => {
    await expect(googleDriveService.uploadPDF('/fake/path', 'book123', 'Test Book'))
      .rejects.toThrow();
    
    await expect(googleDriveService.getFileStream('fake-file-id'))
      .rejects.toThrow();
    
    await expect(googleDriveService.verifyFileExists('fake-file-id'))
      .rejects.toThrow();
  });

  it('should provide health status', async () => {
    const health = await googleDriveService.getHealthStatus();
    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('initialized');
    expect(health).toHaveProperty('timestamp');
    expect(health.status).toBe('unhealthy'); // Expected since no credentials
    expect(health.initialized).toBe(false);
  });

  it('should handle retry operations correctly', async () => {
    let attempts = 0;
    
    const result = await googleDriveService.retryOperation(async () => {
      attempts++;
      if (attempts < 3) {
        const error = new Error('Temporary failure');
        error.code = 'ECONNRESET';
        throw error;
      }
      return { success: true, attempts };
    });
    
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(3);
    expect(attempts).toBe(3);
  });

  it('should not retry non-retryable errors', async () => {
    let attempts = 0;
    
    await expect(googleDriveService.retryOperation(async () => {
      attempts++;
      const error = new Error('Authentication failed');
      error.code = 401;
      throw error;
    })).rejects.toThrow('Authentication failed');
    
    expect(attempts).toBe(1); // Should not retry
  });

  it('should use exponential backoff for retries', async () => {
    const startTime = Date.now();
    let attempts = 0;
    
    try {
      await googleDriveService.retryOperation(async () => {
        attempts++;
        const error = new Error('Rate limit');
        error.code = 429;
        throw error;
      }, 2, 10); // 2 retries, 10ms base delay
    } catch (error) {
      // Expected to fail after retries
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    expect(attempts).toBe(3); // Initial + 2 retries
    expect(duration).toBeGreaterThan(30); // Should have delays (10ms + 20ms + ...)
  });
});