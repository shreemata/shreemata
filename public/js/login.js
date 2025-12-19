

document.addEventListener("DOMContentLoaded", () => {
    // Check if user is already logged in
    const token = localStorage.getItem('token');
    if (token) {
        window.location.href = '/';
        return;
    }

    setupLoginToggle();
    setupLoginForm();
    setupInputValidation();
    setupPasswordToggle();
    setupPhoneLogin();
    loadRememberedCredentials();
});

function setupInputValidation() {
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const errorMessage = document.getElementById("errorMessage");

    // Real-time email validation
    emailInput.addEventListener("blur", function() {
        const email = this.value.trim();
        if (email && !isValidEmail(email)) {
            showError("Please enter a valid email address.");
        } else {
            clearError();
        }
    });

    // Clear error when user starts typing
    emailInput.addEventListener("input", clearError);
    passwordInput.addEventListener("input", clearError);
    
    // Also clear errors for phone inputs
    const phoneInput = document.getElementById("loginPhone");
    const otpInput = document.getElementById("loginOtp");
    if (phoneInput) phoneInput.addEventListener("input", clearError);
    if (otpInput) otpInput.addEventListener("input", clearError);

    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = "block";
    }

    function clearError() {
        errorMessage.style.display = "none";
    }
}

function setupLoginForm() {
    const form = document.getElementById("loginForm");
    const errorMessage = document.getElementById("errorMessage");
    const loginBtn = document.getElementById("loginBtn");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        errorMessage.style.display = "none";

        if (currentLoginMethod === 'email') {
            await handleEmailLogin();
        } else {
            await handlePhoneLogin();
        }
    });

    async function handleEmailLogin() {
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value.trim();
        const rememberMe = document.getElementById("rememberMe").checked;

        // Client-side validation
        if (!email || !password) {
            errorMessage.textContent = "Please enter both email and password.";
            errorMessage.style.display = "block";
            return;
        }

        if (!isValidEmail(email)) {
            errorMessage.textContent = "Please enter a valid email address.";
            errorMessage.style.display = "block";
            return;
        }

        loginBtn.disabled = true;
        loginBtn.innerHTML = '<span class="loading"></span>Signing in...';

        try {
            // Add timeout to prevent hanging
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

            const response = await fetch(`${API_URL}/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ email, password }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const data = await response.json();

            if (!response.ok) {
                // Handle specific error cases
                let errorMsg = data.error || "Login failed.";
                
                if (response.status === 400) {
                    if (errorMsg.includes("Invalid email or password")) {
                        errorMsg = "Invalid email or password. Please check your credentials and try again.";
                    }
                } else if (response.status === 429) {
                    errorMsg = "Too many login attempts. Please try again later.";
                } else if (response.status >= 500) {
                    errorMsg = "Server error. Please try again in a moment.";
                }

                errorMessage.textContent = errorMsg;
                errorMessage.style.display = "block";

                loginBtn.disabled = false;
                loginBtn.innerHTML = "Sign In";
                return;
            }

            // Save JWT + User Info
            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));

            // Handle remember me
            saveCredentials(email, rememberMe);

            // Show success message briefly
            loginBtn.textContent = "✓ Success! Redirecting...";
            loginBtn.style.backgroundColor = "#28a745";

            // Migrate guest cart to user cart
            if (typeof migrateGuestCartToUser === 'function') {
                migrateGuestCartToUser();
            }

            // Small delay for user feedback, then redirect
            setTimeout(() => {
                // Check if there's a redirect URL stored
                const redirectUrl = localStorage.getItem("redirectAfterLogin");
                if (redirectUrl) {
                    localStorage.removeItem("redirectAfterLogin");
                    window.location.href = redirectUrl;
                } else {
                    window.location.href = "/";
                }
            }, 1000);

        } catch (err) {
            console.error("Login error:", err);
            
            let errorMsg = "Network error. Please check your connection and try again.";
            if (err.name === 'AbortError') {
                errorMsg = "Request timeout. Please try again.";
            }
            
            errorMessage.textContent = errorMsg;
            errorMessage.style.display = "block";

            loginBtn.disabled = false;
            loginBtn.innerHTML = "Sign In";
        }
    }

    async function handlePhoneLogin() {
        const phone = document.getElementById("loginPhone").value.trim();
        const otp = document.getElementById("loginOtp").value.trim();
        const otpSection = document.getElementById("otpLoginSection");

        // Validate phone number first
        if (!phone) {
            errorMessage.textContent = "Please enter your mobile number.";
            errorMessage.style.display = "block";
            return;
        }

        if (!/^[6-9]\d{9}$/.test(phone)) {
            errorMessage.textContent = "Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.";
            errorMessage.style.display = "block";
            return;
        }

        // If OTP section is not visible, send OTP first
        if (otpSection.style.display === "none" || otpSection.style.display === "") {
            const sendOtpBtn = document.getElementById("sendLoginOtpBtn");
            sendOtpBtn.click();
            return;
        }

        // Validate OTP input
        if (!otp) {
            errorMessage.textContent = "Please enter the OTP sent to your phone.";
            errorMessage.style.display = "block";
            return;
        }

        if (!/^\d{6}$/.test(otp)) {
            errorMessage.textContent = "Please enter a valid 6-digit OTP.";
            errorMessage.style.display = "block";
            return;
        }

        loginBtn.disabled = true;
        loginBtn.innerHTML = '<span class="loading"></span>Verifying OTP...';

        try {
            const response = await fetch(`${API_URL}/login-verify-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone, otp })
            });

            const data = await response.json();

            if (data.success) {
                // Save JWT + User Info
                localStorage.setItem("token", data.token);
                localStorage.setItem("user", JSON.stringify(data.user));

                // Show success message
                loginBtn.innerHTML = "✓ Success! Redirecting...";
                loginBtn.style.backgroundColor = "#28a745";

                // Migrate guest cart to user cart
                if (typeof migrateGuestCartToUser === 'function') {
                    migrateGuestCartToUser();
                }

                // Redirect after delay
                setTimeout(() => {
                    const redirectUrl = localStorage.getItem("redirectAfterLogin");
                    if (redirectUrl) {
                        localStorage.removeItem("redirectAfterLogin");
                        window.location.href = redirectUrl;
                    } else {
                        window.location.href = "/";
                    }
                }, 1000);

            } else {
                errorMessage.textContent = data.error || "Invalid OTP. Please try again.";
                errorMessage.style.display = "block";
                loginBtn.disabled = false;
                loginBtn.innerHTML = "Verify OTP";
            }
        } catch (error) {
            console.error("Phone login error:", error);
            errorMessage.textContent = "Network error. Please try again.";
            errorMessage.style.display = "block";
            loginBtn.disabled = false;
            loginBtn.innerHTML = "Verify OTP";
        }
    }

    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
}

