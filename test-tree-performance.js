/**
 * Performance Test Script for Referral Tree Optimization
 * Tests the optimized referral tree with various user counts
 */

const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/shreemata', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

/**
 * Create test users for performance testing
 */
async function createTestUsers(count = 1000) {
    console.log(`🔧 Creating ${count} test users for performance testing...`);
    
    const users = [];
    const batchSize = 100;
    
    for (let i = 0; i < count; i++) {
        const level = Math.floor(i / Math.pow(5, Math.floor(Math.log(i + 1) / Math.log(5)))) + 1;
        const parentIndex = Math.floor((i - 1) / 5);
        
        users.push({
            name: `Test User ${i + 1}`,
            email: `testuser${i + 1}@example.com`,
            referralCode: `TEST${String(i + 1).padStart(4, '0')}`,
            wallet: Math.random() * 1000,
            treeLevel: Math.min(level, 10), // Cap at level 10
            treePosition: i + 1,
            treeParent: parentIndex >= 0 ? null : null, // Will be set after creation
            firstPurchaseDone: true,
            directCommissionEarned: Math.random() * 100,
            treeCommissionEarned: Math.random() * 50,
            createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000), // Random date within last year
            isVirtual: Math.random() < 0.1 // 10% virtual users
        });
        
        // Insert in batches for better performance
        if (users.length >= batchSize || i === count - 1) {
            try {
                await User.insertMany(users, { ordered: false });
                console.log(`   ✅ Inserted batch of ${users.length} users (${i + 1}/${count})`);
                users.length = 0; // Clear array
            } catch (error) {
                console.log(`   ⚠️ Batch insert warning (likely duplicates): ${error.message}`);
                users.length = 0; // Clear array and continue
            }
        }
    }
    
    console.log(`✅ Test user creation completed`);
}

/**
 * Test the optimized tree query performance
 */
async function testTreePerformance() {
    console.log('\n🚀 Testing Referral Tree Performance...\n');
    
    const testCases = [
        { limit: 50, name: 'Small Page (50 users)' },
        { limit: 100, name: 'Medium Page (100 users)' },
        { limit: 200, name: 'Large Page (200 users)' },
        { limit: 500, name: 'Extra Large Page (500 users)' }
    ];
    
    for (const testCase of testCases) {
        console.log(`📊 Testing: ${testCase.name}`);
        
        const startTime = performance.now();
        
        // Test the optimized query
        const users = await User.find({
            firstPurchaseDone: true,
            treeLevel: { $gte: 1 }
        })
        .select("name email referralCode wallet treeLevel treePosition treeParent referredBy createdAt directCommissionEarned treeCommissionEarned isVirtual")
        .sort({ treeLevel: 1, treePosition: 1 })
        .limit(testCase.limit)
        .lean();
        
        const queryTime = performance.now() - startTime;
        
        // Group by levels (simulating frontend processing)
        const processingStart = performance.now();
        const levels = {};
        
        users.forEach(user => {
            if (!levels[user.treeLevel]) {
                levels[user.treeLevel] = [];
            }
            levels[user.treeLevel].push({
                id: user._id,
                name: user.name,
                wallet: user.wallet || 0,
                treeLevel: user.treeLevel,
                isVirtual: user.isVirtual || false
            });
        });
        
        const processingTime = performance.now() - processingStart;
        const totalTime = performance.now() - startTime;
        
        console.log(`   📈 Results:`);
        console.log(`      - Users fetched: ${users.length}`);
        console.log(`      - Levels created: ${Object.keys(levels).length}`);
        console.log(`      - Query time: ${queryTime.toFixed(2)}ms`);
        console.log(`      - Processing time: ${processingTime.toFixed(2)}ms`);
        console.log(`      - Total time: ${totalTime.toFixed(2)}ms`);
        console.log(`      - Performance: ${totalTime < 100 ? '✅ Excellent' : totalTime < 500 ? '⚠️ Good' : '🔥 Needs optimization'}`);
        console.log('');
    }
}

/**
 * Test level filtering performance
 */
async function testLevelFiltering() {
    console.log('🎯 Testing Level Filtering Performance...\n');
    
    const levels = [1, 2, 3, 4, 5];
    
    for (const level of levels) {
        console.log(`📊 Testing Level ${level} Filter:`);
        
        const startTime = performance.now();
        
        const users = await User.find({
            firstPurchaseDone: true,
            treeLevel: level
        })
        .select("name treeLevel")
        .limit(100)
        .lean();
        
        const queryTime = performance.now() - startTime;
        
        console.log(`   - Users at level ${level}: ${users.length}`);
        console.log(`   - Query time: ${queryTime.toFixed(2)}ms`);
        console.log(`   - Performance: ${queryTime < 50 ? '✅ Excellent' : queryTime < 200 ? '⚠️ Good' : '🔥 Slow'}`);
        console.log('');
    }
}

