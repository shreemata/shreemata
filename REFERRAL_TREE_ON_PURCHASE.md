# Referral Tree Creation ONLY on Purchase

## Overview
The referral tree is now created **ONLY when a user makes their first book purchase**. Users who haven't purchased anything **do not appear in the tree at all**. However, **commissions still flow through the referral chain** even if referrers haven't purchased yet.

## How It Works

### During Signup
- Users can sign up with referral codes
- The `referredBy` field is stored but **NO tree node is created**
- Tree-related fields remain at default values:
  - `treeLevel: 0` (indicates not yet placed in tree - **NO CARD VISIBLE**)
  - `treeParent: null`
  - `treePosition: 0`
  - `treeChildren: []`

### During First Purchase
- When payment is verified for a user's first purchase
- **Only the purchaser gets a tree card/node**
- Tree placement logic:
  - **If referrer has purchased**: Place under referrer in tree
  - **If referrer hasn't purchased**: Place as root user
- Tree fields are updated for purchaser only:
  - `treeLevel`: Set to appropriate level (1 for root, 2+ for children)
  - `treeParent`: Set to the parent user ID (if referrer has purchased)
  - `treePosition`: Set to position under parent

### Commission Flow (Key Feature!)
- **Commissions flow based on referral relationships (`referredBy`), NOT tree structure**
- **Direct Commission**: Goes to immediate referrer (even if they haven't purchased)
- **Tree Commissions**: Flow up the referral chain (even if referrers haven't purchased)
- **Example**:
  - User A refers User B (A hasn't purchased)
  - User B refers User C (B hasn't purchased) 
  - User C purchases → C gets tree card, A & B get commissions but no tree cards

### Admin Tree View
- **Only shows users with `treeLevel >= 1`** (users who made purchases)
- Users with `treeLevel: 0` are **completely invisible** in the tree
- Clean tree view with only paying customers

## Key Benefits

1. **Clean tree visualization**: Only paying customers appear as cards/nodes
2. **No empty nodes**: Non-purchasing users don't create visual clutter
3. **Commissions still work**: Referrers get paid even without tree cards
4. **Referral codes work**: Users can still sign up with referral codes
5. **Automatic tree creation**: Tree cards appear when users purchase
6. **Fair commission system**: Everyone in referral chain gets paid

## Technical Implementation

### Commission Flow Logic
- **Direct Commission**: Based on `purchaser.referredBy` → immediate referrer
- **Tree Commissions**: Follow referral chain (`referredBy` → `referredBy` → ...)
- **Tree Structure**: Only for visualization of purchasing users

### Files Modified
- `routes/auth.js`: Removed tree placement from signup
- `services/treePlacement.js`: Only creates placement for purchaser
- `services/commissionDistribution.js`: Commission flows via referral chain
- `routes/adminReferralTree.js`: Only shows purchasing users
- `public/js/admin-referral-tree.js`: Updated statistics

## User States & Tree Visibility

1. **Signed up, no purchase**: `treeLevel: 0` → **NO TREE CARD** (but can receive commissions)
2. **Made first purchase**: `treeLevel: 1+` → **TREE CARD APPEARS**
3. **Existing users**: Already have tree placement → **TREE CARD VISIBLE**

## Example Scenario

```
User A (signed up, no purchase) - treeLevel: 0 - NO CARD
  ↓ refers
User B (signed up, no purchase) - treeLevel: 0 - NO CARD  
  ↓ refers
User C (purchases book) - treeLevel: 1 - GETS TREE CARD

Commission Flow when C purchases:
- C gets tree card (placed as root since A & B haven't purchased)
- B gets direct commission (3%)
- A gets tree commission (1.5%)
- Both A & B remain invisible in tree until they purchase
```

## Testing
1. Create User A with referral code
2. User B signs up with A's referral code
3. User C signs up with B's referral code
4. Verify: No tree cards for A, B, or C
5. User C makes purchase
6. Verify: Only C gets tree card, A & B get commissions but no cards
7. User B makes purchase
8. Verify: B gets tree card, placed appropriately in tree

## Migration
Existing users with tree placement are unaffected. New users follow the new "card only on purchase" behavior.