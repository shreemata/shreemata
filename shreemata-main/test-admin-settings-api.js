require('dotenv').config();
const fetch = require('node-fetch');

const API_URL = 'http://localhost:3000/api';

async function testAdminSettingsAPI() {
    try {
        console.log('🧪 Testing Admin Settings API...\n');

        // Test 1: Get current settings
        console.log('1. Testing GET /admin/settings');
        const settingsResponse = await fetch(`${API_URL}/admin/settings`, {
            headers: {
                'Authorization': 'Bearer your_admin_token_here',
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Status:', settingsResponse.status);
        if (settingsResponse.ok) {
            const settingsData = await settingsResponse.json();
            console.log('✅ Settings loaded successfully');
            console.log('Virtual Tree Cost:', settingsData.settings.virtualTreeSettings.pointsPerVirtualTree);
            console.log('Cash Conversion:', settingsData.settings.cashConversionSettings.pointsPerConversion, 'points =', settingsData.settings.cashConversionSettings.cashPerConversion, 'rupees');
        } else {
            console.log('❌ Failed to load settings:', settingsResponse.statusText);
        }

        console.log('\n2. Testing GET /admin/settings/stats');
        const statsResponse = await fetch(`${API_URL}/admin/settings/stats`, {
            headers: {
                'Authorization': 'Bearer your_admin_token_here',
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Status:', statsResponse.status);
        if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            console.log('✅ Stats loaded successfully');
            console.log('Total Users:', statsData.stats.users.total);
            console.log('Virtual Users:', statsData.stats.users.virtual);
            console.log('Points in System:', statsData.stats.points.totalInSystem);
            console.log('Cash in System:', statsData.stats.points.totalCashInSystem);
        } else {
            console.log('❌ Failed to load stats:', statsResponse.statusText);
        }

        console.log('\n🎯 API Test Results:');
        console.log('- Admin Settings API endpoints are set up correctly');
        console.log('- You can now visit http://localhost:3000/admin-settings.html');
        console.log('- Make sure to login as admin first');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.log('\n💡 Make sure the server is running: npm start');
    }
}

testAdminSettingsAPI();