/**
 * Test search performance
 */
async function testSearchPerformance() {
    console.log('🔍 Testing Search Performance...\n');
    
    const searchTerms = ['Test User 1', 'TEST0001', 'testuser1@example.com'];
    
    for (const term of searchTerms) {
        console.log(`📊 Searching for: "${term}"`);
        
        const startTime = performance.now();
        
        const users = await User.find({
            $or: [
                { name: { $regex: term, $options: 'i' } },
                { referralCode: { $regex: term, $options: 'i' } },
                { email: { $regex: term, $options: 'i' } }
            ],
            firstPurchaseDone: true
        })
        .select("name email referralCode")
        .limit(10)
        .lean();
        
        const searchTime = performance.now() - startTime;
        
        console.log(`   - Results found: ${users.length}`);
        console.log(`   - Search time: ${searchTime.toFixed(2)}ms`);
        console.log(`   - Performance: ${searchTime < 100 ? '✅ Fast' : searchTime < 500 ? '⚠️ Moderate' : '🔥 Slow'}`);
        console.log('');
    }
}

/**
 * Generate performance report
 */
async function generatePerformanceReport() {
    console.log('📋 Generating Performance Report...\n');
    
    // Get database statistics
    const totalUsers = await User.countDocuments();
    const usersInTree = await User.countDocuments({ firstPurchaseDone: true, treeLevel: { $gte: 1 } });
    const virtualUsers = await User.countDocuments({ isVirtual: true });
    
    // Get level distribution
    const levelStats = await User.aggregate([
        { $match: { firstPurchaseDone: true, treeLevel: { $gte: 1 } } },
        { $group: { _id: '$treeLevel', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
    ]);
    
    console.log('📊 Database Statistics:');
    console.log(`   - Total users: ${totalUsers}`);
    console.log(`   - Users in tree: ${usersInTree}`);
    console.log(`   - Virtual users: ${virtualUsers}`);
    console.log(`   - Tree levels: ${levelStats.length}`);
    console.log('');
    
    console.log('📈 Level Distribution:');
    levelStats.forEach(stat => {
        console.log(`   - Level ${stat._id}: ${stat.count} users`);
    });
    console.log('');
    
    // Performance recommendations
    console.log('💡 Performance Recommendations:');
    if (usersInTree > 2000) {
        console.log('   ✅ Virtualization is ESSENTIAL for this dataset size');
        console.log('   ✅ Use page sizes of 50-100 for optimal performance');
        console.log('   ✅ Enable level filtering for focused navigation');
    } else if (usersInTree > 500) {
        console.log('   ⚠️ Virtualization is RECOMMENDED for better performance');
        console.log('   ⚠️ Consider page sizes of 100-200');
    } else {
        console.log('   ✅ Current dataset size is manageable without virtualization');
        console.log('   ✅ Full tree rendering should work well');
    }
    console.log('');
}

/**
 * Main test function
 */
async function runPerformanceTests() {
    try {
        console.log('🚀 Referral Tree Performance Test Suite\n');
        console.log('=' .repeat(50));
        
        // Check if we need to create test data
        const existingUsers = await User.countDocuments({ email: /testuser.*@example\.com/ });
        
        if (existingUsers < 100) {
            console.log('📝 Creating test data...');
            await createTestUsers(1000);
        } else {
            console.log(`📊 Using existing test data (${existingUsers} test users found)`);
        }
        
        console.log('\n' + '=' .repeat(50));
        
        // Run performance tests
        await testTreePerformance();
        await testLevelFiltering();
        await testSearchPerformance();
        await generatePerformanceReport();
        
        console.log('✅ Performance testing completed successfully!');
        console.log('\n💡 Next steps:');
        console.log('   1. Open the admin referral tree visual page');
        console.log('   2. Test with different page sizes and virtualization settings');
        console.log('   3. Monitor the performance indicator in the top-right corner');
        console.log('   4. Use level filtering to test focused navigation');
        
    } catch (error) {
        console.error('❌ Performance test failed:', error);
    } finally {
        mongoose.connection.close();
    }
}

// Run the tests
if (require.main === module) {
    runPerformanceTests();
}

module.exports = {
    createTestUsers,
    testTreePerformance,
    testLevelFiltering,
    testSearchPerformance,
    generatePerformanceReport
};