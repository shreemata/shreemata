# Design Document: Multi-Level Referral System

## Overview

This design document outlines the architecture and implementation strategy for a sophisticated multi-level referral commission system. The system manages a tree-based referral structure where users can refer others and earn commissions from purchases made throughout their referral network. The system implements a 10% commission allocation from each order, distributed across direct referrals, tree-based commissions, and trust funds.

The key innovation of this system is the dual-tracking mechanism: it maintains both the direct referral relationship (who invited whom) and the tree placement relationship (where users are positioned in the organizational structure). This allows for accurate commission distribution while managing network growth through a spillover mechanism.

## Architecture

### High-Level Architecture

The system follows a layered architecture pattern:

```
┌─────────────────────────────────────────┐
│         Presentation Layer              │
│  (Frontend UI - Referral Dashboard)     │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         API Layer (Express Routes)      │
│  - Referral Management                  │
│  - Commission Calculation               │
│  - Tree Visualization                   │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│       Business Logic Layer              │
│  - Tree Placement Algorithm             │
│  - Commission Distribution Engine       │
│  - Trust Fund Management                │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         Data Access Layer               │
│  (Mongoose Models & MongoDB)            │
└─────────────────────────────────────────┘
```

### System Components

1. **Referral Management Service**: Handles referral code generation, validation, and relationship creation
2. **Tree Placement Engine**: Implements the serial placement algorithm for organizing users in the tree structure
3. **Commission Calculator**: Computes and distributes commissions based on order amounts and tree relationships
4. **Trust Fund Manager**: Tracks and manages Trust Fund and Development Trust Fund balances
5. **Analytics Service**: Provides insights and reporting on referral program performance

## Components and Interfaces

### 1. Enhanced User Model

The User model will be extended to support the dual-tracking referral system:

```javascript
{
  // Existing fields...
  
  // Direct Referral Tracking
  referralCode: String,           // Unique code for this user
  referredBy: String,             // Code of user who directly referred them
  
  // Tree Placement Tracking
  treeParent: ObjectId,           // User under whom they're placed in tree
  treeChildren: [ObjectId],       // Users placed directly under them (max 5)
  treeLevel: Number,              // Depth in tree (1 = root, 2 = first level, etc.)
  treePosition: Number,           // Serial position among siblings
  
  // Commission Tracking
  wallet: Number,                 // Total commission balance
  directCommissionEarned: Number, // Total from direct referrals
  treeCommissionEarned: Number,   // Total from tree structure
  
  // Metadata
  referralJoinedAt: Date,         // When they joined via referral
  firstPurchaseDone: Boolean      // Whether they've made first purchase
}
```

### 2. Commission Transaction Model

New model to track all commission transactions:

```javascript
{
  orderId: ObjectId,              // Reference to order
  purchaser: ObjectId,            // User who made purchase
  orderAmount: Number,            // Total order amount
  
  // Direct Commission (3%)
  directReferrer: ObjectId,       // User who gets direct commission
  directCommissionAmount: Number, // 3% of order amount
  
  // Tree Commissions (up to 3% total)
  treeCommissions: [{
    recipient: ObjectId,          // User receiving commission
    level: Number,                // Their level relative to purchaser
    percentage: Number,           // Commission percentage (1.5%, 0.75%, etc.)
    amount: Number                // Calculated commission amount
  }],
  
  // Trust Funds
  trustFundAmount: Number,        // 3% to Trust Fund
  devTrustFundAmount: Number,     // 1% to Development Trust Fund
  remainderToDevFund: Number,     // Any unused tree commission
  
  // Metadata
  processedAt: Date,
  status: String                  // 'pending', 'completed', 'failed'
}
```

### 3. Trust Fund Model

New model to track trust fund balances and transactions:

```javascript
{
  fundType: String,               // 'trust' or 'development'
  balance: Number,                // Current balance
  transactions: [{
    orderId: ObjectId,            // Source order
    amount: Number,               // Amount added
    type: String,                 // 'order_allocation', 'remainder', 'withdrawal'
    timestamp: Date,
    description: String
  }],
  lastUpdated: Date
}
```

### 4. API Endpoints

#### Referral Management
- `POST /api/referral/generate-code` - Generate referral code for user
- `POST /api/referral/validate-code` - Validate referral code during signup
- `GET /api/referral/details` - Get user's referral information and tree position

#### Tree Operations
- `GET /api/referral/tree` - Get user's referral tree structure
- `GET /api/referral/tree/path` - Get path from root to user
- `GET /api/referral/tree/stats` - Get tree statistics (depth, width, etc.)

