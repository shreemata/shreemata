

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
    loadRememberedCredentials();
});

function setupInputValidation() {
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const phoneInput = document.getElementById("loginPhone");
    const phonePasswordInput = document.getElementById("phonePassword");
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

    // Real-time phone validation
    phoneInput.addEventListener("input", function(e) {
        let value = e.target.value.replace(/\D/g, '');
        
        if (value.startsWith('0')) {
            value = value.substring(1);
        }
        
        if (value.length > 10) {
            value = value.substring(0, 10);
        }
        
        e.target.value = value;
        
        if (value.length > 0 && !/^[6-9]/.test(value)) {
            showError("Mobile number should start with 6, 7, 8, or 9");
        } else {
            clearError();
        }
    });

    // Clear error when user starts typing
    emailInput.addEventListener("input", clearError);
    passwordInput.addEventListener("input", clearError);
    phoneInput.addEventListener("input", clearError);
    phonePasswordInput.addEventListener("input", clearError);

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
        const password = document.getElementById("phonePassword").value.trim();
        const rememberPhone = document.getElementById("rememberPhone").checked;

        // Client-side validation
        if (!phone || !password) {
            errorMessage.textContent = "Please enter both phone number and password.";
            errorMessage.style.display = "block";
            return;
        }

        if (!/^[6-9]\d{9}$/.test(phone)) {
            errorMessage.textContent = "Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.";
            errorMessage.style.display = "block";
            return;
        }

        loginBtn.disabled = true;
        loginBtn.innerHTML = '<span class="loading"></span>Signing in...';

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const response = await fetch(`${API_URL}/login-phone`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ phone, password }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const data = await response.json();

            if (!response.ok) {
                let errorMsg = data.error || "Login failed.";
                
                if (response.status === 400) {
                    if (errorMsg.includes("Invalid phone or password")) {
                        errorMsg = "Invalid phone number or password. Please check your credentials and try again.";
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

            // Handle remember me for phone
            savePhoneCredentials(phone, rememberPhone);

            // Show success message briefly
            loginBtn.textContent = "✓ Success! Redirecting...";
            loginBtn.style.backgroundColor = "#28a745";

            // Migrate guest cart to user cart
            if (typeof migrateGuestCartToUser === 'function') {
                migrateGuestCartToUser();
            }

            // Small delay for user feedback, then redirect
            setTimeout(() => {
                const redirectUrl = localStorage.getItem("redirectAfterLogin");
                if (redirectUrl) {
                    localStorage.removeItem("redirectAfterLogin");
                    window.location.href = redirectUrl;
                } else {
                    window.location.href = "/";
                }
            }, 1000);

        } catch (err) {
            console.error("Phone login error:", err);
            
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

    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
}

function setupPasswordToggle() {
    const passwordInput = document.getElementById("password");
    const toggleButton = document.getElementById("togglePassword");
    const phonePasswordInput = document.getElementById("phonePassword");
    const togglePhoneButton = document.getElementById("togglePhonePassword");

    // Email password toggle
    toggleButton.addEventListener("click", function() {
        if (passwordInput.type === "password") {
            passwordInput.type = "text";
            toggleButton.textContent = "🙈";
        } else {
            passwordInput.type = "password";
            toggleButton.textContent = "👁️";
        }
    });

    // Phone password toggle
    togglePhoneButton.addEventListener("click", function() {
        if (phonePasswordInput.type === "password") {
            phonePasswordInput.type = "text";
            togglePhoneButton.textContent = "🙈";
        } else {
            phonePasswordInput.type = "password";
            togglePhoneButton.textContent = "👁️";
        }
    });
}

function loadRememberedCredentials() {
    const rememberedEmail = localStorage.getItem("rememberedEmail");
    const rememberedPhone = localStorage.getItem("rememberedPhone");
    
    if (rememberedEmail) {
        document.getElementById("email").value = rememberedEmail;
        document.getElementById("rememberMe").checked = true;
    }
    
    if (rememberedPhone) {
        document.getElementById("loginPhone").value = rememberedPhone;
        document.getElementById("rememberPhone").checked = true;
    }
}

function saveCredentials(email, remember) {
    if (remember) {
        localStorage.setItem("rememberedEmail", email);
    } else {
        localStorage.removeItem("rememberedEmail");
    }
}

function savePhoneCredentials(phone, remember) {
    if (remember) {
        localStorage.setItem("rememberedPhone", phone);
    } else {
        localStorage.removeItem("rememberedPhone");
    }
}

let currentLoginMethod = 'email';

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
        console.log("Email section should now be visible");
    });

    phoneToggle.addEventListener("click", () => {
        console.log("Phone toggle clicked");
        currentLoginMethod = 'phone';
        phoneToggle.classList.add("active");
        emailToggle.classList.remove("active");
        phoneSection.classList.add("active");
        emailSection.classList.remove("active");
        loginBtn.textContent = "Sign In";
        clearError();
        console.log("Phone section should now be visible");
    });

    function clearError() {
        const errorMessage = document.getElementById("errorMessage");
        errorMessage.style.display = "none";
    }
}