function setupPasswordToggle() {
    const passwordInput = document.getElementById("password");
    const toggleButton = document.getElementById("togglePassword");

    toggleButton.addEventListener("click", function() {
        if (passwordInput.type === "password") {
            passwordInput.type = "text";
            toggleButton.textContent = "🙈";
        } else {
            passwordInput.type = "password";
            toggleButton.textContent = "👁️";
        }
    });
}

function loadRememberedCredentials() {
    const rememberedEmail = localStorage.getItem("rememberedEmail");
    if (rememberedEmail) {
        document.getElementById("email").value = rememberedEmail;
        document.getElementById("rememberMe").checked = true;
    }
}

function saveCredentials(email, remember) {
    if (remember) {
        localStorage.setItem("rememberedEmail", email);
    } else {
        localStorage.removeItem("rememberedEmail");
    }
}

let currentLoginMethod = 'email';
let phoneLoginVerified = false;

function setupLoginToggle() {
    const emailToggle = document.getElementById("emailToggle");
    const phoneToggle = document.getElementById("phoneToggle");
    const emailSection = document.getElementById("emailLoginSection");
    const phoneSection = document.getElementById("phoneLoginSection");
    const loginBtn = document.getElementById("loginBtn");

    emailToggle.addEventListener("click", () => {
        console.log("Email toggle clicked");
        currentLoginMethod = 'email';
        emailToggle.classList.add("active");
        phoneToggle.classList.remove("active");
        emailSection.classList.add("active");
        phoneSection.classList.remove("active");
        loginBtn.textContent = "Sign In";
        clearError();
        resetPhoneLogin();
        console.log("Email section should now be visible");
    });

    phoneToggle.addEventListener("click", () => {
        console.log("Phone toggle clicked");
        currentLoginMethod = 'phone';
        phoneToggle.classList.add("active");
        emailToggle.classList.remove("active");
        phoneSection.classList.add("active");
        emailSection.classList.remove("active");
        updateLoginButtonText();
        clearError();
        console.log("Phone section should now be visible");
    });

    function clearError() {
        const errorMessage = document.getElementById("errorMessage");
        errorMessage.style.display = "none";
    }

    function updateLoginButtonText() {
        const loginBtn = document.getElementById("loginBtn");
        const otpSection = document.getElementById("otpLoginSection");
        
        if (currentLoginMethod === 'phone') {
            if (otpSection.style.display === "none" || otpSection.style.display === "") {
                loginBtn.textContent = "Send OTP";
            } else {
                loginBtn.textContent = "Verify OTP";
            }
        } else {
            loginBtn.textContent = "Sign In";
        }
    }
}

