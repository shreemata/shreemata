
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (token) {
        window.location.href = '/';
        return;
    }

    // Auto-fill referral code if present in URL
    const urlParams = new URLSearchParams(window.location.search);
    const refCodeFromURL = urlParams.get('ref');
    if (refCodeFromURL) {
        // Delay to ensure element exists when autofilling
        setTimeout(() => {
            const refInput = document.getElementById('referralInput');
            if (refInput) {
                refInput.value = refCodeFromURL;
            }
        }, 0);
    }

    setupPhoneValidation();
    setupSignupForm();
});

function setupPhoneValidation() {
    const phoneInput = document.getElementById("phone");
    const statusEl = document.getElementById("phoneStatus");

    // Add input validation with real-time feedback
    phoneInput.addEventListener("input", function(e) {
        const originalValue = e.target.value;
        let value = originalValue.replace(/\D/g, ''); // Remove non-digits
        
        // Show error for leading zero
        if (originalValue.startsWith('0') && originalValue.length > 1) {
            statusEl.textContent = "Please don't start with 0. Enter mobile number like 9449171605";
            statusEl.className = "error";
            value = value.substring(1); // Remove leading zero
        }
        // Show error for non-digits
        else if (originalValue !== value && originalValue.length > 0) {
            statusEl.textContent = "Please enter numbers only.";
            statusEl.className = "error";
        }
        // Show error for too many digits
        else if (value.length > 10) {
            statusEl.textContent = "Mobile number should be exactly 10 digits.";
            statusEl.className = "error";
            value = value.substring(0, 10);
        }
        // Show error for invalid starting digit
        else if (value.length > 0 && !/^[6-9]/.test(value)) {
            statusEl.textContent = "Mobile number should start with 6, 7, 8, or 9.";
            statusEl.className = "error";
        }
        // Clear error when input looks good
        else if (value.length >= 6 && /^[6-9]\d*$/.test(value)) {
            statusEl.textContent = "";
            statusEl.className = "";
        }
        
        e.target.value = value;
    });

    // Add blur validation for complete phone number
    phoneInput.addEventListener("blur", function(e) {
        const phone = e.target.value.trim();
        
        if (phone.length === 0) {
            statusEl.textContent = "";
            statusEl.className = "";
            return;
        }
        
        if (phone.length < 10) {
            statusEl.textContent = `Please enter complete 10-digit mobile number. You entered ${phone.length} digits.`;
            statusEl.className = "error";
        } else if (phone.length === 10 && /^[6-9]\d{9}$/.test(phone)) {
            // Check for all same digits
            if (/^(\d)\1{9}$/.test(phone)) {
                statusEl.textContent = "Please enter a valid mobile number.";
                statusEl.className = "error";
            } else {
                statusEl.textContent = "✓ Valid mobile number format";
                statusEl.className = "success";
            }
        }
    });

    // Clear status when user focuses on input
    phoneInput.addEventListener("focus", function(e) {
        if (statusEl.className === "error" && e.target.value.length === 0) {
            statusEl.textContent = "";
            statusEl.className = "";
        }
    });
}

function setupSignupForm() {
    const signupForm = document.getElementById('signupForm');

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const referralInputEl = document.getElementById('referralInput');
        const referralCode = referralInputEl ? referralInputEl.value.trim() : null;

        const errorMessage = document.getElementById('errorMessage');
        const signupBtn = document.getElementById('signupBtn');

        errorMessage.style.display = 'none';

        // Validate phone number format
        if (!phone) {
            errorMessage.textContent = 'Please enter your mobile number';
            errorMessage.style.display = 'block';
            return;
        }

        if (phone.length !== 10 || !/^[6-9]\d{9}$/.test(phone)) {
            errorMessage.textContent = 'Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9';
            errorMessage.style.display = 'block';
            return;
        }

        // Check for all same digits
        if (/^(\d)\1{9}$/.test(phone)) {
            errorMessage.textContent = 'Please enter a valid mobile number';
            errorMessage.style.display = 'block';
            return;
        }

        if (password !== confirmPassword) {
            errorMessage.textContent = 'Passwords do not match';
            errorMessage.style.display = 'block';
            return;
        }

        if (password.length < 6) {
            errorMessage.textContent = 'Password must be at least 6 characters';
            errorMessage.style.display = 'block';
            return;
        }

        signupBtn.disabled = true;
        signupBtn.textContent = 'Creating account...';

        try {
            const response = await fetch(`${API_URL}/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    name, 
                    email, 
                    phone,
                    password,
                    referredBy: referralCode || null
                })
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));

                // Migrate guest cart to user cart
                if (typeof migrateGuestCartToUser === 'function') {
                    migrateGuestCartToUser();
                }

                alert('Account created successfully!');
                
                // Check if there's a redirect URL stored
                const redirectUrl = localStorage.getItem("redirectAfterLogin");
                if (redirectUrl) {
                    localStorage.removeItem("redirectAfterLogin");
                    window.location.href = redirectUrl;
                } else {
                    window.location.href = '/';
                }
            } else {
                errorMessage.textContent = data.error || 'Signup failed. Please try again.';
                errorMessage.style.display = 'block';
                signupBtn.disabled = false;
                signupBtn.textContent = 'Create Account';
            }
        } catch (error) {
            console.error('Signup error:', error);
            errorMessage.textContent = 'Network error. Please try again.';
            errorMessage.style.display = 'block';
            signupBtn.disabled = false;
            signupBtn.textContent = 'Create Account';
        }
    });
}