#### Commission Management
- `GET /api/referral/commissions` - Get commission history
- `GET /api/referral/commissions/breakdown` - Get detailed commission breakdown by order
- `POST /api/referral/withdraw` - Request withdrawal from wallet

#### Admin Endpoints
- `GET /api/admin/trust-funds` - Get trust fund balances and history
- `GET /api/admin/referral-analytics` - Get system-wide referral analytics
- `GET /api/admin/referral-tree/complete` - Get complete referral tree structure for admin view
- `GET /api/admin/referral-tree/level/:level` - Get specific level of referral tree
- `GET /api/admin/referral-tree/stats` - Get tree statistics (levels, fill rates, growth metrics)
- `POST /api/admin/trust-funds/withdraw` - Withdraw from trust funds
- `GET /api/admin/commission-report` - Generate commission reports

## Data Models

### User Schema Extensions

```javascript
const userSchema = new mongoose.Schema({
  // ... existing fields ...
  
  // Direct Referral System
  referralCode: { 
    type: String, 
    unique: true, 
    sparse: true,
    index: true 
  },
  referredBy: { 
    type: String, 
    default: null,
    index: true 
  },
  
  // Tree Placement System
  treeParent: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    default: null,
    index: true
  },
  treeChildren: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  treeLevel: { 
    type: Number, 
    default: 0 
  },
  treePosition: { 
    type: Number, 
    default: 0 
  },
  
  // Commission Tracking
  wallet: { 
    type: Number, 
    default: 0 
  },
  directCommissionEarned: { 
    type: Number, 
    default: 0 
  },
  treeCommissionEarned: { 
    type: Number, 
    default: 0 
  },
  
  // Metadata
  referralJoinedAt: Date,
  firstPurchaseDone: { 
    type: Boolean, 
    default: false 
  },
  referrals: { 
    type: Number, 
    default: 0 
  }
}, { timestamps: true });
```

### Commission Transaction Schema

```javascript
const commissionTransactionSchema = new mongoose.Schema({
  orderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Order', 
    required: true,
    index: true
  },
  purchaser: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  orderAmount: { 
    type: Number, 
    required: true 
  },
  
  // Direct Commission
  directReferrer: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  directCommissionAmount: { 
    type: Number, 
    default: 0 
  },
  
  // Tree Commissions
  treeCommissions: [{
    recipient: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    level: { 
      type: Number, 
      required: true 
    },
    percentage: { 
      type: Number, 
      required: true 
    },
    amount: { 
      type: Number, 
      required: true 
    }
  }],
  
  // Trust Funds
  trustFundAmount: { 
    type: Number, 
    default: 0 
  },
  devTrustFundAmount: { 
    type: Number, 
    default: 0 
  },
  remainderToDevFund: { 
    type: Number, 
    default: 0 
  },
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'failed'], 
    default: 'pending' 
  },
  processedAt: { 
    type: Date, 
    default: Date.now 
  }
}, { timestamps: true });
```

### Trust Fund Schema

```javascript
const trustFundSchema = new mongoose.Schema({
  fundType: { 
    type: String, 
    enum: ['trust', 'development'], 
    required: true, 
    unique: true 
  },
  balance: { 
    type: Number, 
    default: 0 
  },
  transactions: [{
    orderId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Order' 
    },
    amount: { 
      type: Number, 
      required: true 
    },
    type: { 
      type: String, 
      enum: ['order_allocation', 'remainder', 'withdrawal'], 
      required: true 
    },
    timestamp: { 
      type: Date, 
      default: Date.now 
    },
    description: String
  }],
  lastUpdated: { 
    type: Date, 
    default: Date.now 
  }
}, { timestamps: true });
```

## Algorithms

### Tree Placement Algorithm

The tree placement algorithm ensures users are placed serially with a maximum of 5 direct children per node:

```javascript
async function findTreePlacement(directReferrerId) {
  const directReferrer = await User.findById(directReferrerId);
  
  // If direct referrer has less than 5 children, place directly under them
  if (directReferrer.treeChildren.length < 5) {
    return {
      parentId: directReferrerId,
      level: directReferrer.treeLevel + 1,
      position: directReferrer.treeChildren.length
    };
  }
  
  // Otherwise, find placement using breadth-first search
  const queue = [...directReferrer.treeChildren];
  
  while (queue.length > 0) {
    const candidateId = queue.shift();
    const candidate = await User.findById(candidateId)
      .populate('treeChildren');
    
    // If this candidate has space, place here
    if (candidate.treeChildren.length < 5) {
      return {
        parentId: candidateId,
        level: candidate.treeLevel + 1,
        position: candidate.treeChildren.length
      };
    }
    
    // Otherwise, add their children to queue
    queue.push(...candidate.treeChildren.map(c => c._id));
  }
  
  // Fallback (should never reach here)
  throw new Error('Unable to find tree placement');
}
```

