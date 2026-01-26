# Implementation Plan

- [x] 1. Extend existing data models for digital content










  - Enhance Book model with digital content fields (googleDriveFileId, onlinePrice, digitalContent object)
  - Create DigitalPurchase model for tracking digital book purchases and reading progress
  - Create ReadingSession model for managing secure reading sessions
  - Add database indexes for efficient digital content queries
  - _Requirements: 1.1, 2.1, 6.1, 7.1_

- [x] 1.1 Write property test for digital content UI consistency


















  - **Property 1: Digital content UI consistency**
  - **Validates: Requirements 1.1, 1.2, 1.3**

- [x] 1.2 Write property test for digital purchase validation






  - **Property 2: Digital purchase validation**
  - **Validates: Requirements 1.4**

- [x] 2. Set up Google Drive integration service





  - Create GoogleDriveService class with PDF upload, download, and streaming capabilities
  - Implement service account authentication for secure API access
  - Add file organization with structured folder hierarchy
  - Implement error handling for API rate limits and network failures
  - _Requirements: 2.1, 5.1, 5.2, 5.3, 5.4_

- [x] 2.1 Write property test for secure content delivery


  - **Property 11: Secure content delivery**
  - **Validates: Requirements 5.1, 5.2**

- [x] 2.2 Write property test for Google Drive error handling


  - **Property 12: Google Drive error handling**
  - **Validates: Requirements 5.3**

- [ ] 3. Enhance admin interface for digital content management





  - Add digital content upload form to admin book management
  - Implement PDF file upload to Google Drive with progress tracking
  - Add online pricing configuration with validation (must be ≤ physical price)
  - Create digital content enable/disable toggle functionality
  - Add digital sales reporting dashboard
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 3.1 Write property test for admin digital content management



  - **Property 4: Admin digital content management**
  - **Validates: Requirements 2.1, 2.3, 2.4**

- [x] 3.2 Write property test for digital pricing validation





  - **Property 5: Digital pricing validation**
  - **Validates: Requirements 2.2**

- [x] 4. Modify book details page for dual pricing display






  - Update book details UI to show both physical and digital purchase options
  - Implement conditional display based on digital content availability
  - Add "Read Online" button with reduced pricing display
  - Integrate with existing cart and payment flow for digital purchases
  - _Requirements: 1.1, 1.2_

- [ ]* 4.1 Write property test for digital purchase completion
  - **Property 3: Digital purchase completion**
  - **Validates: Requirements 1.5**

- [x] 5. Extend payment system for digital purchases




  - Modify existing Razorpay integration to handle digital-only orders
  - Update order creation to distinguish between physical and digital items
  - Implement immediate digital access upon payment verification
  - Create DigitalPurchase records for successful digital transactions
  - Apply existing commission system to digital sales
  - _Requirements: 1.3, 1.5_

- [ ]* 5.1 Write property test for digital sales reporting
  - **Property 6: Digital sales reporting**
  - **Validates: Requirements 2.5**

- [x] 6. Checkpoint - Ensure all tests pass




  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Create protected PDF viewer component
  - Build custom PDF viewer using PDF.js with disabled controls
  - Implement canvas-based rendering to prevent easy content extraction
  - Disable right-click context menu, text selection, and printing
  - Add watermarking overlay with customer identification
  - Implement page navigation with progress tracking
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.3, 4.4_

- [ ]* 7.1 Write property test for content protection comprehensive
  - **Property 7: Content protection comprehensive**
  - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 4.3**

- [ ]* 7.2 Write property test for session watermarking
  - **Property 9: Session watermarking**
  - **Validates: Requirements 4.4**

- [ ] 8. Implement reading session management
  - Create ReadingSessionService for secure session handling
  - Implement session token generation and validation
  - Add concurrent session limits to prevent account sharing
  - Implement session expiration with re-authentication flow
  - Add suspicious activity detection and logging
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ]* 8.1 Write property test for session authentication
  - **Property 15: Session authentication**
  - **Validates: Requirements 6.1**

- [ ]* 8.2 Write property test for session expiration handling
  - **Property 16: Session expiration handling**
  - **Validates: Requirements 6.2**

- [ ]* 8.3 Write property test for concurrent session limits
  - **Property 17: Concurrent session limits**
  - **Validates: Requirements 6.3**

- [ ] 9. Implement progress tracking system
  - Create progress tracking service for automatic page position saving
  - Implement cross-device progress synchronization
  - Add bookmark functionality for important pages
  - Handle progress data corruption with graceful error recovery
  - Store progress data securely associated with user accounts
  - _Requirements: 3.5, 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ]* 9.1 Write property test for progress persistence comprehensive
  - **Property 8: Progress persistence comprehensive**
  - **Validates: Requirements 3.5, 7.1, 7.2, 7.3, 7.4**

- [ ]* 9.2 Write property test for progress error handling
  - **Property 20: Progress error handling**
  - **Validates: Requirements 7.5**

- [ ] 10. Create customer digital library interface
  - Build digital library page showing purchased digital books
  - Implement "Continue Reading" and "Start Reading" buttons
  - Add reading progress indicators and last read timestamps
  - Integrate with existing account dashboard navigation
  - Display digital purchase history and access statistics
  - _Requirements: 1.3, 7.2_

- [ ] 11. Implement content protection and security features
  - Add security event logging for unauthorized access attempts
  - Implement developer tools detection and disabling where possible
  - Add screenshot prevention mechanisms (browser-dependent)
  - Create security monitoring dashboard for administrators
  - Implement account suspension handling for digital content access
  - _Requirements: 4.1, 4.2, 4.5, 6.4, 6.5_

- [ ]* 11.1 Write property test for security event logging
  - **Property 10: Security event logging**
  - **Validates: Requirements 4.5**

- [ ]* 11.2 Write property test for suspicious activity detection
  - **Property 18: Suspicious activity detection**
  - **Validates: Requirements 6.4**

- [ ]* 11.3 Write property test for account suspension handling
  - **Property 19: Account suspension handling**
  - **Validates: Requirements 6.5**

- [ ] 12. Add file management and backup features
  - Implement file integrity verification for Google Drive content
  - Create backup and recovery mechanisms for digital content
  - Add file organization maintenance and cleanup routines
  - Implement automated file availability checking
  - Create admin tools for bulk file operations
  - _Requirements: 5.4, 5.5_

- [ ]* 12.1 Write property test for file organization
  - **Property 13: File organization**
  - **Validates: Requirements 5.4**

- [ ]* 12.2 Write property test for file integrity verification
  - **Property 14: File integrity verification**
  - **Validates: Requirements 5.5**

- [ ] 13. Create API endpoints for digital content operations
  - Build REST API for digital content streaming with authentication
  - Create endpoints for reading session management
  - Implement progress tracking API with real-time updates
  - Add digital purchase verification endpoints
  - Create admin API for digital content management
  - _Requirements: 3.1, 6.1, 7.1, 7.3_

- [ ] 14. Implement error handling and user feedback
  - Add comprehensive error handling for all digital content operations
  - Create user-friendly error messages for common scenarios
  - Implement retry mechanisms for transient failures
  - Add loading states and progress indicators for file operations
  - Create fallback mechanisms for offline scenarios
  - _Requirements: 5.3, 6.2, 7.5_

- [ ] 15. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.