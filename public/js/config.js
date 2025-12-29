let API_URL = "";

const origin = window.location.origin;

console.log('🔧 Config.js loading - origin:', origin);

// If not localhost → hosted mode
if (!origin.includes("localhost")) {
    // Use main domain with /api path
    API_URL = origin + "/api";
}
// Local development
else {
    API_URL = "http://localhost:3000/api";
}

console.log("🔧 API_URL Loaded:", API_URL);

// Prevent multiple assignments
if (window.API_URL && window.API_URL !== API_URL) {
    console.warn('⚠️ API_URL already exists with different value:', window.API_URL, 'vs', API_URL);
}

window.API_URL = API_URL;
