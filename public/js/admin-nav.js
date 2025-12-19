// Admin Navigation Helper
document.addEventListener('DOMContentLoaded', function() {
    // Set active page based on current URL
    const currentPage = window.location.pathname;
    const navLinks = document.querySelectorAll('nav a[data-page]');
    
    // Remove all active classes first
    navLinks.forEach(link => link.classList.remove('active'));
    
    // Add active class to current page
    if (currentPage === '/' || currentPage === '/index.html') {
        document.querySelector('nav a[data-page="home"]')?.classList.add('active');
    } else if (currentPage.includes('admin.html')) {
        document.querySelector('nav a[data-page="books"]')?.classList.add('active');
    } else if (currentPage.includes('admin-bundles.html')) {
        document.querySelector('nav a[data-page="bundles"]')?.classList.add('active');
    } else if (currentPage.includes('admin-orders.html')) {
        document.querySelector('nav a[data-page="orders"]')?.classList.add('active');
    } else if (currentPage.includes('admin-withdrawals.html')) {
        document.querySelector('nav a[data-page="withdrawals"]')?.classList.add('active');
    } else if (currentPage.includes('admin-notifications.html')) {
        document.querySelector('nav a[data-page="notifications"]')?.classList.add('active');
    } else if (currentPage.includes('admin-income.html')) {
        document.querySelector('nav a[data-page="income"]')?.classList.add('active');
    } else if (currentPage.includes('admin-users.html')) {
        document.querySelector('nav a[data-page="users"]')?.classList.add('active');
    } else if (currentPage.includes('admin-commission-settings.html')) {
        document.querySelector('nav a[data-page="settings"]')?.classList.add('active');
    } else if (currentPage.includes('admin-referral-tree.html')) {
        document.querySelector('nav a[data-page="referral-tree"]')?.classList.add('active');
    } else if (currentPage.includes('admin-referral-tree-visual.html')) {
        document.querySelector('nav a[data-page="tree-visual"]')?.classList.add('active');
    }
    
    // Handle logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('userName');
            localStorage.removeItem('userRole');
            window.location.href = '/login.html';
        });
    }
    
    // Set user name if available
    const userName = localStorage.getItem('userName') || 
                    JSON.parse(localStorage.getItem('user') || '{}').name;
    if (userName) {
        const userNameEl = document.getElementById('userName');
        if (userNameEl) {
            userNameEl.textContent = `Hello, ${userName}`;
        }
    }
});