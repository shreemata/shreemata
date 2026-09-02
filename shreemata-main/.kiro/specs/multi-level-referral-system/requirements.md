# Requirements Document

## Introduction

This document specifies the requirements for a multi-level referral commission system for an e-commerce platform. The system implements a tree-based referral structure where users can refer others and earn commissions from purchases made by their referrals. The system allocates 10% of each order amount to referral commissions and trust funds, with a sophisticated distribution mechanism across multiple levels of the referral tree.

## Glossary

- **Referrer**: A user who invites another user to join the platform using their referral code
- **Referee**: A user who joins the platform using someone else's referral code
- **Direct Referral**: A user who was directly referred by another user (Level 1 relationship)
- **Tree Parent**: The user under whom a referee is placed in the referral tree structure
- **Tree Level**: The depth of a user in the referral tree (Level 2, Level 3, etc.)
- **Spillover**: The process of placing a new referee under an existing referee when the referrer has reached their direct referral limit
- **Serial Placement**: A left-to-right, breadth-first placement strategy for adding new referees to the tree
- **Trust Fund**: A fund that accumulates 3% of each order for platform purposes
- **Development Trust Fund**: A fund that accumulates 1% of each order for development purposes
- **Direct Commission**: The 3% commission paid to the user who directly referred the purchaser
- **Tree Commission**: The 3% commission distributed among users in the upline tree structure
- **Order Amount**: The total monetary value of a purchase transaction

## Requirements

### Requirement 1

**User Story:** As a user, I want to refer new users to the platform using my referral code, so that I can earn commissions from their purchases.

#### Acceptance Criteria

1. WHEN a new user signs up with a referral code THEN the system SHALL create a referral relationship between the referrer and the referee
2. WHEN a user generates a referral code THEN the system SHALL create a unique code that identifies that user
3. WHEN a user views their referral information THEN the system SHALL display their referral code and referral statistics
4. WHEN a referral relationship is created THEN the system SHALL record the timestamp and both user identifiers

### Requirement 2

**User Story:** As a referrer, I want new referrals to be placed in a tree structure with a maximum of 5 direct referrals per person, so that the system can manage growth systematically.

#### Acceptance Criteria

1. WHEN a user refers their first person THEN the system SHALL place the referee directly under the referrer at Level 2
2. WHEN a user refers their second through fifth person THEN the system SHALL place each referee directly under the referrer at Level 2
3. WHEN a user refers their sixth person THEN the system SHALL place the referee at Level 3 under the referrer's first Level 2 referee
4. WHEN a user refers additional people beyond five THEN the system SHALL place them serially under Level 2 referees in the order those Level 2 referees were added
5. WHEN a Level 2 referee has five direct referrals THEN the system SHALL place the next spillover referee under the next Level 2 referee in serial order

### Requirement 3

**User Story:** As the platform administrator, I want 10% of each order amount to be allocated for referral commissions and trust funds, so that the platform can sustain its referral program and development.

#### Acceptance Criteria

1. WHEN an order is completed THEN the system SHALL calculate 10% of the order amount for referral allocation
2. WHEN the 10% referral allocation is calculated THEN the system SHALL allocate 3% to the Trust Fund
3. WHEN the 10% referral allocation is calculated THEN the system SHALL allocate 7% for referral commissions
4. WHEN the 7% referral commission is calculated THEN the system SHALL allocate 3% for direct commission
5. WHEN the 7% referral commission is calculated THEN the system SHALL allocate 1% to the Development Trust Fund
6. WHEN the 7% referral commission is calculated THEN the system SHALL allocate 3% for tree commission distribution

### Requirement 4

**User Story:** As a referrer, I want to receive 3% direct commission when someone I referred makes a purchase, so that I am rewarded for bringing new users to the platform.

#### Acceptance Criteria

1. WHEN a referee makes a purchase THEN the system SHALL identify the user who directly referred them
2. WHEN the direct referrer is identified THEN the system SHALL calculate 3% of the order amount as direct commission
3. WHEN the direct commission is calculated THEN the system SHALL credit the amount to the direct referrer's account
4. WHEN a user has no direct referrer THEN the system SHALL allocate the 3% direct commission to the Trust Fund

### Requirement 5

**User Story:** As a user in the referral tree, I want to receive tree commissions from purchases made by users placed under me in the tree structure, so that I benefit from the growth of my referral network.

#### Acceptance Criteria

1. WHEN a referee makes a purchase THEN the system SHALL identify the tree parent of the purchaser
2. WHEN the tree parent is identified THEN the system SHALL calculate 1.5% of the order amount as Level 2 tree commission
3. WHEN the Level 2 tree commission is calculated THEN the system SHALL credit the amount to the tree parent's account
4. WHEN the tree parent has a parent THEN the system SHALL calculate 0.75% of the order amount as Level 3 tree commission
5. WHEN tree commissions are calculated for each level THEN the system SHALL halve the percentage for each subsequent level (Level 4: 0.375%, Level 5: 0.1875%, etc.)
6. WHEN the sum of all tree commissions reaches or exceeds 3% THEN the system SHALL stop calculating further level commissions
7. WHEN the sum of all tree commissions is less than 3% and no more parents exist THEN the system SHALL allocate the remaining amount to the Development Trust Fund

