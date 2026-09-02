/**
 * Admin Navigation Component
 * Provides consistent navigation across all admin pages
 */

// Admin navigation configuration
const adminNavConfig = {
    title: "📚 Shree Mata Admin",
    links: [
        { href: "/admin.html", icon: "🏠", text: "Dashboard", id: "admin-dashboard", title: "Admin Dashboard" },
        { href: "/", icon: "🚪", text: "Public Site", id: "public-site", title: "Visit Public Site" },
        { href: "/admin.html", icon: "📚", text: "Books", id: "books", title: "Manage Books" },
        { href: "/admin-bundles.html", icon: "📦", text: "Bundles", id: "bundles", title: "Manage Bundles" },
        { href: "/admin-orders.html", icon: "🛒", text: "Orders", id: "orders", title: "Manage Orders" },
        { href: "/admin-check-payments.html", icon: "📋", text: "Cheque Payments", id: "cheque-payments", title: "Cheque Payment Approvals" },
        { href: "/admin-invoices.html", icon: "🧾", text: "Invoices", id: "invoices", title: "Manage Invoices" },
        { href: "/admin-withdrawals.html", icon: "💰", text: "Withdrawals", id: "withdrawals", title: "Manage Withdrawals" },
        { href: "/admin-bank-requests.html", icon: "🏦", text: "Bank Requests", id: "bank-requests", title: "Bank Change Requests" },
        { href: "/admin-notifications.html", icon: "📢", text: "Notifications", id: "notifications", title: "Manage Notifications" },
        { href: "/admin-home-settings.html", icon: "🏡", text: "Home Settings", id: "home-settings", title: "Home Page Settings" },
        { href: "/admin-income.html", icon: "💵", text: "Income", id: "income", title: "Income Dashboard" },
        { href: "/admin-users.html", icon: "👥", text: "Users", id: "users", title: "User Management" },
        { href: "/admin-mastercards.html", icon: "💳", text: "VIP Master Cards", id: "vip-mastercards", title: "Master Cards Dashboard" },
        { href: "/admin-vip-cards.html", icon: "👑", text: "VIP Cards", id: "vip-cards", title: "VIP Cards Dashboard" },
        { href: "/admin-password-requests.html", icon: "🔐", text: "Password Requests", id: "password-requests", title: "Password Reset Requests" },
        { href: "/admin-referral-tree.html", icon: "🌳", text: "Referral Tree", id: "referral-tree", title: "Referral Tree" },
        { href: "/admin-referral-tree-visual.html", icon: "📊", text: "Tree Visual", id: "tree-visual", title: "Referral Tree Visual" },
        { href: "/admin-razorpay-reports.html", icon: "💳", text: "Razorpay Reports", id: "razorpay-reports", title: "Razorpay Payment Reports" },
        { href: "/admin-reports.html", icon: "📊", text: "Reports & Exports", id: "reports-center", title: "Centralized Reports & Exports" },
        { href: "/admin-salary-dashboard.html", icon: "💼", text: "Salary Dashboard", id: "salary-dashboard", title: "Employee Salary Management" },
        { href: "#", icon: "📄", text: "Daily Report", id: "daily-report", title: "Download Daily Report", onclick: "downloadDailyReport(event)" },
        { href: "/admin-commission-settings.html", icon: "⚙️", text: "Commission", id: "commission-settings", title: "Commission Settings" },
        { href: "/admin-settings.html", icon: "🎛️", text: "Points System", id: "admin-settings", title: "Points & Virtual Tree Settings" },
        { href: "/admin-receipt-settings.html", icon: "🧾", text: "Receipt Settings", id: "receipt-settings", title: "Receipt Settings" },
        { href: "/", icon: "🚪", text: "Logout", id: "logout" }
    ]
};

