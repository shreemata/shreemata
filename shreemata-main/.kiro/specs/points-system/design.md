# Design Document: Points System

## Overview

This design document outlines the architecture and implementation strategy for a points-based reward system that integrates with the existing e-commerce and multi-level referral system. The system enables administrators to assign reward points to books, allows users to earn points through purchases, and provides a mechanism for users to redeem accumulated points to create virtual referrals that participate in the commission structure.

The key innovation is the automatic creation of virtual referral users when points are redeemed, which seamlessly integrates with the existing tree placement and commission distribution algorithms. This creates a gamification layer that incentivizes purchases while expanding the referral network.

## Architecture

### High-Level Architecture

The Points System integrates with existing components:

```
┌─────────────────────────────────────────┐
│         Presentation Layer              │
│  - Admin Book Management UI             │
│  - User Points Dashboard                │
│  - Points History View                  │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         API Layer (Express Routes)      │
│  - Points Management                    │
│  - Virtual Referral Creation            │
│  - Points Analytics                     │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│       Business Logic Layer              │
│  - Points Award Service                 │
│  - Virtual Referral Service             │
│  - Points Transaction Manager           │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         Data Access Layer               │
│  - Book Model (extended)                │
│  - User Model (extended)                │
│  - PointsTransaction Model (new)        │
└─────────────────────────────────────────┘
```

### Integration Points

1. **Order Completion Hook**: Points are awarded when orders are completed, integrated with the existing commission distribution flow
2. **Tree Placement Service**: Virtual referrals use the existing tree placement algorithm
3. **User Model**: Extended to include points wallet and virtual user tracking
4. **Book Model**: Extended to include reward points field

## Components and Interfaces

### 1. Extended Book Model

The Book model will be extended to support reward points:

```javascript
{
  // Existing fields...
  
  // Points System
  rewardPoints: {
    type: Number,
    default: 0,
    min: 0
  }
}
```

### 2. Extended User Model

The User model will be extended to support points wallet and virtual users:

```javascript
{
  // Existing fields...
  
  // Points System
  pointsWallet: {
    type: Number,
    default: 0
  },
  totalPointsEarned: {
    type: Number,
    default: 0
  },
  virtualReferralsCreated: {
    type: Number,
    default: 0
  },
  
  // Virtual User Fields
  role: {
    type: String,
    enum: ['user', 'admin', 'virtual'],
    default: 'user'
  },
  isVirtual: {
    type: Boolean,
    default: false
  },
  originalUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}
```

### 3. PointsTransaction Model

New model to track all points transactions:

```javascript
{
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['earned', 'redeemed'],
    required: true
  },
  points: {
    type: Number,
    required: true
  },
  
  // For earned points
  source: {
    type: String,
    enum: ['book_purchase', 'bundle_purchase']
  },
  sourceId: {
    type: mongoose.Schema.Types.ObjectId
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  
  // For redeemed points
  virtualUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  description: String,
  balanceAfter: {
    type: Number,
    required: true
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
}
```

### 4. API Endpoints

#### Points Management
- `GET /api/points/balance` - Get user's current points balance and stats
- `GET /api/points/history` - Get user's points transaction history
- `POST /api/points/redeem` - Manually redeem 100 points for virtual referral

#### Admin Endpoints
- `PUT /api/admin/books/:id/points` - Set reward points for a book
- `GET /api/admin/points/analytics` - Get points system analytics

#### Integration Endpoints (Internal)
- Points awarding is integrated into the order completion flow
- Virtual referral creation is triggered automatically when points reach 100

## Data Models

### Book Schema Extension

```javascript
const bookSchema = new mongoose.Schema({
  // ... existing fields ...
  
  // Points System
  rewardPoints: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
```

### User Schema Extension

```javascript
const userSchema = new mongoose.Schema({
  // ... existing fields ...
  
  // Points System
  pointsWallet: {
    type: Number,
    default: 0
  },
  totalPointsEarned: {
    type: Number,
    default: 0
  },
  virtualReferralsCreated: {
    type: Number,
    default: 0
  },
  
  // Virtual User Fields
  role: {
    type: String,
    enum: ['user', 'admin', 'virtual'],
    default: 'user'
  },
  isVirtual: {
    type: Boolean,
    default: false
  },
  originalUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });
```