function setupPhoneLogin() {
    const phoneInput = document.getElementById("loginPhone");
    const sendOtpBtn = document.getElementById("sendLoginOtpBtn");
    const resendOtpBtn = document.getElementById("resendLoginOtpBtn");
    const phoneStatus = document.getElementById("phoneStatus");
    const otpSection = document.getElementById("otpLoginSection");

    // Phone input validation
    phoneInput.addEventListener("input", function(e) {
        let value = e.target.value.replace(/\D/g, '');
        
        if (value.startsWith('0')) {
            value = value.substring(1);
            phoneStatus.textContent = "Please don't start with 0";
            phoneStatus.className = "otp-status error";
            phoneStatus.style.display = "block";
        } else if (value.length > 0 && !/^[6-9]/.test(value)) {
            phoneStatus.textContent = "Mobile number should start with 6, 7, 8, or 9";
            phoneStatus.className = "otp-status error";
            phoneStatus.style.display = "block";
        } else if (value.length > 10) {
            value = value.substring(0, 10);
        } else if (value.length === 10 && /^[6-9]\d{9}$/.test(value)) {
            phoneStatus.style.display = "none";
        }
        
        e.target.value = value;
    });

    // Send OTP button
    sendOtpBtn.addEventListener("click", async () => {
        const phone = phoneInput.value.trim();
        
        if (!isValidPhone(phone)) {
            showPhoneError("Please enter a valid 10-digit mobile number");
            return;
        }

        sendOtpBtn.textContent = "Sending...";
        sendOtpBtn.disabled = true;

        try {
            const response = await fetch(`${API_URL}/login-send-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone })
            });

            const data = await response.json();

            if (data.success) {
                otpSection.style.display = "block";
                phoneStatus.textContent = `OTP sent to ${phone}. Hello ${data.userName}!`;
                phoneStatus.className = "otp-status success";
                phoneStatus.style.display = "block";
                phoneInput.readOnly = true;
                sendOtpBtn.textContent = "✓ Sent";
                
                // Update main login button text
                const loginBtn = document.getElementById("loginBtn");
                loginBtn.textContent = "Verify OTP";
            } else {
                showPhoneError(data.error || "Failed to send OTP");
                sendOtpBtn.disabled = false;
                sendOtpBtn.textContent = "Send OTP";
            }
        } catch (error) {
            showPhoneError("Network error. Please try again.");
            sendOtpBtn.disabled = false;
            sendOtpBtn.textContent = "Send OTP";
        }
    });

    // Resend OTP
    resendOtpBtn.addEventListener("click", async () => {
        const phone = phoneInput.value.trim();
        
        resendOtpBtn.textContent = "Resending...";
        resendOtpBtn.disabled = true;

        try {
            const response = await fetch(`${API_URL}/login-send-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone })
            });

            const data = await response.json();

            if (data.success) {
                phoneStatus.textContent = "OTP resent successfully!";
                phoneStatus.className = "otp-status success";
                phoneStatus.style.display = "block";
                document.getElementById("loginOtp").value = "";
            } else {
                showPhoneError(data.error || "Failed to resend OTP");
            }
        } catch (error) {
            showPhoneError("Network error. Please try again.");
        } finally {
            resendOtpBtn.disabled = false;
            resendOtpBtn.textContent = "Resend OTP";
        }
    });

    function isValidPhone(phone) {
        return /^[6-9]\d{9}$/.test(phone);
    }

    function showPhoneError(message) {
        phoneStatus.textContent = message;
        phoneStatus.className = "otp-status error";
        phoneStatus.style.display = "block";
    }
}

function resetPhoneLogin() {
    phoneLoginVerified = false;
    const phoneInput = document.getElementById("loginPhone");
    const otpInput = document.getElementById("loginOtp");
    const sendOtpBtn = document.getElementById("sendLoginOtpBtn");
    const phoneStatus = document.getElementById("phoneStatus");
    const otpSection = document.getElementById("otpLoginSection");

    phoneInput.readOnly = false;
    phoneInput.value = "";
    otpInput.value = "";
    sendOtpBtn.disabled = false;
    sendOtpBtn.textContent = "Send OTP";
    phoneStatus.style.display = "none";
    otpSection.style.display = "none";
}
