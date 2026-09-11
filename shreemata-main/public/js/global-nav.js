/**
 * SHREE MATA — GLOBAL NAVIGATION & ACCOUNT DROPDOWN CONTROLLER
 * Master controller for Header Auth State, Account Dropdown, Mobile Drawer, Cart & Search
 */

(function () {
    // Singleton initialization guard
    if (window.__SM_GLOBAL_NAV_CONTROLLER) {
        return;
    }
    window.__SM_GLOBAL_NAV_CONTROLLER = true;

    // ── 1. GLOBAL CART COUNT ──
    function updateGlobalCartCount() {
        try {
            let cart = [];
            if (typeof getCart === 'function') {
                cart = getCart();
            } else {
                const raw = localStorage.getItem("cart");
                cart = raw ? JSON.parse(raw) : [];
            }
            
            const countEl = document.getElementById("cartCount");
            if (countEl) {
                const totalItems = Array.isArray(cart) 
                    ? cart.reduce((sum, item) => sum + (item.quantity || 1), 0)
                    : 0;
                countEl.textContent = totalItems;
            }
        } catch (err) {
            console.error("Error updating cart count:", err);
        }
    }
    window.updateGlobalCartCount = updateGlobalCartCount;

    // ── 2. GLOBAL AUTH & ACCOUNT DROPDOWN STATE ──
    function updateGlobalNavbarAuth() {
        try {
            const token = localStorage.getItem("token");
            const userStr = localStorage.getItem("user");
            const user = userStr ? JSON.parse(userStr) : null;

            const authLinks = document.getElementById("authLinks");
            const userLinks = document.getElementById("userLinks");
            const userName = document.getElementById("userName");
            const dropdownUserName = document.getElementById("dropdownUserName");
            const accountLink = document.getElementById("accountLink");
            const ordersLink = document.getElementById("ordersLink");
            const referralLink = document.getElementById("referralLink");
            const adminLink = document.getElementById("adminLink");
            const cartLink = document.getElementById("cartLink");

            // Mobile drawer elements
            const drawerGuestAuth = document.getElementById("drawerGuestAuth");
            const drawerUserAuth = document.getElementById("drawerUserAuth");
            const drawerUserName = document.getElementById("drawerUserName");
            const drawerAdminLink = document.getElementById("drawerAdminLink");

            if (token && user) {
                // Desktop Header Auth
                if (authLinks) authLinks.style.display = "none";
                if (userLinks) userLinks.style.display = "inline-flex";
                
                const displayName = user.name || "Account";
                if (userName) userName.textContent = displayName;
                if (dropdownUserName) dropdownUserName.textContent = displayName;

                if (accountLink) accountLink.style.display = "flex";
                if (ordersLink) ordersLink.style.display = "flex";
                if (referralLink) referralLink.style.display = "flex";
                
                // Role-Aware Admin Link (Authorized Roles Only)
                const isAdmin = user.role === "admin";
                if (adminLink) {
                    adminLink.style.display = isAdmin ? "flex" : "none";
                }
                
                if (cartLink) cartLink.style.display = "inline-flex";

                // Mobile Drawer Auth
                if (drawerGuestAuth) drawerGuestAuth.style.display = "none";
                if (drawerUserAuth) drawerUserAuth.style.display = "block";
                if (drawerUserName) drawerUserName.textContent = displayName;
                if (drawerAdminLink) drawerAdminLink.style.display = isAdmin ? "flex" : "none";

            } else {
                // Desktop Header Guest
                if (authLinks) authLinks.style.display = "flex";
                if (userLinks) {
                    userLinks.style.display = "none";
                    userLinks.classList.remove("open");
                }
                if (accountLink) accountLink.style.display = "none";
                if (ordersLink) ordersLink.style.display = "none";
                if (referralLink) referralLink.style.display = "none";
                if (adminLink) adminLink.style.display = "none";

                // Mobile Drawer Guest
                if (drawerGuestAuth) drawerGuestAuth.style.display = "block";
                if (drawerUserAuth) drawerUserAuth.style.display = "none";
            }
        } catch (err) {
            console.error("Error updating navbar auth:", err);
        }
    }
    window.updateGlobalNavbarAuth = updateGlobalNavbarAuth;

    // ── 3. ACCOUNT DROPDOWN INTERACTION CONTROLLER ──
    function initAccountDropdown() {
        const userNavWrap = document.getElementById("userLinks") || document.querySelector(".user-nav-wrap, .user-menu-wrap");
        const userMenuBtn = document.querySelector("#userMenuBtn, .user-menu-trigger, .user-name-badge");
        const dropdownMenu = document.querySelector("#userDropdownMenu, .user-dropdown-menu, .dropdown-content");

        if (!userMenuBtn) return;

        function toggleDropdown(e) {
            if (e) {
                e.stopPropagation();
                e.preventDefault();
            }
            const isOpen = userNavWrap 
                ? userNavWrap.classList.contains("open") 
                : (dropdownMenu && !dropdownMenu.classList.contains("hidden") && dropdownMenu.style.display !== "none");

            if (isOpen) {
                closeDropdown();
            } else {
                openDropdown();
            }
        }

        function openDropdown() {
            if (userNavWrap) userNavWrap.classList.add("open");
            if (dropdownMenu) {
                dropdownMenu.classList.remove("hidden");
            }
            userMenuBtn.setAttribute("aria-expanded", "true");
        }

        function closeDropdown() {
            if (userNavWrap) userNavWrap.classList.remove("open");
            if (dropdownMenu) {
                dropdownMenu.classList.add("hidden");
            }
            userMenuBtn.setAttribute("aria-expanded", "false");
        }

        // Trigger click listener
        userMenuBtn.addEventListener("click", toggleDropdown);

        // Click outside listener
        document.addEventListener("click", (e) => {
            const isClickInside = (userNavWrap && userNavWrap.contains(e.target)) || 
                                  userMenuBtn.contains(e.target) || 
                                  (dropdownMenu && dropdownMenu.contains(e.target));
            if (!isClickInside) {
                closeDropdown();
            }
        });

        // Keyboard listener (Escape to close and return focus)
        document.addEventListener("keydown", (e) => {
            const isOpen = userNavWrap ? userNavWrap.classList.contains("open") : (dropdownMenu && !dropdownMenu.classList.contains("hidden"));
            if (e.key === "Escape" && isOpen) {
                closeDropdown();
                userMenuBtn.focus();
            }
        });

        // Close when clicking any menu item inside dropdown
        if (dropdownMenu) {
            dropdownMenu.querySelectorAll("a, button").forEach(item => {
                item.addEventListener("click", () => {
                    closeDropdown();
                });
            });
        }
    }

    // ── 4. GLOBAL LOGOUT HANDLER ──
    function handleGlobalLogout(e) {
        if (e) e.preventDefault();
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/login.html";
    }
    window.handleGlobalLogout = handleGlobalLogout;

    // ── 5. GLOBAL SEARCH CONTROLLER ──
    function handleGlobalSearch() {
        const searchInput = document.getElementById("searchInput");
        if (!searchInput) return;

        const term = searchInput.value.trim();
        const isHomePage = window.location.pathname === "/" || window.location.pathname.endsWith("index.html");

        if (isHomePage && typeof performSearch === "function") {
            performSearch();
        } else if (term) {
            window.location.href = "/?search=" + encodeURIComponent(term);
        } else {
            window.location.href = "/";
        }
    }

    // ── 6. MOBILE DRAWER NAVIGATION ──
    function ensureMobileDrawerDOM() {
        let drawer = document.getElementById("mobileNavDrawer");
        if (!drawer) {
            drawer = document.createElement("div");
            drawer.id = "mobileNavDrawer";
            drawer.className = "mobile-nav-drawer";
            drawer.setAttribute("aria-hidden", "true");
            drawer.innerHTML = `
                <div id="drawerBackdrop" class="drawer-backdrop"></div>
                <div class="drawer-content">
                    <div class="drawer-header">
                        <a href="/" class="brand-logo" aria-label="Shree Mata">
                            <img src="/images/press.png" onerror="this.src='/images/logo.png'" alt="Shree Mata" width="36" height="36">
                            <span class="brand-title" style="font-size: 18px; font-weight: 700; color: #101820;">Shree Mata</span>
                        </a>
                        <button type="button" id="drawerCloseBtn" class="drawer-close-btn" aria-label="Close menu">&times;</button>
                    </div>
                    <nav class="drawer-nav">
                        <a href="/" class="drawer-link">🏠 Home</a>
                        <a href="/#booksSection" class="drawer-link">📚 Books</a>
                        <a href="/bundles.html" class="drawer-link">🎁 Bundles & Sets</a>
                        <a href="/account.html" class="drawer-link">👤 My Account</a>
                        <a href="/orders.html" class="drawer-link">📦 My Orders</a>
                        <a href="/referral.html" class="drawer-link">💰 Referral Network</a>
                        <a href="/account.html?section=membership" class="drawer-link">🌟 Membership</a>
                        <a href="/account.html?section=vip" class="drawer-link">👑 VIP Master Card</a>
                        <a href="/cart.html" class="drawer-link">🛒 Cart</a>
                        <a href="/account.html?section=store" class="drawer-link">🏪 Contact & Store</a>
                    </nav>
                    <div id="drawerAuthSection" class="drawer-auth">
                        <div id="drawerGuestAuth" class="drawer-auth-buttons">
                            <a href="/login.html" class="btn-secondary" style="min-height: 44px; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; text-decoration: none; border-radius: 8px; border: 1px solid #cbd5e1; color: #1e293b; font-weight: 600;">Log In</a>
                            <a href="/signup.html" class="btn-primary" style="min-height: 44px; display: flex; align-items: center; justify-content: center; text-decoration: none; border-radius: 8px; background: #101820; color: #ffffff; font-weight: 600;">Sign Up</a>
                        </div>
                        <div id="drawerUserAuth" class="drawer-user-menu" style="display: none;">
                            <div class="drawer-user-info" style="display: flex; align-items: center; gap: 10px; padding: 8px 0 14px; border-bottom: 1px solid #e2e8f0; margin-bottom: 10px;">
                                <span class="user-avatar-icon" style="font-size: 20px;">👤</span>
                                <div>
                                    <span style="font-size: 11px; color: #64748b; text-transform: uppercase; display: block;">Signed in as</span>
                                    <span id="drawerUserName" style="font-size: 14.5px; font-weight: 700; color: #101820;">User</span>
                                </div>
                            </div>
                            <div class="drawer-user-links" style="display: flex; flex-direction: column; gap: 4px;">
                                <a href="/admin.html" id="drawerAdminLink" class="drawer-link" style="min-height: 44px; padding: 10px 12px; display: none; color: #0284c7;">⚙️ Admin Dashboard</a>
                                <button type="button" id="drawerLogoutBtn" class="btn-logout-item" style="min-height: 44px; padding: 10px 12px; margin-top: 4px; border: none; background: transparent; color: #dc2626; font-size: 14.5px; font-weight: 600; text-align: left; cursor: pointer; display: flex; align-items: center; gap: 8px;">🚪 Logout</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(drawer);
        }

        // Also ensure a toggle button exists in header if missing
        let toggleBtn = document.getElementById("mobileMenuToggle");
        if (!toggleBtn) {
            const headerActions = document.querySelector(".header-actions, .nav-links, .navbar-content");
            if (headerActions) {
                toggleBtn = document.createElement("button");
                toggleBtn.id = "mobileMenuToggle";
                toggleBtn.type = "button";
                toggleBtn.className = "mobile-menu-toggle";
                toggleBtn.setAttribute("aria-label", "Open Navigation Menu");
                toggleBtn.innerHTML = "☰";
                headerActions.appendChild(toggleBtn);
            }
        }
    }

    function initMobileDrawer() {
        ensureMobileDrawerDOM();

        const toggleBtn = document.getElementById("mobileMenuToggle");
        const drawer = document.getElementById("mobileNavDrawer");
        const backdrop = document.getElementById("drawerBackdrop");
        const closeBtn = document.getElementById("drawerCloseBtn");

        if (!drawer) return;

        function openDrawer(e) {
            if (e) e.preventDefault();
            drawer.classList.add("open");
            drawer.classList.add("is-open");
            drawer.setAttribute("aria-hidden", "false");
            if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "true");
            document.body.style.overflow = "hidden";
        }

        function closeDrawer(e) {
            if (e && e.preventDefault) e.preventDefault();
            drawer.classList.remove("open");
            drawer.classList.remove("is-open");
            drawer.setAttribute("aria-hidden", "true");
            if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "false");
            document.body.style.overflow = "";
        }

        if (toggleBtn) {
            toggleBtn.removeEventListener("click", openDrawer);
            toggleBtn.addEventListener("click", openDrawer);
        }
        if (backdrop) backdrop.addEventListener("click", closeDrawer);
        if (closeBtn) closeBtn.addEventListener("click", closeDrawer);

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && (drawer.classList.contains("open") || drawer.classList.contains("is-open"))) {
                closeDrawer();
                if (toggleBtn) toggleBtn.focus();
            }
        });

        // Close mobile drawer when clicking any link or action button inside
        drawer.querySelectorAll("a, button:not(#drawerCloseBtn)").forEach(item => {
            item.addEventListener("click", closeDrawer);
        });
    }

    // ── 7. ATTACH EVENT LISTENERS ──
    function initGlobalEventListeners() {
        // Desktop Logout button
        const logoutBtn = document.getElementById("logoutBtn");
        if (logoutBtn) {
            logoutBtn.addEventListener("click", handleGlobalLogout);
        }

        // Mobile Drawer Logout button
        const drawerLogoutBtn = document.getElementById("drawerLogoutBtn");
        if (drawerLogoutBtn) {
            drawerLogoutBtn.addEventListener("click", handleGlobalLogout);
        }

        // Search button & Enter key
        const searchBtn = document.getElementById("searchBtn");
        const searchInput = document.getElementById("searchInput");

        if (searchBtn) {
            searchBtn.addEventListener("click", handleGlobalSearch);
        }

        if (searchInput) {
            searchInput.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    handleGlobalSearch();
                }
            });
        }

        // Cross-tab storage synchronization
        window.addEventListener("storage", (e) => {
            if (e.key === "cart") {
                updateGlobalCartCount();
            }
            if (e.key === "token" || e.key === "user") {
                updateGlobalNavbarAuth();
            }
        });

        // Custom cartUpdated event
        window.addEventListener("cartUpdated", updateGlobalCartCount);
    }

    // Initialize on DOMContentLoaded or immediately if already loaded
    function bootstrap() {
        updateGlobalNavbarAuth();
        updateGlobalCartCount();
        initAccountDropdown();
        initMobileDrawer();
        initGlobalEventListeners();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bootstrap);
    } else {
        bootstrap();
    }
})();
