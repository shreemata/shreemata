# Tree Placement Examples for New Users

## Current Tree Structure:
```
Level 1: Shashikumar (1/1) - FULL
├── Level 2: shashi1 (1/5) - has 1 child, can take 4 more
├── Level 2: shashi13 (0/5) - can take 5 children
├── Level 2: shashi2 (0/5) - can take 5 children  
├── Level 2: shashi4 (0/5) - can take 5 children
├── Level 2: shashi5 (0/5) - can take 5 children
└── Level 3: shashi6 (under shashi1)
```

## Tree Placement Algorithm (Breadth-First, Left-to-Right):

### Next 4 Users will be placed under shashi1:
```javascript
// User 7
{
  treeLevel: 3,
  treePosition: 2,
  treeParent: "shashi1_id", // 695c16cd269f05c4fe48107c
}

// User 8  
{
  treeLevel: 3,
  treePosition: 3,
  treeParent: "shashi1_id",
}

// User 9
{
  treeLevel: 3, 
  treePosition: 4,
  treeParent: "shashi1_id",
}

// User 10
{
  treeLevel: 3,
  treePosition: 5,
  treeParent: "shashi1_id", // shashi1 now FULL (5/5)
}
```

### Next 5 Users will be placed under shashi13:
```javascript
// User 11
{
  treeLevel: 3,
  treePosition: 1,
  treeParent: "shashi13_id", // 695c6b6a269f05c4fe481189
}

// User 12-15 continue under shashi13 (positions 2-5)
```

### Next 5 Users will be placed under shashi2:
```javascript
// User 16
{
  treeLevel: 3,
  treePosition: 1,
  treeParent: "shashi2_id", // 695c6e21269f05c4fe48118d
}
// And so on...
```

## When Level 2 is Full (25 users total):

### Level 3 Users Start Taking Children (Level 4):
```javascript
// User 26 (first Level 4 user)
{
  treeLevel: 4,
  treePosition: 1,
  treeParent: "shashi6_id", // First available Level 3 user
}
```

## Database Fields for New Users:

### Required Fields:
```javascript
{
  _id: ObjectId("..."),
  name: "New User Name",
  email: "user@example.com",
  
  // Tree Placement Fields
  treeLevel: 3,                    // Level in tree (1=root, 2=first level, etc.)
  treePosition: 2,                 // Position among siblings (1-5)
  treeParent: ObjectId("..."),     // Parent user's ID
  treeChildren: [],                // Array of child user IDs (auto-populated)
  
  // Referral Fields  
  referredBy: ObjectId("..."),     // Who referred this user (usually same as treeParent)
  referralCode: "REF123456",       // Unique code for this user
  
  // Purchase Status
  firstPurchaseDone: true,         // Must be true to be placed in tree
  
  // Commission Tracking
  directCommissionEarned: 0,
  treeCommissionEarned: 0,
  wallet: 0,
  
  // Timestamps
  createdAt: Date,
  updatedAt: Date
}
```

## Tree Placement Rules:

1. **5-Person Limit**: Each user can have maximum 5 direct children
2. **Breadth-First**: Fill current level before moving to next level  
3. **Left-to-Right**: Fill positions 1, 2, 3, 4, 5 in order
4. **Purchase Required**: Only users who made purchases get tree placement
5. **Auto-Assignment**: Tree placement is automatic, not based on who referred whom

## Visual Tree After 10 More Users:

```
Level 1: Shashikumar (5/5 children)
├── Level 2: shashi1 (5/5 children) - FULL
│   ├── shashi6, newUser7, newUser8, newUser9, newUser10
├── Level 2: shashi13 (5/5 children) - FULL  
│   ├── newUser11, newUser12, newUser13, newUser14, newUser15
├── Level 2: shashi2 (0/5 children)
├── Level 2: shashi4 (0/5 children)  
└── Level 2: shashi5 (0/5 children)
```

This ensures balanced tree growth and fair commission distribution!