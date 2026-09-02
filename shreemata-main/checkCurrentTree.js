require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function checkCurrentTree() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Get current tree structure
    const users = await User.find({ firstPurchaseDone: true })
      .select('name treeLevel treePosition treeParent')
      .populate('treeParent', 'name')
      .sort({ treeLevel: 1, treePosition: 1 });

    console.log('🌳 Current Tree Structure:');
    let currentLevel = 0;
    users.forEach(user => {
      if (user.treeLevel !== currentLevel) {
        currentLevel = user.treeLevel;
        console.log(`\n--- Level ${currentLevel} ---`);
      }
      const parentName = user.treeParent ? user.treeParent.name : 'ROOT';
      console.log(`  ${user.name} (Position ${user.treePosition}) - Parent: ${parentName}`);
    });

    // Check specific connections that should exist
    console.log('\n🔗 Expected Connections:');
    console.log('shashi1 → shashi6, shashi7, shashi8');
    console.log('shashi13 → shashi9');
    
    // Verify these connections exist in DB
    const shashi1Children = await User.find({ 
      treeParent: await User.findOne({name: 'shashi1'}).select('_id') 
    }).select('name');
    
    const shashi13Children = await User.find({ 
      treeParent: await User.findOne({name: 'shashi13'}).select('_id') 
    }).select('name');

    console.log(`\n✅ shashi1's children: ${shashi1Children.map(c => c.name).join(', ')}`);
    console.log(`✅ shashi13's children: ${shashi13Children.map(c => c.name).join(', ')}`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkCurrentTree();