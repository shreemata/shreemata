/**
 * Direct Cloudinary Upload (Bypasses Server)
 * This uploads images directly from browser to Cloudinary
 */

// Get Cloudinary config from server
let cloudinaryConfig = null;

async function getCloudinaryConfig() {
    if (cloudinaryConfig) return cloudinaryConfig;
    
    try {
        const res = await fetch(`${window.API_URL}/cloudinary-config`);
        cloudinaryConfig = await res.json();
        return cloudinaryConfig;
    } catch (err) {
        console.error('Failed to get Cloudinary config:', err);
        return null;
    }
}

/**
 * Upload file directly to Cloudinary
 * @param {File} file - The file to upload
 * @returns {Promise<string>} - The uploaded image URL
 */
async function uploadToCloudinary(file) {
    const config = await getCloudinaryConfig();
    if (!config) {
        throw new Error('Cloudinary configuration not available');
    }

    console.log('📤 Uploading to Cloudinary:', file.name);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', config.uploadPreset);

    try {
        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
            {
                method: 'POST',
                body: formData
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('❌ Cloudinary error:', errorData);
            throw new Error(`Cloudinary upload failed: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        console.log('✅ Upload successful:', data.secure_url);
        return data.secure_url;
    } catch (error) {
        console.error('❌ Upload error:', error);
        throw error;
    }
}

/**
 * Upload multiple files to Cloudinary
 * @param {FileList} files - The files to upload
 * @returns {Promise<string[]>} - Array of uploaded image URLs
 */
async function uploadMultipleToCloudinary(files) {
    const uploadPromises = Array.from(files).map(file => uploadToCloudinary(file));
    return Promise.all(uploadPromises);
}

// Export functions
window.cloudinaryUpload = {
    uploadToCloudinary,
    uploadMultipleToCloudinary
};
