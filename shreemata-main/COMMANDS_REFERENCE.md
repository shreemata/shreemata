# 📝 Commands Reference - Online Reading POC

## 🚀 Quick Commands

### Install Dependencies
```bash
npm install googleapis pdf-lib multer
```

### Test Google Drive Upload
```bash
node test-google-drive-upload.js
```

### Check Environment Variables
```bash
node -e "require('dotenv').config(); console.log('✅ Project ID:', process.env.GOOGLE_PROJECT_ID || '❌ Not set')"
```

### Restart Server
```bash
pm2 restart shreemata
```

### View Server Logs
```bash
pm2 logs shreemata
```

---

## 🔍 Verification Commands

### Check if googleapis is installed
```bash
npm list googleapis
```

### Check i