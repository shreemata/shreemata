/**
 * Admin Navigation Component
 * Provides consistent navigation across all admin pages
 */

// Admin navigation configuration
const adminNavConfig = {
    title: "📚 Shree Mata Admin",
    links: [
        { href: "/", icon: "🏠", text: "Home" },
        { href: "/admin.html", icon: "📚", text: "Books", id: "books", title: "Manage Books" },
        { href: "/admin-bundles.html", icon: "📦", text: "Bundles", id: "bundles", title: "Manage Bundles" },
        { href: "/admin-orders.html", icon: "🛒", text: "Orders", id: "orders", title: "Manage Orders" },
        { href: "/admin-withdrawals.html", icon: "💰", text: "Withdrawals", id: "withdrawals", title: "Manage Withdrawals" },
        { href: "/admin-bank-requests.html", icon: "🏦", text: "Bank Requests", id: "bank-requests", title: "Bank Change Requests" },
        { href: "/admin-notifications.html", icon: "📢", text: "Notifications", id: "notifications", title: "Manage Notifications" },
        { href: "/admin-income.html", icon: "💵", text: "Income", id: "income", title: "Income Dashboard" },
        { href: "/admin-users.html", icon: "👥", text: "Users", id: "users", title: "User Management" },
        { href: "/admin-password-requests.html", icon: "🔐", text: "Password Requests", id: "password-requests", title: "Password Reset Requests" },
        { href: "/admin-commission-settings.html", icon: "⚙️", text: "Settings", id: "settings", title: "Commission Settings" },
        { href: "/admin-receipt-settings.html", icon: "🧾", text: "Receipt Settings", id: "receipt-settings", title: "Receipt Settings" },
        { href: "/admin-referral-tree.html", icon: "🌳", text: "Referral Tree", id: "referral-tree", title: "Referral Tree" },
        { href: "/admin-referral-tree-visual.html", icon: "📊", text: "Tree Visual", id: "tree-visual", title: "Referral Tree Visual" },
        { href: "/", icon: "🚪", text: "Logout", id: "logout" }
    ]
};

// Initialize admin navigation
function initAdminNavigation(currentPageId = '') {
    let nav = document.querySelector('nav');
    
    // If no nav element exists, create one
    if (!nav) {
        nav = document.createElement('nav');
        nav.style.cssText = `
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px 0;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 100;
        `;
        
        // Insert at the beginning of body
        document.body.insertBefore(nav, document.body.firstChild);
        
        // Add top margin to body to account for fixed nav
        document.body.style.paddingTop = '80px';
        
        // Hide existing admin headers to avoid duplication
        const existingHeaders = document.querySelectorAll('.header, .admin-header');
        existingHeaders.forEach(header => {
            if (header.querySelector('h1') && header.querySelector('h1').textContent.includes('Admin')) {
                header.style.display = 'none';
            }
        });
    }

    // Create navigation HTML
    const navHTML = createAdminNavHTML(currentPageId);
    nav.innerHTML = navHTML;

    // Setup mobile menu functionality
    setupMobileMenu();

    // Setup logout functionality
    setupLogout();

    // Load user info
    loadAdminUserInfo();
}

// Create navigation HTML
function createAdminNavHTML(currentPageId) {
    const linksHTML = adminNavConfig.links.map(link => {
        const isActive = link.id === currentPageId || 
                        (currentPageId === '' && link.href === '/admin.html') ||
                        window.location.pathname.includes(link.href.replace('/', ''));
        
        const activeClass = isActive ? 'active' : '';
        const logoutId = link.id === 'logout' ? 'id="logoutBtn"' : '';
        
        return `<a href="${link.href}" class="${activeClass}" ${logoutId}>
                    ${link.icon} ${link.text}
                </a>`;
    }).join('');

    return `
        <div class="container">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <button id="backBtn" class="back-btn" onclick="goBack()" style="display: none;">
                        ← Back
                    </button>
                    <h1>${adminNavConfig.title}</h1>
                </div>
                <button id="mobileMenuToggle" class="mobile-menu-toggle" onclick="toggleAdminMobileMenu()">
                    <span id="adminMenuIcon">☰</span> Menu
                </button>
            </div>
            <div id="adminNavLinks" class="admin-nav-links">
                <span id="userName" style="color: white; margin-right: 10px;"></span>
                ${linksHTML}
            </div>
        </div>
    `;
}

