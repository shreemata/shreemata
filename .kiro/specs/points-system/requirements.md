# Requirements Document

## Introduction

This document specifies the requirements for a points-based reward system integrated with the existing e-commerce platform. The system allows administrators to assign reward points to books, users to earn points through purchases, and users to redeem accumulated points for virtual referrals that participate in the multi-level referral commission structure.

## Glossary

- **Reward Points**: Virtual currency earned by users when purchasing books that have points assigned
- **Points Wallet**: A user's current balance of unredeemed reward points
- **Virtual Referral**: A system-generated user account created when a user redeems 100 points, placed in the referral tree under the redeeming user
- **Points Transaction**: A record of points earned or redeemed by a user
- **Book Points**: The number of reward points assigned to a specific book by administrators
- **Redemption**: The process of converting 100 points into a virtual referral user

## Requirements

### Requirement 1

**User Story:** As an administrator, I want to assign reward points to books, so that I can incentivize purchases of specific titles.

#### Acceptance Criteria

1. WHEN an administrator sets reward points for a book THEN the system SHALL store the points value with the book record
2. WHEN reward points are set THEN the system SHALL validate that the points value is non-negative
3. WHEN an administrator views a book THEN the system SHALL display the current reward points value
4. WHEN an administrator updates reward points THEN the system SHALL allow modification of the points value

### Requirement 2

**User Story:** As a user, I want to earn reward points when I purchase books, so that I can accumulate points for future benefits.

#### Acceptance Criteria

1. WHEN a user completes a purchase containing books with reward points THEN the system SHALL calculate the total points earned
2. WHEN points are calculated THEN the system SHALL sum the reward points from all books in the order
3. WHEN points are earned THEN the system SHALL add the points to the user's points wallet
4. WHEN points are earned THEN the system SHALL increment the user's total points earned counter
5. WHEN points are awarded THEN the system SHALL create a points transaction record with type "earned"

### Requirement 3

**User Story:** As a user, I want to view my points balance and history, so that I can track my rewards and understand how I earned them.

#### Acceptance Criteria

1. WHEN a user views their account THEN the system SHALL display their current points wallet balance
2. WHEN a user views their account THEN the system SHALL display their total points earned lifetime
3. WHEN a user views their points history THEN the system SHALL display all points transactions
4. WHEN displaying points transactions THEN the system SHALL show the date, type, amount, and description for each transaction
5. WHEN displaying points transactions THEN the system SHALL show the balance after each transaction

### Requirement 4

**User Story:** As a user, I want to redeem 100 points to create a virtual referral, so that I can expand my referral network and earn more commissions.

#### Acceptance Criteria

1. WHEN a user has 100 or more points THEN the system SHALL allow redemption for a virtual referral
2. WHEN a user redeems 100 points THEN the system SHALL deduct 100 points from their points wallet
3. WHEN points are redeemed THEN the system SHALL create a virtual user account
4. WHEN a virtual user is created THEN the system SHALL set the original user as the referrer
5. WHEN a virtual user is created THEN the system SHALL place the virtual user in the referral tree using the tree placement algorithm
6. WHEN a virtual user is created THEN the system SHALL mark the user account as virtual with role "virtual"
7. WHEN points are redeemed THEN the system SHALL create a points transaction record with type "redeemed"
8. WHEN a user has less than 100 points THEN the system SHALL prevent redemption attempts

### Requirement 5

**User Story:** As a user, I want virtual referrals to participate in the commission structure, so that I benefit from their placement in my referral tree.

#### Acceptance Criteria

1. WHEN a virtual user is placed in the tree THEN the system SHALL treat them as a regular tree node for commission calculations
2. WHEN commissions are distributed THEN the system SHALL include virtual users in tree traversal
3. WHEN a virtual user is in the commission path THEN the system SHALL calculate commissions as if they were a regular user
4. WHEN displaying the referral tree THEN the system SHALL visually distinguish virtual users from regular users

### Requirement 6

**User Story:** As a user, I want to track how many virtual referrals I've created, so that I can understand my network growth.

#### Acceptance Criteria

1. WHEN a user creates a virtual referral THEN the system SHALL increment their virtual referrals created counter
2. WHEN a user views their account THEN the system SHALL display the number of virtual referrals they have created
3. WHEN a virtual user is created THEN the system SHALL generate a unique name indicating it is virtual and which user created it

### Requirement 7

**User Story:** As an administrator, I want to view points system analytics, so that I can monitor the effectiveness of the rewards program.

#### Acceptance Criteria

1. WHEN an administrator views points analytics THEN the system SHALL display total points awarded across all users
2. WHEN an administrator views points analytics THEN the system SHALL display total points redeemed
3. WHEN an administrator views points analytics THEN the system SHALL display the number of virtual referrals created
4. WHEN an administrator views points analytics THEN the system SHALL display the average points per user

### Requirement 8

**User Story:** As a developer, I want points to be awarded atomically with order completion, so that the system maintains data consistency.

#### Acceptance Criteria

1. WHEN an order is completed THEN the system SHALL award points in the same database transaction as commission distribution
2. WHEN points awarding fails THEN the system SHALL rollback the entire transaction
3. WHEN points are awarded THEN the system SHALL log the operation for audit purposes
4. WHEN checking for automatic redemption THEN the system SHALL verify the user has exactly 100 or more points

### Requirement 9

**User Story:** As a user, I want the system to automatically check if I can create a virtual referral after earning points, so that I don't miss redemption opportunities.

#### Acceptance Criteria

1. WHEN a user earns points THEN the system SHALL check if their points wallet has reached 100 or more
2. WHEN a user has 100 or more points THEN the system SHALL create a virtual referral automatically
3. WHEN a virtual referral is created automatically THEN the system SHALL deduct 100 points from the user's wallet
4. WHEN multiple virtual referrals can be created THEN the system SHALL create only one virtual referral per points earning event

### Requirement 10

**User Story:** As a system administrator, I want virtual users to be clearly identifiable, so that I can distinguish them from regular users in reports and analytics.

#### Acceptance Criteria

1. WHEN a virtual user is created THEN the system SHALL set the isVirtual flag to true
2. WHEN a virtual user is created THEN the system SHALL store a reference to the original user who created it
3. WHEN a virtual user is created THEN the system SHALL generate an email address that indicates it is a system account
4. WHEN a virtual user is created THEN the system SHALL prevent login attempts for virtual users
5. WHEN querying users THEN the system SHALL allow filtering by virtual status
