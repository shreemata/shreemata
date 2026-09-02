# Correct Database Structure for Referral Tree

## Current Problem
All users have `treeParent: null` which means no parent-child relationships exist in the database.

## How It Should Look

### Example Tree Structure:
```
Level 1: Shashikumar Mulimani (ROOT)
Level 2: shashi1, shashi13, shashi2, shashi4 (under Shashikumar)
Level 3: shashi5, shashi6 (under shashi1)
```

### Database Records Should Be:

#### Level 1 (Root User):
```javascript
{
  _id: "695c1f77912b689315b8d8b7",
  name: "Shashikumar Mulimani",
  email: "shashistudy2125@gmail.com",
  treeLevel: 1,
  treePosition: 1,
  treeParent: null,           // Root has no parent
  referredBy: null,           // Root was not referred
  referralCode: "REF145019"
}
```

#### Level 2 (Children of Root):
```javascript
{
  _id: "695c16cd269f05c4fe48107c",
  name: "shashi1",
  email: "shree.mata.hbl2@gmail.com",
  treeLevel: 2,
  treePosition: 1,            // First child under root
  treeParent: "695c1f77912b689315b8d8b7",  // Points to Shashikumar
  referredBy: "695c1f77912b689315b8d8b7",  // Referred by Shashikumar
  referralCode: "REF470868"
}

{
  name: "shashi13",
  treeLevel: 2,
  treePosition: 2,            // Second child under root
  treeParent: "695c1f77912b689315b8d8b7",  // Points to Shashikumar
  referredBy: "695c1f77912b689315b8d8b7",
  // ... etc
}

{
  name: "shashi2",
  treeLevel: 2,
  treePosition: 3,            // Third child under root
  treeParent: "695c1f77912b689315b8d8b7",
  // ... etc
}

{
  name: "shashi4",
  treeLevel: 2,
  treePosition: 4,            // Fourth child under root
  treeParent: "695c1f77912b689315b8d8b7",
  // ... etc
}
```

#### Level 3 (Children of Level 2):
```javascript
{
  name: "shashi5",
  treeLevel: 3,
  treePosition: 1,            // First child under shashi1
  treeParent: "695c16cd269f05c4fe48107c",  // Points to shashi1
  referredBy: "695c16cd269f05c4fe48107c",  // Referred by shashi1
  // ... etc
}

{
  name: "shashi6",
  treeLevel: 3,
  treePosition: 2,            // Second child under shashi1
  treeParent: "695c16cd269f05c4fe48107c",  // Points to shashi1
  referredBy: "695c16cd269f05c4fe48107c",  // Referred by shashi1
  // ... etc
}
```

## Key Fields Explanation:

- **treeParent**: ObjectId of the parent user in the tree structure
- **treeLevel**: Level in the tree (1 = root, 2 = first level children, etc.)
- **treePosition**: Position among siblings at the same level under same parent
- **referredBy**: Who referred this user (usually same as treeParent)
- **referralCode**: Unique code for this user to refer others

## 5-Person Horizontal Tree Rules:

- Each user can have maximum 5 direct children (treePosition 1-5)
- When a user's 5 positions are filled, new referrals go to the next available position in the tree
- Tree placement follows breadth-first, left-to-right filling

## Current Fix Needed:

1. Update existing users to have proper treeParent relationships
2. Ensure treePosition reflects actual position under parent
3. Set referredBy to match the referral chain
4. Update tree placement logic to maintain these relationships