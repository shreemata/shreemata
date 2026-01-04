

document.addEventListener("DOMContentLoaded", () => {
    // Check if user is already logged in
    const token = localStorage.getItem('token');
    if (token) {
        window.location.href = '/';
        return;
    }

    setupEmailLoginForm();
    setupPhoneLoginForm();
    setupInputValidation();
    setupPasswordToggle();
    loadRememberedCredentials();
});

function setupInputValidation() {
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const phoneInput = document.getElementById("phoneNumber");
    const phonePasswordInput = document.getElementById("phonePassword");

    // Real-time email validation
    if (emailInput) {
        emailInput.addEventListener("blur", function() {
            const email = this.value.trim();
            if (email && !isValidEmail(email)) {
                showEmailError("Please enter a valid email address.");
            } else {
                clearEmailError();
            }
        });

        emailInput.addEventListener("input", clearEmailError);
    }

    // Real-time phone validation
    if (phoneInput) {
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
                showPhoneError("Mobile number should start with 6, 7, 8, or 9");
            } else {
                clearPhoneError();
            }
        });

        phoneInput.addEventListener("blur", function() {
            const phone = this.value.trim();
            if (phone.length > 0 && phone.length < 10) {
                showPhoneError("Please enter a complete 10-digit mobile number");
            }
        });

        phoneInput.addEventListener("input", clearPhoneError);
    }

    // Clear error when user starts typing
    if (passwordInput) passwordInput.addEventListener("input", clearEmailError);
    if (phonePasswordInput) phonePasswordInput.addEventListener("input", clearPhoneError);

    function showEmailError(message) {
        const errorMessage = document.getElementById("emailErrorMessage");
        if (errorMessage) {
            errorMessage.textContent = message;
            errorMessage.style.display = "block";
        }
    }

    function clearEmailError() {
        const errorMessage = document.getElementById("emailErrorMessage");
        if (errorMessage) {
            errorMessage.style.display = "none";
        }
    }

    function showPhoneError(message) {
        const errorMessage = document.getElementById("phoneErrorMessage");
        if (errorMessage) {
            errorMessage.textContent = message;
            errorMessage.style.display = "block";
        }
    }

    function clearPhoneError() {
        const errorMessage = document.getElementById("phoneErrorMessage");
        if (errorMessage) {
            errorMessage.style.display = "none";
        }
    }
}

function setupEmailLoginForm() {
    const form = document.getElementById("emailLoginForm");
    const errorMessage = document.getElementById("emailErrorMessage");
    const loginBtn = document.getElementById("emailLoginBtn");

    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value.trim();
        const rememberMe = document.getElementById("rememberMe").checked;

        errorMessage.style.display = "none";

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
        loginBtn.textContent = 'Signing in...';

        try {
            const response = await fetch(`${API_URL}/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                let errorMsg = data.error || "Login failed.";
                
                if (response.status === 400) {
                    if (errorMsg.includes("Invalid email or password")) {
                        errorMsg = "Invalid email or password. Please check your credentials and try again.";
                    }
                }

                errorMessage.textContent = errorMsg;
                errorMessage.style.display = "block";
                loginBtn.disabled = false;
                loginBtn.textContent = "Login with Email";
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

            // Redirect
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
            console.error("Login error:", err);
            errorMessage.textContent = "Network error. Please check your connection and try again.";
            errorMessage.style.display = "block";
            loginBtn.disabled = false;
            loginBtn.textContent = "Login with Email";
        }
    });
}

function setupPhoneLoginForm() {
    const form = document.getElementById("phoneLoginForm");
    const errorMessage = document.getElementById("phoneErrorMessage");
    const loginBtn = document.getElementById("phoneLoginBtn");

    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const phone = document.getElementById("phoneNumber").value.trim();
        const password = document.getElementById("phonePassword").value.trim();
        const rememberMe = document.getElementById("rememberMePhone").checked;

        errorMessage.style.display = "none";

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
        loginBtn.textContent = 'Signing in...';

        try {
            const response = await fetch(`${API_URL}/login-phone`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ phone, password })
            });

            const data = await response.json();

            if (!response.ok) {
                let errorMsg = data.error || "Login failed.";
                
                if (response.status === 400) {
                    if (errorMsg.includes("Invalid phone or password")) {
                        errorMsg = "Invalid phone number or password. Please check your credentials and try again.";
                    }
                }

                errorMessage.textContent = errorMsg;
                errorMessage.style.display = "block";
                loginBtn.disabled = false;
                loginBtn.textContent = "Login with Phone";
                return;
            }

            // Save JWT + User Info
            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));

            // Handle remember me for phone
            savePhoneCredentials(phone, rememberMe);

            // Show success message briefly
            loginBtn.textContent = "✓ Success! Redirecting...";
            loginBtn.style.backgroundColor = "#28a745";

            // Migrate guest cart to user cart
            if (typeof migrateGuestCartToUser === 'function') {
                migrateGuestCartToUser();
            }

            // Redirect
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
            errorMessage.textContent = "Network error. Please check your connection and try again.";
            errorMessage.style.display = "block";
            loginBtn.disabled = false;
            loginBtn.textContent = "Login with Phone";
        }
    });
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}



function loadRememberedCredentials() {
    const rememberedEmail = localStorage.getItem("rememberedEmail");
    const rememberedPhone = localStorage.getItem("rememberedPhone");
    
    if (rememberedEmail) {
        const emailInput = document.getElementById("email");
        const rememberCheckbox = document.getElementById("rememberMe");
        if (emailInput) emailInput.value = rememberedEmail;
        if (rememberCheckbox) rememberCheckbox.checked = true;
    }
    
    if (rememberedPhone) {
        const phoneInput = document.getElementById("phoneNumber");
        const rememberPhoneCheckbox = document.getElementById("rememberMePhone");
        if (phoneInput) phoneInput.value = rememberedPhone;
        if (rememberPhoneCheckbox) rememberPhoneCheckbox.checked = true;
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

function setupPasswordToggle() {
    const passwordInput = document.getElementById("password");
    const toggleButton = document.getElementById("togglePassword");
    const phonePasswordInput = document.getElementById("phonePassword");
    const togglePhoneButton = document.getElementById("togglePhonePassword");

    // Email password toggle
    if (toggleButton && passwordInput) {
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

    // Phone password toggle
    if (togglePhoneButton && phonePasswordInput) {
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
}




