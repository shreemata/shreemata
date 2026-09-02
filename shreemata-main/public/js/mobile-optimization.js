/**
 * Mobile Optimization Script
 * Enhances mobile experience across all pages
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize mobile optimizations
    initMobileOptimizations();
});

function initMobileOptimizations() {
    // Add mobile-specific classes
    addMobileClasses();
    
    // Setup scroll to top button
    setupScrollToTop();
    
    // Optimize touch interactions
    optimizeTouchInteractions();
    
    // Handle orientation changes
    handleOrientationChange();
    
    // Optimize forms for mobile
    optimizeMobileForms();
    
    // Setup mobile navigation
    setupMobileNavigation();
}

function addMobileClasses() {
    const isMobile = window.innerWidth <= 768;
    const isTablet = window.innerWidth <= 1024 && window.innerWidth > 768;
    
    if (isMobile) {
        document.body.classList.add('mobile-device');
    }
    
    if (isTablet) {
        document.body.classList.add('tablet-device');
    }
    
    // Add touch device class
    if ('ontouchstart' in window) {
        document.body.classList.add('touch-device');
    }
}

function setupScrollToTop() {
    // Create scroll to top button if it doesn't exist
    let scrollBtn = document.getElementById('scrollToTop');
    
    if (!scrollBtn) {
        scrollBtn = document.createElement('button');
        scrollBtn.id = 'scrollToTop';
        scrollBtn.className = 'scroll-to-top';
        scrollBtn.innerHTML = '⬆️';
        scrollBtn.setAttribute('aria-label', 'Scroll to top');
        document.body.appendChild(scrollBtn);
    }
    
    // Show/hide scroll button based on scroll position
    window.addEventListener('scroll', function() {
        if (window.pageYOffset > 300) {
            scrollBtn.classList.add('show');
        } else {
            scrollBtn.classList.remove('show');
        }
    });
    
    // Scroll to top functionality
    scrollBtn.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

function optimizeTouchInteractions() {
    // Add touch feedback to buttons
    const buttons = document.querySelectorAll('button, .btn, .btn-primary, .btn-secondary');
    
    buttons.forEach(button => {
        button.addEventListener('touchstart', function() {
            this.style.transform = 'scale(0.98)';
        });
        
        button.addEventListener('touchend', function() {
            setTimeout(() => {
                this.style.transform = '';
            }, 150);
        });
    });
    
    // Prevent double-tap zoom on buttons
    buttons.forEach(button => {
        button.addEventListener('touchend', function(e) {
            e.preventDefault();
            this.click();
        });
    });
}

function handleOrientationChange() {
    window.addEventListener('orientationchange', function() {
        // Delay to ensure viewport has updated
        setTimeout(function() {
            // Trigger resize event
            window.dispatchEvent(new Event('resize'));
            
            // Update mobile classes
            addMobileClasses();
            
            // Refresh any grid layouts
            const grids = document.querySelectorAll('.books-grid, .bundles-grid, .stats-grid');
            grids.forEach(grid => {
                grid.style.display = 'none';
                grid.offsetHeight; // Trigger reflow
                grid.style.display = '';
            });
        }, 100);
    });
}

function optimizeMobileForms() {
    const inputs = document.querySelectorAll('input, select, textarea');
    
    inputs.forEach(input => {
        // Prevent zoom on focus for iOS
        if (input.type !== 'file') {
            const currentFontSize = window.getComputedStyle(input).fontSize;
            const fontSize = parseFloat(currentFontSize);
            
            if (fontSize < 16) {
                input.style.fontSize = '16px';
            }
        }
        
        // Add mobile-friendly attributes
        if (input.type === 'email') {
            input.setAttribute('autocomplete', 'email');
            input.setAttribute('inputmode', 'email');
        }
        
        if (input.type === 'tel' || input.name === 'phone') {
            input.setAttribute('autocomplete', 'tel');
            input.setAttribute('inputmode', 'tel');
        }
        
        if (input.type === 'number') {
            input.setAttribute('inputmode', 'numeric');
        }
        
        // Add focus/blur handlers for better mobile UX
        input.addEventListener('focus', function() {
            this.parentElement.classList.add('input-focused');
            
            // Scroll input into view on mobile
            if (window.innerWidth <= 768) {
                setTimeout(() => {
                    this.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            }
        });
        
        input.addEventListener('blur', function() {
            this.parentElement.classList.remove('input-focused');
        });
    });
}

function setupMobileNavigation() {
    const navbar = document.querySelector('.navbar, nav');
    if (!navbar) return;
    
    // Add mobile menu toggle if needed
    const navLinks = navbar.querySelector('.nav-links');
    if (!navLinks) return;
    
    // Check if we need a mobile menu
    if (window.innerWidth <= 768) {
        // Add hamburger menu for very small screens if nav has many items
        const navItems = navLinks.querySelectorAll('a');
        
        if (navItems.length > 4) {
            createMobileMenu(navbar, navLinks);
        }
    }
}

function createMobileMenu(navbar, navLinks) {
    // Create hamburger button
    const hamburger = document.createElement('button');
    hamburger.className = 'mobile-menu-toggle';
    hamburger.innerHTML = '☰';
    hamburger.setAttribute('aria-label', 'Toggle navigation menu');
    
    // Style the hamburger button
    hamburger.style.cssText = `
        display: none;
        background: none;
        border: none;
        font-size: 24px;
        color: inherit;
        cursor: pointer;
        padding: 8px;
        border-radius: 4px;
    `;
    
    // Insert hamburger before nav links
    navbar.insertBefore(hamburger, navLinks);
    
    // Toggle functionality
    hamburger.addEventListener('click', function() {
        navLinks.classList.toggle('mobile-menu-open');
        this.innerHTML = navLinks.classList.contains('mobile-menu-open') ? '✕' : '☰';
    });
    
    // Show hamburger on mobile
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    
    function handleMediaQuery(e) {
        if (e.matches) {
            hamburger.style.display = 'block';
            navLinks.style.cssText = `
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background: inherit;
                flex-direction: column;
                padding: 20px;
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                transform: translateY(-100%);
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
            `;
        } else {
            hamburger.style.display = 'none';
            navLinks.style.cssText = '';
            navLinks.classList.remove('mobile-menu-open');
        }
    }
    
    mediaQuery.addListener(handleMediaQuery);
    handleMediaQuery(mediaQuery);
    
    // Style for open menu
    const style = document.createElement('style');
    style.textContent = `
        .nav-links.mobile-menu-open {
            transform: translateY(0) !important;
            opacity: 1 !important;
            visibility: visible !important;
        }
    `;
    document.head.appendChild(style);
}

// Utility functions for mobile detection
window.isMobile = function() {
    return window.innerWidth <= 768;
};

window.isTablet = function() {
    return window.innerWidth <= 1024 && window.innerWidth > 768;
};

window.isTouchDevice = function() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initMobileOptimizations,
        isMobile: window.isMobile,
        isTablet: window.isTablet,
        isTouchDevice: window.isTouchDevice
    };
}