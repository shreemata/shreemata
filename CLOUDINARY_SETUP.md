# Cloudinary Setup - Back to Original

## ✅ Restored to Cloudinary

Everything is back to using Cloudinary for image uploads.

## Current Configuration

Your `.env` file has:
```env
CLOUDINARY_CLOUD_NAME=degwjha60
CLOUDINARY_API_KEY=158898756826826
CLOUDINARY_API_SECRET=3Q75Y9FKFxVVzav11vpCJXT1aGw
CLOUDINARY_UPLOAD_PRESET=bookstore_preset
```

## Important: Configure Upload Preset

You need to create an **unsigned upload preset** in Cloudinary:

### Steps:

1. Login to Cloudinary dashboard: https://cloudinary.com/console
2. Go to **Settings** → **Upload**
3. Scroll to **Upload presets**
4. Click **Add upload preset**
5. Set:
   - **Preset name:** `bookstore_preset`
   - **Signing Mode:** **Unsigned** (important!)
   - **Folder:** `bookstore` (optional)
   - **Allowed formats:** jpg, jpeg, png, webp
6. Click **Save**

## How It Works

**Direct Upload (Current):**
```
Browser → Cloudinary → Returns URL → Save to MongoDB
```

This is faster because images don't go through your server.

## Testing

1. Start server: `npm start`
2. Login as admin
3. Add a book with images
4. Images should upload directly to Cloudinary

## If Upload Fails

If you see "Cloudinary upload failed", it means the upload preset isn't configured:

1. Check the preset name is exactly `bookstore_preset`
2. Make sure it's set to **Unsigned**
3. Restart your server after creating the preset

## Deployment to Render

Make sure these environment variables are set in Render:
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_UPLOAD_PRESET`

## Image URLs

Images will have URLs like:
```
https://res.cloudinary.com/degwjha60/image/upload/v1234567890/bookstore/image.jpg
```

---

Everything is back to normal! Just make sure the upload preset is configured in Cloudinary dashboard.
