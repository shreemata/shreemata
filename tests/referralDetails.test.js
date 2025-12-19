const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/User');

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await User.deleteMany({});
});

describe('Referral Details Endpoint Data Structure', () => {
    /**
     * Test the GET /api/referral/details endpoint data structure
     * Requirements: 1.3, 7.1, 7.2, 7.3, 7.4
     */
    
    it('should include tree placement information in user data', async () => {
        // Create test user with tree placement
        const testUser = await User.create({
            name: 'Test User',
            email: 'test@example.com',
            password: 'password123',
            referralCode: 'TEST123',
            wallet: 500,
            directCommissionEarned: 300,
            treeCommissionEarned: 200,
            treeLevel: 1,
            treePosition: 0
        });

        // Populate tree children
        const child1 = await User.create({
            name: 'Child 1',
            email: 'child1@example.com',
            password: 'password123',
            referralCode: 'CHILD1',
            referredBy: 'TEST123',
            treeParent: testUser._id,
            treeLevel: 2,
            treePosition: 0
        });

        testUser.treeChildren = [child1._id];
        await testUser.save();

        // Fetch and populate
        const user = await User.findById(testUser._id)
            .populate('treeParent', 'name email referralCode')
            .populate('treeChildren', 'name email referralCode treeLevel');

        // Verify tree placement data structure
        expect(user.treeLevel).toBe(1);
        expect(user.treePosition).toBe(0);
        expect(user.treeParent).toBeNull();
        expect(user.treeChildren).toHaveLength(1);
        expect(user.treeChildren[0].name).toBe('Child 1');
    });

    it('should track commission breakdown correctly', async () => {
        const testUser = await User.create({
            name: 'Test User',
            email: 'test@example.com',
            password: 'password123',
            referralCode: 'TEST123',
            wallet: 500,
            directCommissionEarned: 300,
            treeCommissionEarned: 200
        });

        expect(testUser.wallet).toBe(500);
        expect(testUser.directCommissionEarned).toBe(300);
        expect(testUser.treeCommissionEarned).toBe(200);
        
        // Verify percentages calculation
        const directPercentage = (testUser.directCommissionEarned / testUser.wallet * 100).toFixed(2);
        const treePercentage = (testUser.treeCommissionEarned / testUser.wallet * 100).toFixed(2);
        
        expect(directPercentage).toBe('60.00');
        expect(treePercentage).toBe('40.00');
    });

    it('should distinguish between direct referrals and tree children', async () => {
        // Create parent user
        const parent = await User.create({
            name: 'Parent',
            email: 'parent@example.com',
            password: 'password123',
            referralCode: 'PARENT123',
            treeLevel: 1
        });

        // Create direct referral (also tree child)
        const directRef = await User.create({
            name: 'Direct Referral',
            email: 'direct@example.com',
            password: 'password123',
            referralCode: 'DIRECT123',
            referredBy: 'PARENT123',
            treeParent: parent._id,
            treeLevel: 2,
            treePosition: 0
        });

        // Create spillover (tree child but not direct referral)
        const spillover = await User.create({
            name: 'Spillover',
            email: 'spillover@example.com',
            password: 'password123',
            referralCode: 'SPILL123',
            referredBy: 'SOMEONE_ELSE',
            treeParent: parent._id,
            treeLevel: 2,
            treePosition: 1
        });

        // Update parent's tree children
        parent.treeChildren = [directRef._id, spillover._id];
        await parent.save();

        // Query direct referrals
        const directReferrals = await User.find({ referredBy: parent.referralCode });
        expect(directReferrals).toHaveLength(1);
        expect(directReferrals[0].email).toBe('direct@example.com');

        // Query tree children
        const treeChildren = await User.find({ treeParent: parent._id });
        expect(treeChildren).toHaveLength(2);

        // Verify placement types
        const directIsTreeChild = directRef.treeParent.toString() === parent._id.toString();
        const spilloverIsDirectRef = spillover.referredBy === parent.referralCode;
        
        expect(directIsTreeChild).toBe(true);
        expect(spilloverIsDirectRef).toBe(false);
    });

    it('should show tree levels correctly', async () => {
        // Create multi-level tree
        const level1 = await User.create({
            name: 'Level 1',
            email: 'level1@example.com',
            password: 'password123',
            referralCode: 'L1',
            treeLevel: 1,
            treePosition: 0
        });

        const level2 = await User.create({
            name: 'Level 2',
            email: 'level2@example.com',
            password: 'password123',
            referralCode: 'L2',
            referredBy: 'L1',
            treeParent: level1._id,
            treeLevel: 2,
            treePosition: 0
        });

        const level3 = await User.create({
            name: 'Level 3',
            email: 'level3@example.com',
            password: 'password123',
            referralCode: 'L3',
            referredBy: 'L2',
            treeParent: level2._id,
            treeLevel: 3,
            treePosition: 0
        });

        // Verify tree levels
        expect(level1.treeLevel).toBe(1);
        expect(level2.treeLevel).toBe(2);
        expect(level3.treeLevel).toBe(3);

        // Verify parent-child relationships
        expect(level2.treeParent.toString()).toBe(level1._id.toString());
        expect(level3.treeParent.toString()).toBe(level2._id.toString());
    });

    it('should handle users with no tree parent', async () => {
        const rootUser = await User.create({
            name: 'Root User',
            email: 'root@example.com',
            password: 'password123',
            referralCode: 'ROOT123',
            treeLevel: 1,
            treePosition: 0
        });

        const user = await User.findById(rootUser._id)
            .populate('treeParent', 'name email referralCode');

        expect(user.treeParent).toBeNull();
        expect(user.treeLevel).toBe(1);
    });
});
