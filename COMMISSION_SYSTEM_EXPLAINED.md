# Commission System - Tree Placement Based

## Overview
Your multi-level referral system distributes **10% of every order** among different stakeholders using a **dual-system approach**:

1. **Direct Commission**: Based on referral relationships (who referred whom)
2. **Tree Commission**: Based on tree placement (who is under whom in the tree)

## Commission Breakdown (10% Total)

### 1. Direct Commission (3%)
- **Who gets it**: The person who directly referred the buyer
- **Based on**: `referredBy` field (referral code used during signup)
- **If no referrer**: Goes to Trust Fund
- **Example**: If John buys ₹1000 using Sarah's referral code, Sarah gets ₹30

### 2. Tree Commission Pool (3%)
- **Who gets it**: Users in the tree placement chain (tree parents)
- **Based on**: Tree structure (`treeParent` relationships)
- **Distribution**: Halving pattern starting from Level 1
  - Level 1: 1.5% (₹15 on ₹1000 order) - Direct tree parent
  - Level 2: 0.75% (₹7.50 on ₹1000 order) - Tree grandparent
  - Level 3: 0.375% (₹3.75 on ₹1000 order) - Tree great-grandparent
  - Level 4: 0.1875% (₹1.88 on ₹1000 order)
  - Level 5: 0.09375% (₹0.94 on ₹1000 order)
- **Virtual Card Support**: Virtual cards redirect commissions to original user
- **Remainder**: Any unused amount goes to Development Trust Fund

### 3. Trust Fund (3%)
- **Purpose**: General company fund for operations
- **Gets**: 3% of every order + direct commissions when no referrer + commissions from suspended users

### 4. Development Trust Fund (1%)
- **Purpose**: Development and growth fund
- **Gets**: 1% of every order + any remainder from tree commission pool

## Dual-System Benefits

### Example: teju (placed under ravi) was referred by natu, buys ₹1000

**Commission Distribution:**
1. **Direct Commission (₹30)**: natu gets ₹30 (who referred teju)
2. **Tree Commissions**:
   - Level 1 (₹15): ravi gets ₹15 (teju's tree parent)
   - Level 2 (₹7.50): Admin gets ₹7.50 (ravi's tree parent)
   - Remaining ₹7.50: Goes to Development Trust Fund
3. **Trust Fund**: ₹30
4. **Development Fund**: ₹10 + ₹7.50 = ₹17.50

**Result**: Both natu (referrer) and ravi (tree parent) benefit from teju's purchase!

## Virtual Card System

### How Virtual Cards Work:
- User earns 100 points → Virtual card added to tree
- Virtual card appears as separate tree node
- Virtual card can receive tree commissions
- **All virtual card earnings redirect to original user**

### Example with Virtual Cards:
```
Tree Structure:
Level 1: Admin
├── Level 2: ravi (original user)
│   ├── Level 3: ravi-virtual-1 (virtual card)
│   │   └── Level 4: teju (real user)
```

**When teju buys ₹1000:**
- Level 1: `ravi-virtual-1` gets ₹15 → **redirected to ravi**
- Level 2: `ravi` gets ₹7.50 directly
- **Total for ravi**: ₹22.50 from single purchase!

### Virtual Card Benefits:
✅ **Multiplied Earnings**: Original user earns from multiple tree levels
✅ **Reward Active Users**: More points = more virtual cards = more earnings
✅ **Tree Expansion**: Virtual cards create more placement opportunities
✅ **Automatic Redirection**: Virtual cards never keep money, always redirect

## Key Features

### 1. Tree Placement-Based Tree Commissions
- Tree commissions follow tree structure (`treeParent` relationships)
- Every user in tree generates full commission distribution
- More predictable and fair earnings for tree parents

### 2. Referral-Based Direct Commissions
- Direct commissions still follow referral relationships
- Rewards users for bringing new customers
- Maintains referral incentive system

### 3. Full 10% Utilization
- System always uses complete 10% commission pool
- No wasted commissions due to missing referrers
- Better earning opportunities for all users

### 4. Automatic Handling
- **No Referrer**: Direct commission goes to Trust Fund, tree commissions flow normally
- **Suspended Users**: Their commissions go to Trust Fund
- **Virtual Users**: Commissions redirect to original user
- **Missing Tree Parents**: Remaining pool goes to Development Fund

## Commission Flow Examples

### Case 1: User with Referrer
- **Direct**: Referrer gets 3%
- **Tree**: Tree parents get up to 3% (halving pattern)
- **Funds**: Trust Fund 3% + Development Fund 1% + remainder

### Case 2: User without Referrer
- **Direct**: Trust Fund gets 3%
- **Tree**: Tree parents get up to 3% (halving pattern)
- **Funds**: Trust Fund 6% + Development Fund 1% + remainder

### Case 3: User with Virtual Card Parents
- **Direct**: Referrer gets 3% (if exists)
- **Tree**: Virtual cards redirect to original users
- **Result**: Original users can earn from multiple levels

This system maximizes earning opportunities while ensuring fair distribution and platform sustainability!