// Initialize admin navigation
function initAdminNavigation(currentPageId = '') {
    let nav = document.querySelector('nav');
    
    // If no nav element exists, create one
    if (!nav) {
        nav = document.createElement('nav');
        nav.className = 'admin-nav-forced';
        nav.style.cssText = `
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
            background-color: #667eea !important;
            padding: 20px 0 !important;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1) !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            z-index: 100 !important;
            width: 100% !important;
        `;
        
        // Insert at the beginning of body
        document.body.insertBefore(nav, document.body.firstChild);
        
        // Add top margin to body to account for fixed nav
        if (!document.body.style.paddingTop) {
            document.body.style.paddingTop = '90px';
        }
        
        // Hide existing admin headers to avoid duplication
        const existingHeaders = document.querySelectorAll('.header, .admin-header');
        existingHeaders.forEach(header => {
            if (header.querySelector('h1') && header.querySelector('h1').textContent.includes('Admin')) {
                header.style.display = 'none';
            }
        });
    } else {
        // If nav exists, ensure it has the correct styling
        nav.className = 'admin-nav-forced';
        nav.style.cssText = `
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
            background-color: #667eea !important;
            padding: 20px 0 !important;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1) !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            z-index: 100 !important;
            width: 100% !important;
        `;
        console.log('Nav element already exists, updating content and styling');
    }

    // Create navigation HTML
    const navHTML = createAdminNavHTML(currentPageId);
    nav.innerHTML = navHTML;

    // Move popup overlay to document.body so it is never affected by page-level nav styles
    const popupOverlay = document.getElementById('adminPopupOverlay');
    if (popupOverlay && popupOverlay.parentElement !== document.body) {
        document.body.appendChild(popupOverlay);
    }

    // Force apply the gradient background immediately after creation
    setTimeout(() => {
        const navElement = document.querySelector('nav');
        if (navElement) {
            navElement.style.setProperty('background', 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 'important');
            navElement.style.setProperty('background-color', '#667eea', 'important');
        }
    }, 50);

    // Setup mobile menu functionality
    setupMobileMenu();

    // Setup logout functionality
    setupLogout();

    // Load user info
    loadAdminUserInfo();
}

