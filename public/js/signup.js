
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
setupPhoneVerification();

    setupSignupForm();
});

let phoneVerified = false;

function setupPhoneVerification() {
    const sendOtpBtn = document.getElementById("sendOtpBtn");
    const verifyOtpBtn = document.getElementById("verifyOtpBtn");
    const resendOtpBtn = document.getElementById("resendOtpBtn");
    const phoneInput = document.getElementById("phone");

    // Add input validation with real-time feedback
    phoneInput.addEventListener("input", function(e) {
        const statusEl = document.getElementById("otpStatus");
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
        const statusEl = document.getElementById("otpStatus");
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
        const statusEl = document.getElementById("otpStatus");
        if (statusEl.className === "error" && e.target.value.length === 0) {
            statusEl.textContent = "";
            statusEl.className = "";
        }
    });

    sendOtpBtn.addEventListener("click", async () => {
        const phone = document.getElementById("phone").value.trim();
        const statusEl = document.getElementById("otpStatus");

        // Enhanced phone number validation
        if (!phone) {
            statusEl.textContent = "Please enter your mobile number.";
            statusEl.className = "error";
            return;
        }
        
        // Check if starts with 0 (common mistake)
        if (phone.startsWith('0')) {
            statusEl.textContent = "Please enter mobile number without leading 0 (e.g., 9449171605 not 09449171605).";
            statusEl.className = "error";
            return;
        }
        
        if (phone.length !== 10) {
            statusEl.textContent = "Mobile number must be exactly 10 digits.";
            statusEl.className = "error";
            return;
        }
        
        if (!/^\d{10}$/.test(phone)) {
            statusEl.textContent = "Please enter a valid mobile number (numbers only).";
            statusEl.className = "error";
            return;
        }
        
        // Check for common invalid patterns (all same digits)
        if (/^(\d)\1{9}$/.test(phone)) {
            statusEl.textContent = "Please enter a valid mobile number.";
            statusEl.className = "error";
            return;
        }
        
        // Check if starts with valid Indian mobile prefixes
        if (!/^[6-9]/.test(phone)) {
            statusEl.textContent = "Please enter a valid Indian mobile number (should start with 6, 7, 8, or 9).";
            statusEl.className = "error";
            return;
        }

        sendOtpBtn.textContent = "Sending...";
        sendOtpBtn.disabled = true;

        try {
            // Add timeout to prevent hanging
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
            
            const res = await fetch(`${API_URL}/send-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            const data = await res.json();

            if (data.success) {
                document.getElementById("otpSection").style.display = "block";
                statusEl.textContent = "OTP sent successfully!";
                statusEl.className = "success";
                
                // Reset button state after successful send
                sendOtpBtn.disabled = false;
                sendOtpBtn.textContent = "Send OTP";
            } else {
                statusEl.textContent = data.error || "Failed to send OTP";
                statusEl.className = "error";
                sendOtpBtn.disabled = false;
                sendOtpBtn.textContent = "Send OTP";
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                statusEl.textContent = "Request timeout. Please try again.";
            } else {
                statusEl.textContent = "Network error while sending OTP.";
            }
            statusEl.className = "error";
            sendOtpBtn.disabled = false;
            sendOtpBtn.textContent = "Send OTP";
        }
    });

    verifyOtpBtn.addEventListener("click", async () => {
        const phone = document.getElementById("phone").value.trim();
        const otp = document.getElementById("otp").value.trim();
        const statusEl = document.getElementById("otpStatus");

        if (!otp) {
            statusEl.textContent = "Please enter OTP.";
            statusEl.className = "error";
            return;
        }

        verifyOtpBtn.textContent = "Verifying...";
        verifyOtpBtn.disabled = true;

        try {
            // Add timeout to prevent hanging
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
            
            const res = await fetch(`${API_URL}/verify-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone, otp }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            const data = await res.json();

            if (data.success) {
                phoneVerified = true;

                statusEl.textContent = "Phone number verified!";
                statusEl.className = "success";

                // Update button to show verified state
                verifyOtpBtn.textContent = "✓ Verified";
                verifyOtpBtn.disabled = true;
                verifyOtpBtn.style.backgroundColor = "#28a745";
                verifyOtpBtn.style.color = "white";

                // Lock the inputs and add visual indicators
                const phoneInput = document.getElementById("phone");
                const otpInput = document.getElementById("otp");
                const sendBtn = document.getElementById("sendOtpBtn");
                
                phoneInput.readOnly = true;
                phoneInput.style.backgroundColor = "#f8f9fa";
                phoneInput.style.border = "2px solid #28a745";
                
                otpInput.readOnly = true;
                otpInput.style.backgroundColor = "#f8f9fa";
                otpInput.style.border = "2px solid #28a745";
                
                sendBtn.disabled = true;
                sendBtn.style.backgroundColor = "#6c757d";
                sendBtn.textContent = "✓ Sent";

                // Add a small "Change Number" link
                if (!document.getElementById("changeNumberLink")) {
                    const changeLink = document.createElement("button");
                    changeLink.id = "changeNumberLink";
                    changeLink.textContent = "Change Number?";
                    changeLink.style.cssText = "background: none; border: none; color: #ff6f61; font-size: 12px; cursor: pointer; text-decoration: underline; margin-left: 10px;";
                    changeLink.onclick = () => resetPhoneVerification();
                    sendBtn.parentNode.appendChild(changeLink);
                }

            } else {
                statusEl.textContent = data.error || "Invalid OTP";
                statusEl.className = "error";
                verifyOtpBtn.disabled = false;
                verifyOtpBtn.textContent = "Verify OTP";
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                statusEl.textContent = "Request timeout. Please try again.";
            } else {
                statusEl.textContent = "Network error verifying OTP.";
            }
            statusEl.className = "error";
            verifyOtpBtn.disabled = false;
            verifyOtpBtn.textContent = "Verify OTP";
        }
    });

    // Resend OTP functionality
    resendOtpBtn.addEventListener("click", async () => {
        const phone = document.getElementById("phone").value.trim();
        const statusEl = document.getElementById("otpStatus");

        // Enhanced phone number validation
        if (!phone) {
            statusEl.textContent = "Please enter your mobile number.";
            statusEl.className = "error";
            return;
        }
        
        // Check if starts with 0 (common mistake)
        if (phone.startsWith('0')) {
            statusEl.textContent = "Please enter mobile number without leading 0 (e.g., 9449171605 not 09449171605).";
            statusEl.className = "error";
            return;
        }
        
        if (phone.length !== 10) {
            statusEl.textContent = "Mobile number must be exactly 10 digits.";
            statusEl.className = "error";
            return;
        }
        
        if (!/^\d{10}$/.test(phone)) {
            statusEl.textContent = "Please enter a valid mobile number (numbers only).";
            statusEl.className = "error";
            return;
        }

        resendOtpBtn.textContent = "Resending...";
        resendOtpBtn.disabled = true;

        try {
            // Add timeout to prevent hanging
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
            
            const res = await fetch(`${API_URL}/resend-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            const data = await res.json();

            if (data.success) {
                statusEl.textContent = "OTP resent successfully!";
                statusEl.className = "success";
                
                // Clear the OTP input
                document.getElementById("otp").value = "";
            } else {
                statusEl.textContent = data.error || "Failed to resend OTP";
                statusEl.className = "error";
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                statusEl.textContent = "Request timeout. Please try again.";
            } else {
                statusEl.textContent = "Network error while resending OTP.";
            }
            statusEl.className = "error";
        } finally {
            resendOtpBtn.disabled = false;
            resendOtpBtn.textContent = "Resend OTP";
        }
    });
}

function resetPhoneVerification() {
    // Reset verification state
    phoneVerified = false;
    
    // Reset UI elements
    const phoneInput = document.getElementById("phone");
    const otpInput = document.getElementById("otp");
    const sendBtn = document.getElementById("sendOtpBtn");
    const verifyBtn = document.getElementById("verifyOtpBtn");
    const statusEl = document.getElementById("otpStatus");
    const otpSection = document.getElementById("otpSection");
    const changeLink = document.getElementById("changeNumberLink");
    
    // Reset phone input
    phoneInput.readOnly = false;
    phoneInput.style.backgroundColor = "";
    phoneInput.style.border = "";
    phoneInput.focus();
    
    // Reset OTP input
    otpInput.readOnly = false;
    otpInput.style.backgroundColor = "";
    otpInput.style.border = "";
    otpInput.value = "";
    
    // Reset send button
    sendBtn.disabled = false;
    sendBtn.style.backgroundColor = "";
    sendBtn.textContent = "Send OTP";
    
    // Reset verify button
    verifyBtn.disabled = false;
    verifyBtn.style.backgroundColor = "";
    verifyBtn.style.color = "";
    verifyBtn.textContent = "Verify OTP";
    
    // Hide OTP section and clear status
    otpSection.style.display = "none";
    statusEl.textContent = "";
    statusEl.className = "";
    
    // Remove change link
    if (changeLink) {
        changeLink.remove();
    }
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

        // Check if phone is verified
        if (!phoneVerified) {
            errorMessage.textContent = 'Please verify your phone number first';
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
