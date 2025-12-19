let API_URL = "";

const origin = window.location.origin;

// If not localhost → hosted mode
if (!origin.includes("localhost")) {
    // Use main domain with /api path
    API_URL = origin + "/api";
}
// Local development
else {
    API_URL = "http://localhost:3000/api";
}

console.log("API_URL Loaded:", API_URL);

window.API_URL = API_URL;