// Create navigation HTML with popup modal
function createAdminNavHTML(currentPageId) {
    const linksHTML = adminNavConfig.links.map(link => {
        const isActive = link.id === currentPageId || 
                        (currentPageId === '' && link.href === '/admin.html') ||
                        (link.href && link.href !== '/' && link.href !== '#' && window.location.pathname.includes(link.href.replace('/', '')));
        
        const activeClass = isActive ? 'active' : '';
        const logoutId = link.id === 'logout' ? 'id="logoutBtn"' : (link.id ? `id="${link.id}NavBtn"` : '');
        const clickAttr = link.onclick ? `onclick="${link.onclick}; return false;"` : '';
        const href = link.href || '#';
        
        return `<a href="${href}" class="${activeClass}" ${logoutId} ${clickAttr} title="${link.title || link.text}">
                    <span class="icon">${link.icon}</span> ${link.text}
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
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span id="userName" style="color: white; font-size: 14px; font-weight: 500;"></span>
                    <button id="popupMenuBtn" class="popup-menu-btn" onclick="openAdminPopupMenu()">
                        <span>☰</span>
                        <span>Menu</span>
                    </button>
                </div>
            </div>
        </div>
        
        <!-- Popup Menu Modal -->
        <div class="popup-overlay" id="adminPopupOverlay" onclick="closeAdminPopupMenu(event)">
            <div class="popup-modal" onclick="event.stopPropagation()">
                <div class="popup-header">
                    <h2>Admin Panel</h2>
                    <span id="popupUserName">Hello, Admin</span>
                    <button class="popup-close" onclick="closeAdminPopupMenu()">×</button>
                </div>
                
                <div class="popup-content">
                    <div class="popup-menu-links">
                        <div class="popup-menu-group">
                            <div class="popup-group-title">Main</div>
                            <a href="/admin.html" class="${currentPageId === 'admin-dashboard' ? 'active' : ''}"><span class="icon">🏠</span> Dashboard</a>
                            <a href="/"><span class="icon">🚪</span> Public Site</a>
                        </div>
                        
                        <div class="popup-menu-group">
                            <div class="popup-group-title">Content Management</div>
                            <a href="/admin.html" class="${currentPageId === 'books' ? 'active' : ''}"><span class="icon">📚</span> Manage Books</a>
                            <a href="/admin-bundles.html" class="${currentPageId === 'bundles' ? 'active' : ''}"><span class="icon">📦</span> Manage Bundles</a>
                        </div>
                        
                        <div class="popup-menu-group">
                            <div class="popup-group-title">Orders & Payments</div>
                            <a href="/admin-orders.html" class="${currentPageId === 'orders' ? 'active' : ''}"><span class="icon">🛒</span> Orders</a>
                            <a href="/admin-check-payments.html" class="${currentPageId === 'cheque-payments' ? 'active' : ''}"><span class="icon">📋</span> Cheque Payment Approvals</a>
                            <a href="/admin-invoices.html" class="${currentPageId === 'invoices' ? 'active' : ''}"><span class="icon">🧾</span> Invoices</a>
                            <a href="/admin-withdrawals.html" class="${currentPageId === 'withdrawals' ? 'active' : ''}"><span class="icon">💰</span> Withdrawals</a>
                            <a href="/admin-bank-requests.html" class="${currentPageId === 'bank-requests' ? 'active' : ''}"><span class="icon">🏦</span> Bank Requests</a>
                        </div>
                        
                        <div class="popup-menu-group">
                            <div class="popup-group-title">Communications</div>
                            <a href="/admin-notifications.html" class="${currentPageId === 'notifications' ? 'active' : ''}"><span class="icon">📢</span> Notifications</a>
                        </div>
                        
                        <div class="popup-menu-group">
                            <div class="popup-group-title">Reports & Analytics</div>
                            <a href="/admin-income.html" class="${currentPageId === 'income' ? 'active' : ''}"><span class="icon">💵</span> Income Reports</a>
                            <a href="/admin-users.html" class="${currentPageId === 'users' ? 'active' : ''}"><span class="icon">👥</span> Manage Users</a>
                            <a href="/admin-mastercards.html" class="${currentPageId === 'vip-mastercards' ? 'active' : ''}"><span class="icon">💳</span> VIP Master Cards</a>
                            <a href="/admin-password-requests.html" class="${currentPageId === 'password-requests' ? 'active' : ''}"><span class="icon">🔐</span> Password Requests</a>
                            <a href="/admin-referral-tree.html" class="${currentPageId === 'referral-tree' ? 'active' : ''}"><span class="icon">🌳</span> Referral Tree</a>
                            <a href="/admin-referral-tree-visual.html" class="${currentPageId === 'tree-visual' ? 'active' : ''}"><span class="icon">📊</span> Tree Visual</a>
                            <a href="/admin-razorpay-reports.html" class="${currentPageId === 'razorpay-reports' ? 'active' : ''}"><span class="icon">💳</span> Razorpay Reports</a>
                            <a href="/admin-reports.html" class="${currentPageId === 'reports-center' ? 'active' : ''}"><span class="icon">📊</span> Reports Center</a>
                            <a href="/admin-salary-dashboard.html" class="${currentPageId === 'salary-dashboard' ? 'active' : ''}"><span class="icon">💼</span> Salary Dashboard</a>
                            <button onclick="downloadDailyReport(event)" class="daily-report-btn"><span class="icon">📄</span> Download Daily Report</button>
                        </div>
                        
                        <div class="popup-menu-group">
                            <div class="popup-group-title">Settings</div>
                            <a href="/admin-home-settings.html" class="${currentPageId === 'home-settings' ? 'active' : ''}"><span class="icon">🏡</span> Home Page Settings</a>
                            <a href="/admin-commission-settings.html" class="${currentPageId === 'commission-settings' ? 'active' : ''}"><span class="icon">⚙️</span> Commission Settings</a>
                            <a href="/admin-settings.html" class="${currentPageId === 'admin-settings' ? 'active' : ''}"><span class="icon">🎛️</span> Points System</a>
                            <a href="/admin-receipt-settings.html" class="${currentPageId === 'receipt-settings' ? 'active' : ''}"><span class="icon">🧾</span> Receipt Settings</a>
                        </div>
                        
                        <div class="popup-menu-group">
                            <div class="popup-group-title">Account</div>
                            <a href="/" id="popupLogoutBtn"><span class="icon">🚪</span> Logout</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Setup mobile menu functionality
function setupMobileMenu() {
    // Add popup modal styles if not already present
    if (!document.getElementById('adminNavStyles')) {
        const style = document.createElement('style');
        style.id = 'adminNavStyles';
        style.textContent = `
            /* Force consistent navigation styling across all admin pages - Maximum specificity */
            body nav, 
            body nav[style], 
            html body nav,
            nav.admin-nav,
            nav#adminNav,
            .admin-nav,
            nav {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
                background-color: #667eea !important;
                padding: 20px 0 !important;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1) !important;
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                z-index: 100 !important;
                width: 100% !important;
                height: auto !important;
                border: none !important;
                border-radius: 0 !important;
            }
            
            /* Additional forced styling with class selector */
            .admin-nav-forced,
            nav.admin-nav-forced {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
                background-color: #667eea !important;
            }
            
            body nav .container,
            nav .container {
                max-width: 1200px !important;
                margin: 0 auto !important;
                padding: 0 20px !important;
                background: transparent !important;
                box-shadow: none !important;
            }
            
            body nav h1,
            nav h1 {
                color: white !important;
                margin: 0 !important;
                font-size: 24px !important;
                background: transparent !important;
            }

            /* Popup Menu Button */
            .popup-menu-btn,
            body nav .popup-menu-btn {
                background: rgba(255,255,255,0.2) !important;
                color: #ffffff !important;
                border: 1px solid rgba(255, 255, 255, 0.3) !important;
                padding: 10px 18px !important;
                border-radius: 8px !important;
                cursor: pointer !important;
                font-size: 14px !important;
                font-weight: 600 !important;
                transition: all 0.2s ease !important;
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                font-family: inherit !important;
                line-height: 1.4 !important;
                text-decoration: none !important;
            }
            
            .popup-menu-btn:hover,
            body nav .popup-menu-btn:hover {
                background: rgba(255,255,255,0.3) !important;
                transform: translateY(-1px) !important;
                color: #ffffff !important;
            }
            
            /* Popup Modal Overlay */
            .popup-overlay,
            #adminPopupOverlay {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                background: rgba(15, 23, 42, 0.65) !important;
                backdrop-filter: blur(4px) !important;
                -webkit-backdrop-filter: blur(4px) !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                opacity: 0 !important;
                visibility: hidden !important;
                transition: opacity 0.25s ease, visibility 0.25s ease !important;
                z-index: 999999 !important;
                padding: 20px !important;
                box-sizing: border-box !important;
                margin: 0 !important;
            }
            
            .popup-overlay.active,
            #adminPopupOverlay.active {
                opacity: 1 !important;
                visibility: visible !important;
            }
            
            /* Popup Modal */
            .popup-modal,
            .popup-overlay .popup-modal,
            #adminPopupOverlay .popup-modal {
                background: #ffffff !important;
                border-radius: 16px !important;
                box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.08) !important;
                max-width: 520px !important;
                width: 100% !important;
                max-height: 85vh !important;
                display: flex !important;
                flex-direction: column !important;
                overflow: hidden !important;
                transform: scale(0.92) translateY(16px) !important;
                transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
                box-sizing: border-box !important;
                margin: 0 auto !important;
                padding: 0 !important;
                border: none !important;
            }
            
            .popup-overlay.active .popup-modal,
            #adminPopupOverlay.active .popup-modal {
                transform: scale(1) translateY(0) !important;
            }
            
            /* Popup Header */
            .popup-header,
            .popup-modal .popup-header,
            #adminPopupOverlay .popup-header {
                background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%) !important;
                color: #ffffff !important;
                padding: 22px 26px !important;
                border-radius: 16px 16px 0 0 !important;
                text-align: center !important;
                position: relative !important;
                flex-shrink: 0 !important;
                display: block !important;
                width: 100% !important;
                box-sizing: border-box !important;
                margin: 0 !important;
            }
            
            .popup-header h2,
            .popup-modal .popup-header h2 {
                margin: 0 0 4px 0 !important;
                font-size: 19px !important;
                font-weight: 700 !important;
                color: #ffffff !important;
                letter-spacing: -0.3px !important;
            }
            
            .popup-header span,
            .popup-modal .popup-header span,
            #popupUserName {
                font-size: 13.5px !important;
                color: #94a3b8 !important;
                display: block !important;
                font-weight: 500 !important;
            }
            
            .popup-close,
            .popup-modal .popup-close {
                position: absolute !important;
                top: 18px !important;
                right: 18px !important;
                background: rgba(255, 255, 255, 0.12) !important;
                color: #ffffff !important;
                border: none !important;
                width: 34px !important;
                height: 34px !important;
                border-radius: 50% !important;
                cursor: pointer !important;
                font-size: 20px !important;
                line-height: 1 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 0 !important;
                transition: all 0.2s ease !important;
            }
            
            .popup-close:hover,
            .popup-modal .popup-close:hover {
                background: rgba(255, 255, 255, 0.25) !important;
                transform: rotate(90deg) !important;
            }
            
            /* Popup Content Container (Vertical Scrolling) */
            .popup-content,
            .popup-modal .popup-content,
            #adminPopupOverlay .popup-content {
                padding: 0 !important;
                overflow-y: auto !important;
                overflow-x: hidden !important;
                flex: 1 1 auto !important;
                max-height: calc(85vh - 85px) !important;
                display: block !important;
                width: 100% !important;
                box-sizing: border-box !important;
                background: #ffffff !important;
            }
            
            /* Popup Menu Links wrapper */
            .popup-menu-links,
            .popup-modal .popup-menu-links,
            #adminPopupOverlay .popup-menu-links {
                display: flex !important;
                flex-direction: column !important;
                width: 100% !important;
                padding: 0 !important;
                margin: 0 !important;
                box-sizing: border-box !important;
            }
            
            /* Menu Group */
            .popup-menu-group,
            .popup-modal .popup-menu-group,
            #adminPopupOverlay .popup-menu-group {
                display: flex !important;
                flex-direction: column !important;
                width: 100% !important;
                border-bottom: 1px solid #f1f5f9 !important;
                padding: 0 !important;
                margin: 0 !important;
                box-sizing: border-box !important;
                background: #ffffff !important;
            }
            
            .popup-menu-group:last-child,
            .popup-modal .popup-menu-group:last-child {
                border-bottom: none !important;
            }
            
            /* Group Title */
            .popup-group-title,
            .popup-modal .popup-group-title,
            #adminPopupOverlay .popup-group-title {
                padding: 14px 24px 6px !important;
                font-size: 11px !important;
                font-weight: 800 !important;
                color: #64748b !important;
                text-transform: uppercase !important;
                letter-spacing: 0.6px !important;
                background: #f8fafc !important;
                display: block !important;
                width: 100% !important;
                box-sizing: border-box !important;
                border-bottom: 1px solid #f1f5f9 !important;
            }
            
            .popup-menu-group:first-child .popup-group-title {
                padding-top: 16px !important;
            }
            
            /* Links inside popup */
            .popup-menu-links a,
            .popup-modal a,
            #adminPopupOverlay .popup-menu-links a,
            body nav .popup-menu-links a,
            nav .popup-menu-links a {
                display: flex !important;
                align-items: center !important;
                padding: 12px 24px !important;
                color: #1e293b !important;
                text-decoration: none !important;
                font-size: 14px !important;
                font-weight: 500 !important;
                transition: all 0.15s ease !important;
                border-left: 4px solid transparent !important;
                border-top: none !important;
                border-right: none !important;
                border-bottom: none !important;
                background: #ffffff !important;
                border-radius: 0 !important;
                width: 100% !important;
                box-sizing: border-box !important;
                text-align: left !important;
                line-height: 1.5 !important;
            }
            
            .popup-menu-links a:hover,
            .popup-modal a:hover,
            #adminPopupOverlay .popup-menu-links a:hover,
            body nav .popup-menu-links a:hover,
            nav .popup-menu-links a:hover {
                background: #f8fafc !important;
                border-left-color: #F68048 !important;
                color: #0f172a !important;
                transform: none !important;
            }
            
            .popup-menu-links a.active,
            .popup-modal a.active,
            #adminPopupOverlay .popup-menu-links a.active,
            body nav .popup-menu-links a.active,
            nav .popup-menu-links a.active {
                background: #fff7ed !important;
                color: #c2410c !important;
                border-left-color: #F68048 !important;
                font-weight: 700 !important;
            }
            
            .popup-menu-links a .icon,
            .popup-modal a .icon,
            #adminPopupOverlay .popup-menu-links a .icon {
                margin-right: 14px !important;
                font-size: 17px !important;
                width: 22px !important;
                text-align: center !important;
                flex-shrink: 0 !important;
                display: inline-block !important;
            }
            
            /* Daily Report Button in popup */
            .daily-report-btn,
            .popup-modal .daily-report-btn,
            #adminPopupOverlay .daily-report-btn {
                display: flex !important;
                align-items: center !important;
                padding: 12px 24px !important;
                color: #1e293b !important;
                text-decoration: none !important;
                font-size: 14px !important;
                font-weight: 500 !important;
                transition: all 0.15s ease !important;
                border-left: 4px solid transparent !important;
                border-top: none !important;
                border-right: none !important;
                border-bottom: none !important;
                background: #ffffff !important;
                border-radius: 0 !important;
                width: 100% !important;
                text-align: left !important;
                cursor: pointer !important;
                box-sizing: border-box !important;
                font-family: inherit !important;
                line-height: 1.5 !important;
            }
            
            .daily-report-btn:hover,
            .popup-modal .daily-report-btn:hover,
            #adminPopupOverlay .daily-report-btn:hover {
                background: #ecfdf5 !important;
                color: #065f46 !important;
                border-left-color: #10b981 !important;
                transform: none !important;
            }
            
            .daily-report-btn .icon,
            .popup-modal .daily-report-btn .icon,
            #adminPopupOverlay .daily-report-btn .icon {
                margin-right: 14px !important;
                font-size: 17px !important;
                width: 22px !important;
                text-align: center !important;
                flex-shrink: 0 !important;
                display: inline-block !important;
            }
            
            /* Mobile Responsive */
            @media (max-width: 768px) {
                .popup-overlay,
                #adminPopupOverlay {
                    padding: 12px !important;
                }

                .popup-modal,
                .popup-overlay .popup-modal,
                #adminPopupOverlay .popup-modal {
                    max-width: 100% !important;
                    width: 100% !important;
                    max-height: 90vh !important;
                    border-radius: 14px !important;
                }
                
                .popup-header,
                .popup-modal .popup-header,
                #adminPopupOverlay .popup-header {
                    padding: 18px 20px !important;
                }
                
                .popup-header h2 {
                    font-size: 17px !important;
                }
                
                .popup-menu-links a,
                .daily-report-btn {
                    padding: 11px 18px !important;
                    font-size: 13.5px !important;
                }
                
                .popup-group-title,
                #adminPopupOverlay .popup-group-title {
                    padding: 12px 18px 5px !important;
                }
                
                .popup-menu-btn {
                    padding: 8px 14px !important;
                    font-size: 13px !important;
                }
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
        `;
        document.head.appendChild(style);
    }

    // Setup popup menu event listeners
    setupPopupMenuListeners();
}

// Setup popup menu event listeners
function setupPopupMenuListeners() {
    // Wait for DOM to be fully ready
    const setupListeners = () => {
        const menuBtn = document.getElementById('popupMenuBtn');
        const backBtn = document.getElementById('backBtn');
        
        if (menuBtn && !menuBtn.hasAttribute('data-listener-attached')) {
            console.log('🔧 Setting up popup menu listeners');
            
            // Mark as having listener to avoid duplicates
            menuBtn.setAttribute('data-listener-attached', 'true');
            
            // Use a single click event listener
            menuBtn.addEventListener('click', function(e) {
                console.log('📱 Popup menu clicked');
                e.preventDefault();
                e.stopPropagation();
                openAdminPopupMenu();
            });
            
            console.log('✅ Popup menu button listener attached');
        } else if (!menuBtn) {
            console.log('⚠️ Popup menu button not found yet');
        }
        
        if (backBtn && !backBtn.hasAttribute('data-listener-attached')) {
            backBtn.setAttribute('data-listener-attached', 'true');
            backBtn.addEventListener('click', function(e) {
                e.preventDefault();
                goBack();
            });
        }
    };
    
    // Try multiple times with increasing delays
    const attempts = [50, 200, 500, 1000];
    attempts.forEach(delay => {
        setTimeout(setupListeners, delay);
    });
}

function setupEventListeners() {
    // Setup popup menu listeners
    setupPopupMenuListeners();
    
    // Handle click outside to close menu - only set once
    if (!document.documentElement.hasAttribute('data-outside-click-setup')) {
        document.documentElement.setAttribute('data-outside-click-setup', 'true');
        
        document.addEventListener('click', function(e) {
            const popup = document.getElementById('adminPopupOverlay');
            const menuBtn = document.getElementById('popupMenuBtn');
            
            if (popup && menuBtn && 
                popup.classList.contains('active') &&
                !popup.contains(e.target) && 
                !menuBtn.contains(e.target)) {
                
                console.log('🔒 Closing popup due to outside click');
                closeAdminPopupMenu();
            }
        });
    }
}

// Global popup menu functions
window.openAdminPopupMenu = function() {
    console.log('🔓 Opening admin popup menu');
    const popup = document.getElementById('adminPopupOverlay');
    if (popup) {
        popup.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Load user info into popup
        const user = JSON.parse(localStorage.getItem('user') || 'null');
        const userName = localStorage.getItem('userName') || (user ? user.name : 'Admin');
        const popupUserName = document.getElementById('popupUserName');
        if (popupUserName) {
            popupUserName.textContent = `Hello, ${userName}`;
        }
        
        // Setup popup logout button
        const popupLogoutBtn = document.getElementById('popupLogoutBtn');
        if (popupLogoutBtn && !popupLogoutBtn.hasAttribute('data-listener-attached')) {
            popupLogoutBtn.setAttribute('data-listener-attached', 'true');
            popupLogoutBtn.addEventListener('click', function(e) {
                e.preventDefault();
                if (confirm('Are you sure you want to logout?')) {
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    localStorage.removeItem('userName');
                    localStorage.removeItem('userRole');
                    window.location.href = '/';
                }
            });
        }
        
        // Setup close on link click
        const popupLinks = document.querySelectorAll('.popup-menu-links a');
        popupLinks.forEach(link => {
            if (!link.hasAttribute('data-close-listener')) {
                link.setAttribute('data-close-listener', 'true');
                link.addEventListener('click', function() {
                    if (!this.id || this.id !== 'popupLogoutBtn') {
                        closeAdminPopupMenu();
                    }
                });
            }
        });
    } else {
        console.error('❌ Popup overlay not found');
    }
};

window.closeAdminPopupMenu = function(event) {
    // Only close if clicking on overlay, not on modal content
    if (event && event.target !== document.getElementById('adminPopupOverlay')) {
        return;
    }
    
    console.log('🔒 Closing admin popup menu');
    const popup = document.getElementById('adminPopupOverlay');
    if (popup) {
        popup.classList.remove('active');
        document.body.style.overflow = '';
    }
};

// Close popup on escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const popup = document.getElementById('adminPopupOverlay');
        if (popup && popup.classList.contains('active')) {
            closeAdminPopupMenu();
        }
    }
});

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
    const userName = localStorage.getItem('userName') || (user ? user.name : 'Admin');
    const userNameEl = document.getElementById('userName');
    
    if (userNameEl) {
        userNameEl.textContent = `👤 ${userName}`;
    }
    
    // Also update popup user name if it exists
    const popupUserName = document.getElementById('popupUserName');
    if (popupUserName) {
        popupUserName.textContent = `Hello, ${userName}`;
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
    else if (path.includes('admin-check-payments')) currentPageId = 'cheque-payments';
    else if (path.includes('admin-invoices')) currentPageId = 'invoices';
    else if (path.includes('admin-orders')) currentPageId = 'orders';
    else if (path.includes('admin-withdrawals')) currentPageId = 'withdrawals';
    else if (path.includes('admin-bank-requests')) currentPageId = 'bank-requests';
    else if (path.includes('admin-notifications')) currentPageId = 'notifications';
    else if (path.includes('admin-home-settings')) currentPageId = 'home-settings';
    else if (path.includes('admin-income')) currentPageId = 'income';
    else if (path.includes('admin-users')) currentPageId = 'users';
    else if (path.includes('admin-password-requests')) currentPageId = 'password-requests';
    else if (path.includes('admin-commission-settings')) currentPageId = 'commission-settings';
    else if (path.includes('admin-settings')) currentPageId = 'admin-settings';
    else if (path.includes('admin-receipt-settings')) currentPageId = 'receipt-settings';
    else if (path.includes('admin-referral-tree-visual')) currentPageId = 'tree-visual';
    else if (path.includes('admin-referral-tree')) currentPageId = 'referral-tree';
    else if (path.includes('admin-razorpay-reports')) currentPageId = 'razorpay-reports';
    else if (path.includes('admin-reports')) currentPageId = 'reports-center';
    else if (path.includes('admin-salary-dashboard')) currentPageId = 'salary-dashboard';
    else if (path.includes('admin.html') || path === '/admin') currentPageId = 'books';
    
    return currentPageId;
}

// Function to initialize admin navigation
function initializeAdminNavigation() {
    // Prevent multiple initializations
    if (document.body.hasAttribute('data-admin-nav-initialized')) {
        console.log('Admin navigation already initialized, skipping...');
        return;
    }
    
    const currentPageId = detectCurrentPage();
    const path = window.location.pathname;
    
    // Only initialize if we're on an admin page
    if (currentPageId || path.includes('admin')) {
        console.log('Initializing admin navigation for page:', currentPageId);
        
        // Mark as initialized
        document.body.setAttribute('data-admin-nav-initialized', 'true');
        
        // Initialize navigation
        initAdminNavigation(currentPageId);
        setupBackButton(currentPageId);
        updatePageTitle(currentPageId);
        
        // Setup event listeners after navigation is created
        setTimeout(() => {
            setupEventListeners();
        }, 100);
        
        console.log('Admin navigation initialized successfully');
    }
}

// Auto-initialize on DOM load - only once
if (!window.adminNavInitialized) {
    window.adminNavInitialized = true;
    
    // Try immediate initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeAdminNavigation);
    } else {
        // DOM is already loaded
        initializeAdminNavigation();
    }
    
    // Fallback initialization after a delay - only if not already initialized
    setTimeout(function() {
        if (window.location.pathname.includes('admin') && !document.body.hasAttribute('data-admin-nav-initialized')) {
            console.log('Fallback initialization triggered');
            initializeAdminNavigation();
        }
    }, 1000);
}

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

// Daily Report Download Function
window.downloadDailyReport = async function(event) {
    let targetElement = null;
    let originalText = '';
    
    // Close the popup menu immediately when clicked
    if (typeof closeAdminPopupMenu === 'function') {
        closeAdminPopupMenu();
    }
    
    try {
        console.log('📄 Starting daily report download...');
        
        // Show date selection popup
        const selectedDate = await showDateSelectionPopup();
        if (!selectedDate) {
            return; // User cancelled
        }
        
        // Show loading indicator
        if (event && event.target) {
            targetElement = event.target;
            originalText = targetElement.innerHTML;
            targetElement.innerHTML = '<span class="icon">⏳</span> Generating Report...';
            targetElement.disabled = true;
        }
        
        const token = localStorage.getItem('token');
        if (!token) {
            alert('❌ Authentication required. Please login again.');
            return;
        }
        
        const apiUrl = window.location.hostname === 'localhost' 
            ? `http://localhost:3000/api/admin/daily-report?date=${selectedDate}`
            : `${window.API_URL}/admin/daily-report?date=${selectedDate}`;
        
        // Make API call to generate daily report
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        // Get the PDF blob
        const blob = await response.blob();
        
        // Verify it's a PDF blob
        if (!blob.type.includes('pdf') && blob.size > 0) {
            throw new Error('Server returned invalid file format. Please try again.');
        }
        
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Generate filename with selected date
        const dateStr = selectedDate === 'today' ? new Date().toISOString().split('T')[0] : selectedDate;
        a.download = `Business_Report_${dateStr}.pdf`;
        
        // Trigger download
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // Clean up after a delay to ensure download starts
        setTimeout(() => {
            window.URL.revokeObjectURL(url);
        }, 1000);
        
        console.log('✅ Daily report downloaded successfully');
        
    } catch (error) {
        console.error('❌ Error downloading daily report:', error);
        alert(`❌ Error generating daily report: ${error.message}`);
    } finally {
        // Restore button
        if (targetElement) {
            targetElement.innerHTML = originalText;
            targetElement.disabled = false;
        }
    }
};