### Commission Distribution Algorithm

The commission distribution algorithm calculates and distributes commissions when an order is completed:

```javascript
async function distributeCommissions(orderId, purchaserId, orderAmount) {
  const purchaser = await User.findById(purchaserId);
  const transaction = new CommissionTransaction({
    orderId,
    purchaser: purchaserId,
    orderAmount
  });
  
  // 1. Allocate 3% to Trust Fund
  const trustFundAmount = orderAmount * 0.03;
  await addToTrustFund('trust', trustFundAmount, orderId);
  transaction.trustFundAmount = trustFundAmount;
  
  // 2. Calculate Direct Commission (3%)
  if (purchaser.referredBy) {
    const directReferrer = await User.findOne({ 
      referralCode: purchaser.referredBy 
    });
    
    if (directReferrer) {
      const directCommission = orderAmount * 0.03;
      directReferrer.wallet += directCommission;
      directReferrer.directCommissionEarned += directCommission;
      await directReferrer.save();
      
      transaction.directReferrer = directReferrer._id;
      transaction.directCommissionAmount = directCommission;
    }
  }
  
  // 3. Allocate 1% to Development Trust Fund
  const devTrustAmount = orderAmount * 0.01;
  await addToTrustFund('development', devTrustAmount, orderId);
  transaction.devTrustFundAmount = devTrustAmount;
  
  // 4. Distribute Tree Commissions (3% total)
  const treeCommissionPool = orderAmount * 0.03;
  let remainingPool = treeCommissionPool;
  let currentParent = purchaser.treeParent;
  let level = 1;
  let percentage = 1.5; // Start with 1.5% for first level
  
  while (currentParent && remainingPool > 0.01) {
    const parent = await User.findById(currentParent);
    const commissionAmount = orderAmount * (percentage / 100);
    
    // Only distribute if we have enough in the pool
    if (commissionAmount <= remainingPool) {
      parent.wallet += commissionAmount;
      parent.treeCommissionEarned += commissionAmount;
      await parent.save();
      
      transaction.treeCommissions.push({
        recipient: parent._id,
        level,
        percentage,
        amount: commissionAmount
      });
      
      remainingPool -= commissionAmount;
      currentParent = parent.treeParent;
      level++;
      percentage = percentage / 2; // Halve for next level
    } else {
      break;
    }
  }
  
  // 5. Any remainder goes to Development Trust Fund
  if (remainingPool > 0) {
    await addToTrustFund('development', remainingPool, orderId);
    transaction.remainderToDevFund = remainingPool;
  }
  
  transaction.status = 'completed';
  await transaction.save();
  
  return transaction;
}
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Referral code uniqueness
*For any* set of generated referral codes, no two codes should be identical.
**Validates: Requirements 1.2**

### Property 2: Referral relationship completeness
*For any* created referral relationship, the record must contain both user identifiers (referrer and referee) and a timestamp.
**Validates: Requirements 1.4**

### Property 3: Initial placement correctness
*For any* user with fewer than 5 direct tree children, when a new referral is added, the referee should be placed directly under the referrer at level (referrer.level + 1).
**Validates: Requirements 2.1, 2.2**

### Property 4: Serial spillover placement
*For any* user with 5 or more direct tree children, when a new referral is added, the referee should be placed under the first available tree child (in chronological order) that has fewer than 5 children.
**Validates: Requirements 2.4**

### Property 5: Commission allocation totals 10%
*For any* completed order, the sum of (Trust Fund allocation + Direct Commission + Development Trust Fund + Tree Commissions) should equal exactly 10% of the order amount.
**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

### Property 6: Direct commission calculation
*For any* order where the purchaser has a direct referrer, the direct commission should equal exactly 3% of the order amount.
**Validates: Requirements 4.2**

### Property 7: Direct commission crediting
*For any* direct commission calculated, the direct referrer's wallet balance should increase by exactly the commission amount.
**Validates: Requirements 4.3**

### Property 8: No-referrer commission allocation
*For any* order where the purchaser has no direct referrer, the 3% direct commission should be allocated to the Trust Fund.
**Validates: Requirements 4.4, 10.3**

### Property 9: Tree commission halving
*For any* sequence of tree commission calculations, each level's commission percentage should be exactly half of the previous level's percentage (1.5%, 0.75%, 0.375%, etc.).
**Validates: Requirements 5.5**

### Property 10: Tree commission upper bound
*For any* order's tree commission distribution, the sum of all tree commissions should never exceed 3% of the order amount.
**Validates: Requirements 5.6**

### Property 11: Remainder allocation
*For any* order where tree commissions sum to less than 3% and no more tree parents exist, the remainder should be allocated to the Development Trust Fund.
**Validates: Requirements 5.7**

### Property 12: No-referrer tree placement
*For any* user who signs up without a referral code, they should still be placed in the referral tree using the same serial placement algorithm.
**Validates: Requirements 10.1, 10.2**

### Property 13: No-referrer referral capability
*For any* user without a referrer who refers others, they should earn commissions normally from their referrals.
**Validates: Requirements 10.4**

### Property 14: Trust fund balance consistency
*For any* trust fund (Trust or Development), the balance should equal the sum of all transaction amounts in its transaction history.
**Validates: Requirements 6.1, 6.2**

### Property 15: Trust fund transaction completeness
*For any* allocation to a trust fund, a transaction record must be created containing timestamp, amount, and source order reference.
**Validates: Requirements 6.5**

### Property 16: Tree query completeness
*For any* user, querying their referral tree should return all users where that user is recorded as the tree parent.
**Validates: Requirements 7.1**

### Property 17: Tree level accuracy
*For any* user in the tree, their tree level should equal their tree parent's level plus one.
**Validates: Requirements 7.3**

### Property 18: Dual relationship tracking
*For any* referee placed in the tree, both their direct referrer (referredBy) and tree parent (treeParent) relationships must be recorded, with referredBy being null for users without referrers.
**Validates: Requirements 11.3**

### Property 19: Complete tree query accuracy
*For any* admin request for the complete referral tree, the returned structure should include all users with their correct tree positions and relationships.
**Validates: Requirements 11.1, 11.2**

### Property 20: Tree level capacity calculation
*For any* tree level, the system should accurately calculate and display the current fill status (occupied positions / total possible positions).
**Validates: Requirements 11.4**

### Property 21: No-referrer user identification
*For any* user who joined without a referral code, they should be clearly identifiable in the admin tree view.
**Validates: Requirements 11.3**

### Property 22: Timestamp-based ordering
*For any* set of referrals under the same parent, their tree positions should correspond to their chronological order of creation based on timestamps.
**Validates: Requirements 12.2**

## Error Handling

### Referral Code Validation Errors
- **Invalid Referral Code**: Return 400 error when signup uses non-existent referral code
- **Self-Referral**: Prevent users from using their own referral code
- **Duplicate Referral Code**: Handle unique constraint violations during code generation

### Tree Placement Errors
- **Orphaned User**: If tree parent cannot be found, log error and place under system root
- **Circular Reference**: Detect and prevent circular tree relationships
- **Concurrent Placement**: Use database transactions to prevent race conditions during placement

### Commission Calculation Errors
- **Missing Order Data**: Skip commission processing if order amount is invalid
- **Negative Amounts**: Validate all commission amounts are non-negative
- **Rounding Errors**: Use precise decimal arithmetic to prevent accumulation of rounding errors
- **Database Transaction Failures**: Rollback all commission credits if any part fails

### Trust Fund Errors
- **Insufficient Balance**: Prevent withdrawals exceeding available balance
- **Transaction Recording Failure**: Retry transaction recording with exponential backoff
- **Balance Mismatch**: Implement periodic reconciliation to detect and fix discrepancies

### API Error Responses
All errors should return consistent JSON structure:
```javascript
{
  error: "Error message",
  code: "ERROR_CODE",
  details: { /* additional context */ }
}
```

## Testing Strategy

### Unit Testing

Unit tests will cover specific examples and edge cases:

1. **Referral Code Generation**
   - Test code uniqueness with multiple generations
   - Test code format and length
   - Test handling of generation failures

2. **Tree Placement Logic**
   - Test placement of first 5 referrals (direct placement)
   - Test 6th referral placement (first spillover)
   - Test placement when multiple nodes are full
   - Test placement with deep trees (5+ levels)

3. **Commission Calculations**
   - Test commission breakdown for various order amounts
   - Test edge case: order with no referrer
   - Test edge case: order with shallow tree (1-2 levels)
   - Test edge case: order with deep tree (5+ levels)
   - Test remainder allocation when tree commissions < 3%

4. **Trust Fund Management**
   - Test balance updates with multiple transactions
   - Test transaction history recording
   - Test withdrawal validation

5. **API Endpoints**
   - Test authentication and authorization
   - Test input validation
   - Test error responses
   - Test pagination for large datasets

### Property-Based Testing

The system will use **fast-check** (for JavaScript/Node.js) as the property-based testing library. Each property-based test will run a minimum of 100 iterations to ensure thorough coverage.

Property-based tests will verify universal properties across randomly generated inputs:

1. **Referral System Properties**
   - Generate random user sets and verify code uniqueness
   - Generate random referral relationships and verify data completeness
   - Generate random tree structures and verify placement rules

2. **Commission Distribution Properties**
   - Generate random order amounts and verify 10% total allocation
   - Generate random tree structures and verify commission percentages
   - Generate random tree depths and verify halving pattern
   - Generate random scenarios and verify upper bound constraints

3. **Trust Fund Properties**
   - Generate random transaction sequences and verify balance consistency
   - Generate random allocations and verify transaction completeness

4. **Tree Structure Properties**
   - Generate random tree operations and verify level calculations
   - Generate random placements and verify serial ordering
   - Generate random queries and verify completeness

Each property-based test will be tagged with a comment explicitly referencing the correctness property from this design document using the format: `**Feature: multi-level-referral-system, Property {number}: {property_text}**`

### Integration Testing

Integration tests will verify end-to-end workflows:

1. **Complete Referral Flow**
   - User A signs up → generates referral code
   - Users B-F sign up with A's code → verify direct placement
   - User G signs up with A's code → verify spillover placement
   - User B makes purchase → verify commission distribution

2. **Multi-Level Commission Flow**
   - Build tree with 3+ levels
   - User at level 3 makes purchase
   - Verify commissions distributed to all upline users
   - Verify trust fund allocations

3. **Trust Fund Accumulation**
   - Process multiple orders
   - Verify trust fund balances accumulate correctly
   - Verify transaction history is complete

### Performance Testing

1. **Tree Placement Performance**
   - Test placement speed with trees of 1000+ users
   - Measure query performance for deep trees (10+ levels)

2. **Commission Calculation Performance**
   - Test calculation speed for orders with deep referral chains
   - Measure database transaction time for commission distribution

3. **API Response Times**
   - Test tree visualization endpoint with large trees
   - Test commission history endpoint with thousands of transactions

## Security Considerations

1. **Referral Code Security**
   - Use cryptographically secure random generation
   - Implement rate limiting on code validation attempts
   - Prevent enumeration attacks

2. **Commission Manipulation Prevention**
   - Validate all commission calculations server-side
   - Use database transactions to ensure atomicity
   - Implement audit logging for all commission changes

3. **Authorization**
   - Users can only view their own referral data
   - Admins require special permissions for trust fund operations
   - Implement JWT-based authentication

4. **Data Integrity**
   - Use database constraints to enforce referential integrity
   - Implement periodic reconciliation jobs
   - Log all financial transactions for audit trail

## Performance Optimization

1. **Database Indexing**
   - Index on `referralCode` for fast lookups
   - Index on `referredBy` for referral queries
   - Index on `treeParent` for tree traversal
   - Compound index on `(orderId, status)` for commission queries

2. **Caching Strategy**
   - Cache user's direct referral count (TTL: 5 minutes)
   - Cache trust fund balances (TTL: 1 minute)
   - Cache tree structure for visualization (TTL: 10 minutes)

3. **Query Optimization**
   - Use aggregation pipelines for analytics queries
   - Implement pagination for large result sets
   - Use projection to limit returned fields

4. **Async Processing**
   - Process commission distribution asynchronously after order completion
   - Use job queue for trust fund reconciliation
   - Implement retry mechanism for failed transactions

## Deployment Considerations

1. **Database Migration**
   - Create migration scripts to add new fields to User model
   - Backfill existing users with tree placement data
   - Create indexes before deploying new code

2. **Backward Compatibility**
   - Maintain existing referral endpoints during transition
   - Gradually migrate users to new tree structure
   - Support both old and new commission calculation methods temporarily

3. **Monitoring**
   - Track commission distribution success rate
   - Monitor trust fund balance growth
   - Alert on commission calculation failures
   - Track API response times

4. **Rollback Plan**
   - Keep old commission calculation code available
   - Implement feature flags for gradual rollout
   - Maintain database backups before migration