### PointsTransaction Schema

```javascript
const pointsTransactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['earned', 'redeemed'],
    required: true
  },
  points: {
    type: Number,
    required: true
  },
  
  // For earned points
  source: {
    type: String,
    enum: ['book_purchase', 'bundle_purchase'],
    required: function() { return this.type === 'earned'; }
  },
  sourceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: function() { return this.type === 'earned'; }
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: function() { return this.type === 'earned'; }
  },
  
  // For redeemed points
  virtualUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() { return this.type === 'redeemed'; }
  },
  
  description: String,
  
  // Balance after this transaction
  balanceAfter: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
pointsTransactionSchema.index({ user: 1, createdAt: -1 });
pointsTransactionSchema.index({ type: 1, createdAt: -1 });
```

## Algorithms

### Points Award Algorithm

When an order is completed, points are calculated and awarded:

```javascript
async function awardPoints(userId, points, source, sourceId, orderId, session) {
  if (points <= 0) return null;
  
  const user = await User.findById(userId).session(session);
  if (!user) throw new Error('User not found');
  
  // Update user points
  user.pointsWallet += points;
  user.totalPointsEarned += points;
  await user.save({ session });
  
  // Create transaction record
  const transaction = new PointsTransaction({
    user: userId,
    type: 'earned',
    points,
    source,
    sourceId,
    orderId,
    description: `Earned ${points} points from ${source.replace('_', ' ')}`,
    balanceAfter: user.pointsWallet
  });
  await transaction.save({ session });
  
  // Check if user can create virtual referral
  await checkAndCreateVirtualReferral(userId, session);
  
  return transaction;
}
```

### Virtual Referral Creation Algorithm

When a user has 100+ points, a virtual referral is automatically created:

```javascript
async function createVirtualReferral(userId, session) {
  const user = await User.findById(userId).session(session);
  if (!user) throw new Error('User not found');
  if (user.pointsWallet < 100) {
    throw new Error('Insufficient points for virtual referral');
  }
  
  // Create virtual user
  const virtualUserCount = user.virtualReferralsCreated + 1;
  const virtualUser = new User({
    name: `${user.name}-Virtual-${virtualUserCount}`,
    email: `virtual-${user._id}-${virtualUserCount}@system.local`,
    password: 'virtual-user-no-login',
    referralCode: `VIR${user._id.toString().slice(-6)}${virtualUserCount}`,
    referredBy: user.referralCode,
    role: 'virtual',
    isVirtual: true,
    originalUser: userId
  });
  
  // Find tree placement for virtual user
  const placement = await findTreePlacement(userId);
  virtualUser.treeParent = placement.parentId;
  virtualUser.treeLevel = placement.level;
  virtualUser.treePosition = placement.position;
  await virtualUser.save({ session });
  
  // Update parent's children array
  const parent = await User.findById(placement.parentId).session(session);
  parent.treeChildren.push(virtualUser._id);
  await parent.save({ session });
  
  // Deduct points from user
  user.pointsWallet -= 100;
  user.virtualReferralsCreated += 1;
  await user.save({ session });
  
  // Create redemption transaction
  const transaction = new PointsTransaction({
    user: userId,
    type: 'redeemed',
    points: -100,
    virtualUserId: virtualUser._id,
    description: `Redeemed 100 points for virtual referral: ${virtualUser.name}`,
    balanceAfter: user.pointsWallet
  });
  await transaction.save({ session });
  
  return virtualUser;
}
```

### Points Calculation from Order

Calculate total points from books in an order:

```javascript
async function calculateOrderPoints(orderId) {
  const order = await Order.findById(orderId).populate('items.book');
  let totalPoints = 0;
  
  for (const item of order.items) {
    if (item.book && item.book.rewardPoints) {
      totalPoints += item.book.rewardPoints * item.quantity;
    }
  }
  
  return totalPoints;
}
```