// Date Selection Popup Function
function showDateSelectionPopup() {
    return new Promise((resolve) => {
        // Create popup overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 3000;
            padding: 20px;
        `;
        
        // Create popup modal
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 400px;
            width: 100%;
            padding: 0;
            transform: scale(0.8);
            transition: all 0.3s ease;
        `;
        
        modal.innerHTML = `
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 16px 16px 0 0; text-align: center;">
                <h2 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 600;">📊 Select Report Date</h2>
                <p style="margin: 0; font-size: 14px; opacity: 0.9;">Choose the date for your business report</p>
            </div>
            
            <div style="padding: 30px;">
                <div style="margin-bottom: 20px;">
                    <button id="todayBtn" style="
                        width: 100%;
                        padding: 15px;
                        margin-bottom: 15px;
                        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                        color: white;
                        border: none;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 10px;
                    ">
                        📅 Today's Report
                    </button>
                    
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333;">
                            📆 Select Custom Date:
                        </label>
                        <input type="date" id="customDate" style="
                            width: 100%;
                            padding: 12px;
                            border: 2px solid #e0e0e0;
                            border-radius: 8px;
                            font-size: 14px;
                            box-sizing: border-box;
                        ">
                    </div>
                    
                    <button id="customBtn" style="
                        width: 100%;
                        padding: 15px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        border: none;
                        border-radius: 8px;
                        font-size: 16px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 10px;
                    ">
                        📋 Generate Custom Report
                    </button>
                </div>
                
                <div style="display: flex; justify-content: center;">
                    <button id="cancelBtn" style="
                        padding: 10px 20px;
                        background: #6c757d;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                    ">
                        Cancel
                    </button>
                </div>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Animate in
        setTimeout(() => {
            modal.style.transform = 'scale(1)';
        }, 10);
        
        // Set default date to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('customDate').value = today;
        
        // Event listeners
        document.getElementById('todayBtn').addEventListener('click', () => {
            cleanup();
            resolve('today');
        });
        
        document.getElementById('customBtn').addEventListener('click', () => {
            const selectedDate = document.getElementById('customDate').value;
            if (!selectedDate) {
                alert('Please select a date');
                return;
            }
            cleanup();
            resolve(selectedDate);
        });
        
        document.getElementById('cancelBtn').addEventListener('click', () => {
            cleanup();
            resolve(null);
        });
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                cleanup();
                resolve(null);
            }
        });
        
        // Close on escape key
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                cleanup();
                resolve(null);
            }
        };
        document.addEventListener('keydown', escapeHandler);
        
        function cleanup() {
            document.removeEventListener('keydown', escapeHandler);
            document.body.removeChild(overlay);
        }
    });
}