### Requirement 6

**User Story:** As the platform administrator, I want to track Trust Fund and Development Trust Fund balances separately, so that I can manage platform finances effectively.

#### Acceptance Criteria

1. WHEN the system allocates funds to the Trust Fund THEN the system SHALL increment the Trust Fund balance by the allocated amount
2. WHEN the system allocates funds to the Development Trust Fund THEN the system SHALL increment the Development Trust Fund balance by the allocated amount
3. WHEN an administrator views fund balances THEN the system SHALL display the current Trust Fund balance
4. WHEN an administrator views fund balances THEN the system SHALL display the current Development Trust Fund balance
5. WHEN funds are allocated to either trust fund THEN the system SHALL record the transaction with timestamp, amount, and source order

### Requirement 7

**User Story:** As a user, I want to view my referral tree structure, so that I can understand my network and commission potential.

#### Acceptance Criteria

1. WHEN a user requests their referral tree THEN the system SHALL display all users directly under them
2. WHEN a user requests their referral tree THEN the system SHALL display the tree structure showing placement relationships
3. WHEN displaying the referral tree THEN the system SHALL show each referee's level in the tree
4. WHEN displaying the referral tree THEN the system SHALL show which referees were directly referred versus placed through spillover

### Requirement 8

**User Story:** As a user, I want to view my commission history, so that I can track my earnings from the referral program.

#### Acceptance Criteria

1. WHEN a user requests their commission history THEN the system SHALL display all direct commissions earned
2. WHEN a user requests their commission history THEN the system SHALL display all tree commissions earned
3. WHEN displaying commission history THEN the system SHALL show the date, amount, commission type, and source order for each commission
4. WHEN displaying commission history THEN the system SHALL show the total commission earned
5. WHEN displaying commission history THEN the system SHALL allow filtering by date range and commission type

### Requirement 9

**User Story:** As the platform administrator, I want to view referral system analytics, so that I can monitor the health and growth of the referral program.

#### Acceptance Criteria

1. WHEN an administrator requests referral analytics THEN the system SHALL display total number of referral relationships
2. WHEN an administrator requests referral analytics THEN the system SHALL display total commissions paid out
3. WHEN an administrator requests referral analytics THEN the system SHALL display Trust Fund and Development Trust Fund balances
4. WHEN an administrator requests referral analytics THEN the system SHALL display the deepest level in any referral tree
5. WHEN an administrator requests referral analytics THEN the system SHALL display average commissions per user

### Requirement 10

**User Story:** As a platform administrator, I want users who sign up without a referral code to still be integrated into the referral tree system, so that the platform can benefit from their future referrals while supporting development through their direct commissions.

#### Acceptance Criteria

1. WHEN a user signs up without a referral code THEN the system SHALL still place them in the referral tree structure
2. WHEN a user without a referrer is placed in the tree THEN the system SHALL use the same serial placement algorithm to find their position
3. WHEN a user without a referrer makes a purchase THEN the system SHALL allocate their 3% direct commission to the Trust Fund
4. WHEN a user without a referrer refers others THEN the system SHALL process their referrals normally and they SHALL earn commissions from their referrals
5. WHEN calculating tree commissions for a purchase by a user without a referrer THEN the system SHALL distribute tree commissions normally to their tree parents

### Requirement 11

**User Story:** As a platform administrator, I want to view the complete referral tree structure in a visual format, so that I can monitor how the tree is filling level by level and understand the overall network growth.

#### Acceptance Criteria

1. WHEN an administrator requests the complete referral tree THEN the system SHALL display all users organized in their tree structure
2. WHEN displaying the complete tree THEN the system SHALL show each user's position, level, and referral relationships
3. WHEN viewing the tree structure THEN the system SHALL highlight users who joined without referral codes
4. WHEN displaying tree levels THEN the system SHALL show how each level is filling up (e.g., "Level 2: 15/25 positions filled")
5. WHEN viewing the tree THEN the system SHALL provide filtering options by level, join date, or referral status
6. WHEN the tree becomes large THEN the system SHALL provide pagination or collapsible sections for better navigation
7. WHEN viewing individual nodes THEN the system SHALL show user details like join date, total referrals, and commission earned

### Requirement 12

**User Story:** As a developer, I want the referral tree placement algorithm to be deterministic and consistent, so that users are placed correctly every time.

#### Acceptance Criteria

1. WHEN multiple referrals are added simultaneously THEN the system SHALL process them in a consistent order
2. WHEN calculating tree placement THEN the system SHALL use the timestamp of when each referee was added to determine serial order
3. WHEN a referee is placed in the tree THEN the system SHALL record both their direct referrer and their tree parent
4. WHEN querying tree structure THEN the system SHALL return consistent results based on the recorded relationships