// Setup mobile menu functionality
function setupMobileMenu() {
    // Remove any existing event listeners to prevent duplicates
    const existingToggle = document.getElementById('mobileMenuToggle');
    if (existingToggle) {
        existingToggle.replaceWith(existingToggle.cloneNode(true));
    }
    
    // Add mobile menu styles if not already present
    if (!document.getElementById('adminNavStyles')) {
        const style = document.createElement('style');
        style.id = 'adminNavStyles';
        style.textContent = `
            /* Ensure nav is properly styled */
            nav {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
                padding: 20px 0 !important;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1) !important;
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                z-index: 100 !important;
            }
            
            nav .container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 0 20px;
            }
            
            nav h1 {
                color: white !important;
                margin: 0 !important;
                font-size: 24px !important;
            }
            
            nav a {
                color: white !important;
                text-decoration: none !important;
                padding: 8px 16px;
                border-radius: 6px;
                transition: all 0.3s ease;
                font-weight: 500;
            }
            
            nav a:hover, nav a.active {
                background: rgba(255, 255, 255, 0.2) !important;
            }

            .mobile-menu-toggle {
                display: none;
                background: rgba(255, 255, 255, 0.2);
                border: 2px solid rgba(255, 255, 255, 0.3);
                color: white;
                padding: 10px 15px;
                border-radius: 8px;
                font-size: 16px;
                cursor: pointer;
                transition: all 0.3s ease;
            }

            .mobile-menu-toggle:hover {
                background: rgba(255, 255, 255, 0.3);
            }

            .back-btn {
                background: rgba(255, 255, 255, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.3);
                color: white;
                padding: 8px 15px;
                border-radius: 8px;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.3s ease;
            }

            .back-btn:hover {
                background: rgba(255, 255, 255, 0.3);
                transform: translateX(-2px);
            }

            .admin-nav-links {
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                gap: 8px;
                transition: all 0.3s ease;
            }

            .admin-nav-links a {
                padding: 8px 12px;
                font-size: 12px;
                min-width: auto;
                white-space: nowrap;
            }

            /* Always show menu button for better UX */
            .mobile-menu-toggle {
                display: block;
            }
            
            @media (min-width: 1025px) {
                .mobile-menu-toggle {
                    background: rgba(255, 255, 255, 0.15);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }
                
                .mobile-menu-toggle:hover {
                    background: rgba(255, 255, 255, 0.25);
                }
            }

            @media (max-width: 1024px) {

                nav .container {
                    flex-direction: column;
                    gap: 15px;
                    padding: 15px 10px;
                    position: relative;
                }

                .admin-nav-links {
                    position: absolute;
                    top: 100%;
                    left: 10px;
                    right: 10px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 12px;
                    padding: 20px;
                    box-shadow: 0 8px 25px rgba(0,0,0,0.3);
                    flex-direction: column;
                    gap: 12px;
                    max-height: 0;
                    overflow: hidden;
                    opacity: 0;
                    transform: translateY(-10px);
                    z-index: 1000;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
                
            }
            
            /* Desktop dropdown menu */
            @media (min-width: 1025px) {
                nav .container {
                    flex-direction: row;
                    justify-content: space-between;
                    align-items: center;
                    padding: 15px 20px;
                    position: relative;
                }
                
                .admin-nav-links {
                    position: absolute;
                    top: 100%;
                    right: 0;
                    left: auto;
                    width: 300px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 12px;
                    padding: 20px;
                    box-shadow: 0 8px 25px rgba(0,0,0,0.3);
                    flex-direction: column;
                    gap: 12px;
                    max-height: 0;
                    overflow: hidden;
                    opacity: 0;
                    transform: translateY(-10px);
                    z-index: 1000;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
                
                .admin-nav-links a {
                    padding: 10px 16px;
                    font-size: 14px;
                    border-radius: 8px;
                    transition: all 0.3s ease;
                    text-align: left;
                }
                
                #userName {
                    text-align: left;
                    padding: 10px 16px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    margin-bottom: 10px;
                }

                .admin-nav-links.mobile-menu-open {
                    max-height: 600px !important;
                    opacity: 1 !important;
                    transform: translateY(0) !important;
                    visibility: visible !important;
                    display: flex !important;
                    pointer-events: auto !important;
                }

                .admin-nav-links a {
                    padding: 12px 16px;
                    font-size: 14px;
                    border-radius: 8px;
                    transition: all 0.3s ease;
                    text-align: center;
                }

                .admin-nav-links a:hover, 
                .admin-nav-links a.active {
                    background: rgba(255, 255, 255, 0.2);
                    transform: translateX(5px);
                }

                #userName {
                    text-align: center;
                    padding: 10px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    margin-bottom: 10px;
                }
            }

            @media (max-width: 480px) {
                .admin-nav-links a {
                    padding: 10px 14px;
                    font-size: 13px;
                }

                .mobile-menu-toggle {
                    padding: 8px 12px;
                    font-size: 14px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Setup event listeners using event delegation
    setupEventListeners();
}

function setupEventListeners() {
    // Multiple attempts to ensure event listeners work
    const attempts = [100, 300, 500, 1000];
    
    attempts.forEach(delay => {
        setTimeout(function() {
            const menuToggle = document.getElementById('mobileMenuToggle');
            const backBtn = document.getElementById('backBtn');
            
            if (menuToggle && !menuToggle.hasAttribute('data-listener-attached')) {
                console.log(`🔧 Setting up event listeners (attempt at ${delay}ms):`, {
                    menuToggle: !!menuToggle,
                    backBtn: !!backBtn
                });
                
                // Mark as having listener to avoid duplicates
                menuToggle.setAttribute('data-listener-attached', 'true');
                
                // Multiple event types for maximum compatibility
                ['click', 'touchstart', 'mousedown'].forEach(eventType => {
                    menuToggle.addEventListener(eventType, function(e) {
                        console.log(`📱 Menu toggle ${eventType} triggered`);
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // Small delay to ensure DOM is ready
                        setTimeout(() => {
                            toggleAdminMobileMenu();
                        }, 10);
                    }, { passive: false });
                });
                
                // Also add onclick as ultimate fallback
                menuToggle.onclick = function(e) {
                    console.log('📱 Menu toggle onclick fallback triggered');
                    e.preventDefault();
                    e.stopPropagation();
                    toggleAdminMobileMenu();
                    return false;
                };
            }
            
            if (backBtn && !backBtn.hasAttribute('data-listener-attached')) {
                backBtn.setAttribute('data-listener-attached', 'true');
                backBtn.onclick = function(e) {
                    e.preventDefault();
                    goBack();
                };
            }
            
        }, delay);
    });
    
    // Handle click outside to close menu - only set once
    if (!document.documentElement.hasAttribute('data-outside-click-setup')) {
        document.documentElement.setAttribute('data-outside-click-setup', 'true');
        
        document.addEventListener('click', function(e) {
            const navLinks = document.getElementById('adminNavLinks');
            const menuToggle = document.getElementById('mobileMenuToggle');
            
            if (navLinks && menuToggle && 
                navLinks.classList.contains('mobile-menu-open') &&
                !navLinks.contains(e.target) && 
                !menuToggle.contains(e.target)) {
                
                console.log('🔒 Closing menu due to outside click');
                navLinks.classList.remove('mobile-menu-open');
                const menuIcon = document.getElementById('adminMenuIcon');
                if (menuIcon) menuIcon.textContent = '☰';
            }
        });
    }
}

// Mobile menu toggle function (global) - Completely rewritten for reliability
window.toggleAdminMobileMenu = function() {
    console.log('=== MOBILE MENU TOGGLE START ===');
    
    // Find elements with multiple fallback methods
    let navLinks = document.getElementById('adminNavLinks') || 
                   document.querySelector('.admin-nav-links') ||
                   document.querySelector('[id*="adminNavLinks"]');
                   
    let menuIcon = document.getElementById('adminMenuIcon') || 
                   document.querySelector('#mobileMenuToggle span') ||
                   document.querySelector('.mobile-menu-toggle span');
    
    console.log('🔍 Element search results:', {
        navLinks: !!navLinks,
        menuIcon: !!menuIcon,
        navLinksId: navLinks ? navLinks.id : 'none',
        menuIconParent: menuIcon ? menuIcon.parentElement.id : 'none'
    });
    
    if (!navLinks || !menuIcon) {
        console.error('❌ Critical elements missing - recreating navigation');
        // Try to reinitialize navigation
        setTimeout(() => {
            initializeAdminNavigation();
        }, 100);
        return false;
    }
    
    // Get current state
    const currentClasses = navLinks.className;
    const isCurrentlyOpen = navLinks.classList.contains('mobile-menu-open');
    
    console.log('📊 Current state:', {
        isOpen: isCurrentlyOpen,
        classes: currentClasses,
        iconText: menuIcon.textContent.trim()
    });
    
    // Force clear any stuck states first
    navLinks.style.transition = 'none';
    navLinks.classList.remove('mobile-menu-open');
    
    // Force reflow
    navLinks.offsetHeight;
    
    // Re-enable transitions
    navLinks.style.transition = '';
    
    if (isCurrentlyOpen) {
        // Close menu
        navLinks.classList.remove('mobile-menu-open');
        menuIcon.textContent = '☰';
        console.log('🔒 Menu CLOSED');
    } else {
        // Open menu
        navLinks.classList.add('mobile-menu-open');
        menuIcon.textContent = '✕';
        console.log('🔓 Menu OPENED');
    }
    
    // Double-check the final state
    setTimeout(() => {
        const finalState = navLinks.classList.contains('mobile-menu-open');
        console.log('✅ Final verification - Menu is open:', finalState);
        console.log('=== MOBILE MENU TOGGLE END ===');
    }, 50);
    
    return true;
};

// Setup logout functionality
function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (confirm('Are you sure you want to logout?')) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/';
            }
        });
    }
}

// Load admin user info
function loadAdminUserInfo() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const userNameEl = document.getElementById('userName');
    
    if (user && userNameEl) {
        userNameEl.textContent = `👤 ${user.name}`;
    }
}

// Back button functionality
window.goBack = function() {
    if (document.referrer && document.referrer.includes('admin')) {
        window.history.back();
    } else {
        window.location.href = '/admin.html';
    }
};

// Show back button for non-main admin pages
function setupBackButton(currentPageId) {
    const backBtn = document.getElementById('backBtn');
    if (backBtn && currentPageId && currentPageId !== 'books') {
        backBtn.style.display = 'block';
    }
}

// Update page title based on current page
function updatePageTitle(currentPageId) {
    const currentPage = adminNavConfig.links.find(link => link.id === currentPageId);
    if (currentPage && currentPage.title) {
        document.title = `${currentPage.title} - Shree Mata Admin`;
        
        // Also update any existing page headers
        const pageHeaders = document.querySelectorAll('h1');
        pageHeaders.forEach(header => {
            if (header.textContent.includes('Admin') || header.textContent.includes('Manage')) {
                header.innerHTML = `${currentPage.icon} ${currentPage.title}`;
            }
        });
    }
}

// Function to detect current page
function detectCurrentPage() {
    const path = window.location.pathname;
    let currentPageId = '';
    
    if (path.includes('admin-bundles')) currentPageId = 'bundles';
    else if (path.includes('admin-orders')) currentPageId = 'orders';
    else if (path.includes('admin-withdrawals')) currentPageId = 'withdrawals';
    else if (path.includes('admin-notifications')) currentPageId = 'notifications';
    else if (path.includes('admin-income')) currentPageId = 'income';
    else if (path.includes('admin-users')) currentPageId = 'users';
    else if (path.includes('admin-password-requests')) currentPageId = 'password-requests';
    else if (path.includes('admin-commission-settings')) currentPageId = 'settings';
    else if (path.includes('admin-receipt-settings')) currentPageId = 'receipt-settings';
    else if (path.includes('admin-referral-tree-visual')) currentPageId = 'tree-visual';
    else if (path.includes('admin-referral-tree')) currentPageId = 'referral-tree';
    else if (path.includes('admin.html') || path === '/admin') currentPageId = 'books';
    
    return currentPageId;
}

// Function to initialize admin navigation
function initializeAdminNavigation() {
    const currentPageId = detectCurrentPage();
    const path = window.location.pathname;
    
    // Only initialize if we're on an admin page
    if (currentPageId || path.includes('admin')) {
        console.log('Initializing admin navigation for page:', currentPageId);
        
        // Initialize navigation
        initAdminNavigation(currentPageId);
        setupBackButton(currentPageId);
        updatePageTitle(currentPageId);
        
        // Setup event listeners after navigation is created
        setupEventListeners();
        
        console.log('Admin navigation initialized successfully');
    }
}

// Auto-initialize on DOM load
document.addEventListener('DOMContentLoaded', initializeAdminNavigation);

// Fallback initialization after a delay
setTimeout(function() {
    if (window.location.pathname.includes('admin')) {
        console.log('Fallback initialization triggered');
        initializeAdminNavigation();
    }
}, 500);

// Also initialize when the page becomes visible (for navigation between admin pages)
document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        setTimeout(initializeAdminNavigation, 100);
    }
});

// Debug function to test menu functionality
window.testAdminMenu = function() {
    console.log('=== Admin Menu Debug ===');
    console.log('Current page:', window.location.pathname);
    
    const menuToggle = document.getElementById('mobileMenuToggle');
    const navLinks = document.getElementById('adminNavLinks');
    const menuIcon = document.getElementById('adminMenuIcon');
    
    console.log('Navigation elements:');
    console.log('- mobileMenuToggle:', !!menuToggle);
    console.log('- adminNavLinks:', !!navLinks);
    console.log('- adminMenuIcon:', !!menuIcon);
    
    if (menuToggle) {
        console.log('- Button onclick:', typeof menuToggle.onclick);
        console.log('- Button style display:', menuToggle.style.display);
        console.log('- Button disabled:', menuToggle.disabled);
    }
    
    if (navLinks) {
        console.log('- Menu classes:', navLinks.className);
        console.log('- Menu is open:', navLinks.classList.contains('mobile-menu-open'));
    }
    
    console.log('=== Testing Menu Toggle ===');
    const result = toggleAdminMobileMenu();
    console.log('Toggle result:', result);
    console.log('=== End Debug ===');
    
    return {
        menuToggle: !!menuToggle,
        navLinks: !!navLinks,
        menuIcon: !!menuIcon,
        toggleResult: result
    };
};

// Emergency manual toggle for testing
window.forceToggleMenu = function() {
    console.log('🚨 FORCE TOGGLE ACTIVATED');
    const navLinks = document.getElementById('adminNavLinks');
    const menuIcon = document.getElementById('adminMenuIcon');
    
    if (!navLinks || !menuIcon) {
        console.error('Elements not found for force toggle');
        return false;
    }
    
    // Completely reset the menu state
    navLinks.className = navLinks.className.replace('mobile-menu-open', '');
    navLinks.style.cssText = '';
    
    // Force add the open class
    navLinks.classList.add('mobile-menu-open');
    menuIcon.textContent = '✕';
    
    console.log('🚨 Force toggle completed - menu should be open');
    return true;
};

// Reset menu to closed state
window.forceCloseMenu = function() {
    console.log('🔒 FORCE CLOSE ACTIVATED');
    const navLinks = document.getElementById('adminNavLinks');
    const menuIcon = document.getElementById('adminMenuIcon');
    
    if (!navLinks || !menuIcon) {
        console.error('Elements not found for force close');
        return false;
    }
    
    navLinks.classList.remove('mobile-menu-open');
    navLinks.style.cssText = '';
    menuIcon.textContent = '☰';
    
    console.log('🔒 Force close completed - menu should be closed');
    return true;
};

// Export for manual initialization
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initAdminNavigation, adminNavConfig };
}