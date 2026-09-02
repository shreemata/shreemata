# Points System Implementation Guide

## Overview
The Points System allows users to earn points on purchases and redeem them for virtual referrals in their tree structure.

## Features Implemented

### 1. Database Models

#### User Model Updates
- `pointsWallet`: Current available points balance
- `totalPointsEarned`: Lifetime points earned
- `virtualReferralsCreated`: Count of virtual referrals created
- `isVirtual`: Flag for virtual users
- `originalUser`: Reference to the user who created this virtual user
- `role`: Extended to include 'virtual' role

#### Book Model Updates
- `rewardPoints`: Points awarded when this book is purchased

#### Bundle Model Updates
- `rewardPoints`: Points awarded when this bundle is purchased

#### New PointsTransaction Model
Tracks all points transactions with:
- `user`: User who earned/redeemed points
- `type`: 'earned' or 'redeemed'
- `points`: Amount of points
- `source`: 'book_purchase' or 'bundle_purchase'
- `sourceId`: Reference to the book/bundle
- `orderId`: Reference to the order
- `virtualUserId`: Reference to created virtual user (for redemptions)
- `balanceAfter`: Points balance after transaction

### 2. Backend Services

#### Points Service (`services/pointsService.js`)
- `awardPoints()`: Award points to user for purchases
- `checkAndCreateVirtualReferral()`: Auto-create virtual referral when 100+ points
- `createVirtualReferral()`: Create virtual user and place in tree
- `getPointsHistory()`: Get user's points transaction history

### 3. API Routes (`routes/points.js`)

- `GET /api/points/balance`: Get user's points balance
- `GET /api/points/history`: Get points transaction history (paginated)
- `POST /api/points/redeem-virtual`: Redeem 100 points for virtual referral

### 4. Integration Points

#### Payment Verification (`routes/payments.js`)
After successful payment and commission distribution:
1. Loops through order items
2. Checks if book/bundle has reward points
3. Awards points using `awardPoints()` service
4. Automatically creates virtual referral if user reaches 100 points

#### Admin Book Management
- Admin can set reward points when creating/editing books
- Points field added to book creation and update forms

#### Admin Bundle Management
- Admin can set reward points when creating/editing bundles
- Points field added to bundle creation forms

### 5. Frontend UI

#### User Account Page (`public/account.html`)
New "Points & Rewards" section showing:
- Available Points (current balance)
- Total Points Earned (lifetime)
- Virtual Referrals Created (count)
- Redeem button (enabled when 100+ points)
- Points transaction history

#### Admin Pages
- Book form includes "Reward Points" field
- Bundle form includes "Reward Points" field

## How It Works

### Earning Points
1. Admin sets reward points for books/bundles
2. User purchases a book/bundle
3. After payment verification, points are awarded
4. Points transaction is recorded
5. User's `pointsWallet` and `totalPointsEarned` are updated

### Redeeming Points
1. User accumulates 100+ points
2. User clicks "Redeem 100 Points for Virtual Referral"
3. System creates a virtual user with:
   - Name: `{UserName}-Virtual-{Count}`
   - Email: `virtual-{userId}-{count}@system.local`
   - Referral code: `VIR{userId}{count}`
   - Role: 'virtual'
4. Virtual user is placed in the tree under the user
5. 100 points are deducted from user's wallet
6. Redemption transaction is recorded

### Virtual Referrals
- Virtual users are placed in the tree structure
- They can earn commissions for the original user
- They cannot login or make purchases
- They help users build their referral tree

## Testing

### Test Points Awarding
1. Login as admin
2. Create/edit a book and set reward points (e.g., 10 points)
3. Login as a regular user
4. Purchase the book
5. Check account page → Points & Rewards section
6. Verify points were awarded

### Test Virtual Referral Creation
1. Award yourself 100+ points (purchase multiple books)
2. Go to account page → Points & Rewards
3. Click "Redeem 100 Points for Virtual Referral"
4. Check referral tree to see the virtual user
5. Verify points were deducted

## Database Queries

### Get user's points balance
```javascript
const user = await User.findById(userId).select('pointsWallet totalPointsEarned virtualReferralsCreated');
```

### Get points history
```javascript
const transactions = await PointsTransaction.find({ user: userId })
  .populate('sourceId')
  .populate('virtualUserId', 'name')
  .sort({ createdAt: -1 });
```

### Find virtual users created by a user
```javascript
const virtualUsers = await User.find({ 
  originalUser: userId,
  isVirtual: true 
});
```

## Future Enhancements

1. **Points Expiry**: Add expiration dates for points
2. **Points Tiers**: Different redemption options at different point levels
3. **Bonus Points**: Special promotions or bonus point events
4. **Points Transfer**: Allow users to gift points to others
5. **Leaderboard**: Show top point earners
6. **Multiple Redemption Options**: Redeem for discounts, products, etc.

## Notes

- Points are awarded AFTER payment verification
- Virtual referrals are created automatically when user reaches 100 points
- Virtual users cannot login or make purchases
- Points transactions are immutable (cannot be edited/deleted)
- All points operations are logged for audit trail
