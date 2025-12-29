
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
    loadSecurityQuestions();
    setupSignupForm();
});

// Load security questions from API
async function loadSecurityQuestions() {
    try {
        const response = await fetch(`${API_URL}/password-reset/security-questions`);
        const data = await response.json();
        
        if (data.success) {
            const questions = data.questions;
            const selects = ['securityQuestion1', 'securityQuestion2', 'securityQuestion3'];
            
            selects.forEach(selectId => {
                const select = document.getElementById(selectId);
                questions.forEach(question => {
                    const option = document.createElement('option');
                    option.value = question;
                    option.textContent = question;
                    select.appendChild(option);
                });
            });
            
            // Add change event listeners to prevent duplicate selections
            selects.forEach((selectId, index) => {
                document.getElementById(selectId).addEventListener('change', () => {
                    validateSecurityQuestionSelection();
                });
            });
        }
    } catch (error) {
        console.error('Error loading security questions:', error);
    }
}

// Validate that all security questions are different
function validateSecurityQuestionSelection() {
    const q1 = document.getElementById('securityQuestion1').value;
    const q2 = document.getElementById('securityQuestion2').value;
    const q3 = document.getElementById('securityQuestion3').value;
    
    const errorMessage = document.getElementById('errorMessage');
    
    if (q1 && q2 && q3) {
        if (q1 === q2 || q2 === q3 || q1 === q3) {
            errorMessage.textContent = 'Please select different security questions';
            errorMessage.style.display = 'block';
            return false;
        } else {
            if (errorMessage.textContent.includes('security questions')) {
                errorMessage.style.display = 'none';
            }
            return true;
        }
    }
    return true;
}

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

        // Security questions
        const securityQuestion1 = document.getElementById('securityQuestion1').value;
        const securityAnswer1 = document.getElementById('securityAnswer1').value.trim();
        const securityQuestion2 = document.getElementById('securityQuestion2').value;
        const securityAnswer2 = document.getElementById('securityAnswer2').value.trim();
        const securityQuestion3 = document.getElementById('securityQuestion3').value;
        const securityAnswer3 = document.getElementById('securityAnswer3').value.trim();

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

        // Validate security questions
        if (!securityQuestion1 || !securityAnswer1 || !securityQuestion2 || !securityAnswer2 || !securityQuestion3 || !securityAnswer3) {
            errorMessage.textContent = 'Please complete all security questions and answers';
            errorMessage.style.display = 'block';
            return;
        }

        if (!validateSecurityQuestionSelection()) {
            return;
        }

        if (securityAnswer1.length < 2 || securityAnswer2.length < 2 || securityAnswer3.length < 2) {
            errorMessage.textContent = 'Security answers must be at least 2 characters long';
            errorMessage.style.display = 'block';
            return;
        }

        signupBtn.disabled = true;
        signupBtn.textContent = 'Creating account...';

        try {
            // Step 1: Create user account
            const signupResponse = await fetch(`${API_URL}/signup`, {
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

            const signupData = await signupResponse.json();

            if (!signupResponse.ok) {
                errorMessage.textContent = signupData.error || 'Signup failed. Please try again.';
                errorMessage.style.display = 'block';
                signupBtn.disabled = false;
                signupBtn.textContent = 'Create Account';
                return;
            }

            // Step 2: Setup security questions
            signupBtn.textContent = 'Setting up security...';
            
            const securityResponse = await fetch(`${API_URL}/password-reset/setup-security`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${signupData.token}`
                },
                body: JSON.stringify({
                    question1: securityQuestion1,
                    answer1: securityAnswer1,
                    question2: securityQuestion2,
                    answer2: securityAnswer2,
                    question3: securityQuestion3,
                    answer3: securityAnswer3
                })
            });

            const securityData = await securityResponse.json();

            if (!securityResponse.ok) {
                errorMessage.textContent = securityData.error || 'Failed to setup security questions. Please try again.';
                errorMessage.style.display = 'block';
                signupBtn.disabled = false;
                signupBtn.textContent = 'Create Account';
                return;
            }

            // Success - store token and redirect
            localStorage.setItem('token', signupData.token);
            localStorage.setItem('user', JSON.stringify(signupData.user));

            // Migrate guest cart to user cart
            if (typeof migrateGuestCartToUser === 'function') {
                migrateGuestCartToUser();
            }

            alert('Account created successfully with security questions setup!');
            
            // Check if there's a redirect URL stored
            const redirectUrl = localStorage.getItem("redirectAfterLogin");
            if (redirectUrl) {
                localStorage.removeItem("redirectAfterLogin");
                window.location.href = redirectUrl;
            } else {
                window.location.href = '/';
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
