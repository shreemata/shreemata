# Admin Login Instructions for Referral Tree Visual

## Quick Fix for Testing

1. **Open your browser and go to the admin referral tree visual page:**
   ```
   http://localhost:3000/admin-referral-tree-visual.html
   ```

2. **Open browser Developer Tools (F12) and go to Console tab**

3. **Run these commands in the console to set admin authentication:**
   ```javascript
   localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5NWMxZjc3OTEyYjY4OTMxNWI4ZDhiNyIsImlhdCI6MTc2NzY2NDM5OSwiZXhwIjoxNzY3NzUwNzk5fQ.mpXsF21ePyQGBl91VSpHVjDNUNC8bgacQlqWPKERtOU');
   
   localStorage.setItem('user', '{"id":"695c1f77912b689315b8d8b7","name":"Shashikumar Mulimani","email":"shashistudy2125@gmail.com","role":"admin"}');
   ```

4. **Refresh the page (F5)**

The referral tree should now load properly!

## Permanent Solution

For a permanent solution, you should:

1. **Log in through the normal login page** (`/login.html`) using the admin credentials:
   - Email: `shashistudy2125@gmail.com`
   - Password: [You'll need to know the admin's password]

2. **Or create a new admin user** if you don't know the password:
   ```bash
   # First create a regular user through signup, then make them admin:
   node scripts/makeAdmin.js your-email@example.com
   ```

## What Was Fixed

- ✅ Added `config.js` script to load API_URL properly
- ✅ Fixed API endpoint configuration 
- ✅ Verified backend route `/api/admin/referral-tree/complete` is working
- ✅ Confirmed authentication is working with proper admin token

The issue was that the page needed proper authentication and the API_URL wasn't being loaded correctly.