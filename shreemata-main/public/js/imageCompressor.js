/**
 * Image Compression Utility
 * Compresses images before upload to avoid Cloudflare limits
 */

/**
 * Compress an image file
 * @param {File} file - The image file to compress
 * @param {number} maxWidth - Maximum width (default: 800)
 * @param {number} maxHeight - Maximum height (default: 1200)
 * @param {number} quality - JPEG quality 0-1 (default: 0.8)
 * @returns {Promise<File>} - Compressed image file
 */
function compressImage(file, maxWidth = 800, maxHeight = 1200, quality = 0.8) {
    return new Promise((resolve, reject) => {
        // Check if it's an image
        if (!file.type.startsWith('image/')) {
            resolve(file); // Return original if not an image
            return;
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();

        img.onload = function() {
            // Calculate new dimensions
            let { width, height } = img;
            
            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }
            
            if (height > maxHeight) {
                width = (width * maxHeight) / height;
                height = maxHeight;
            }

            // Set canvas size
            canvas.width = width;
            canvas.height = height;

            // Draw and compress
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        // Create new file with compressed data
                        const compressedFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });
                        
                        console.log(`📦 Compressed ${file.name}: ${(file.size/1024/1024).toFixed(2)}MB → ${(compressedFile.size/1024/1024).toFixed(2)}MB`);
                        resolve(compressedFile);
                    } else {
                        reject(new Error('Compression failed'));
                    }
                },
                'image/jpeg',
                quality
            );
        };

        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = URL.createObjectURL(file);
    });
}

/**
 * Compress multiple images
 * @param {FileList|File[]} files - Array of image files
 * @returns {Promise<File[]>} - Array of compressed files
 */
async function compressMultipleImages(files) {
    const fileArray = Array.from(files);
    const compressPromises = fileArray.map(file => compressImage(file));
    return Promise.all(compressPromises);
}

// Export functions
window.imageCompressor = {
    compressImage,
    compressMultipleImages
};