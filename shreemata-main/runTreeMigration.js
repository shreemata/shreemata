/**
 * Quick script to run the tree migration
 * This will reset tree placement for users who haven't made purchases
 */

require('dotenv').config();
const { resetTreeForNonPurchasers } = require('./migrations/resetTreeForNonPurchasers');

console.log('🚀 Running tree migration...');
console.log('📋 This will reset tree placement for users who haven\'t made purchases');

resetTreeForNonPurchasers()
  .then(() => {
    console.log('✅ Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });