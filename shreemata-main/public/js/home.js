// ------------------------------
// FIX: Use ONLY window.API_URL
// ------------------------------


// If for any reason API_URL is empty, fallback
if (!API_URL || API_URL === "undefined") {
    API_URL = window.location.origin + "/api";
    console.log("API_URL fallback applied:", API_URL);
}

// Pagination and filtering state
let currentPage = 1;
let booksPerPage = 12;
let totalBooks = 0;
let allBooks = [];
let filteredBooks = [];
let currentView = (function() {
    try {
        return localStorage.getItem('booksViewMode') || 'grid';
    } catch (e) {
        return 'grid';
    }
})();
let homeSettings = { showBundles: true, showFeaturedBooks: true }; // Store home settings

// Infinite scroll state for single books
let infiniteScrollObserver = null;
let infiniteScrollPage = 1;
const BOOKS_BATCH_SIZE = 12; // Batch size: loads 12 books per batch
let infiniteScrollTotalPages = 1;
let infiniteScrollTotalBooks = 0;
let isInfiniteScrollLoading = false;
let hasMoreBooks = true;
const loadedBookIds = new Set();
let infiniteScrollLastQuery = {};
let bookFetchToken = 0;
let bookAbortController = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log("HOME USING API:", API_URL);
    checkAuth();
    loadHomeSettings(); // Load home page settings first
    loadNotifications(); // Load notifications/offers
    loadBundles(); // Load combo offers
    loadClassesAndSubjects(); // Load dynamic classes and subjects
    
    // Check if coming with a search query from URL (e.g. /?search=...)
    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get("search");
    if (searchParam) {
        const searchInput = document.getElementById("searchInput");
        if (searchInput) searchInput.value = searchParam;
        loadBooksWithFilters({ search: searchParam });
    } else {
        loadBooksWithFilters();
    }
    
    setupEventListeners();
    setupPaginationControls();
});

/* ------------------------------
   LOAD CLASSES AND SUBJECTS (DYNAMIC)
--------------------------------*/
async function loadClassesAndSubjects() {
    try {
        console.log('Loading classes and subjects...');
        // Load all books first to extract unique classes and subjects
        const response = await fetch(`${API_URL}/books`);
        const data = await response.json();
        
        console.log('Books data received:', data);
        
        if (data.books && Array.isArray(data.books)) {
            const books = data.books;
            console.log('Sample book data:', books[0]);
            
            // Dynamically update Homepage 3D Hero Books using real active catalog data
            updateHeroBooks(books);

            // Extract unique classes and subjects
            const classes = [...new Set(books.map(book => book.class).filter(Boolean))].sort((a, b) => a - b);
            const subjects = [...new Set(books.map(book => book.subject).filter(Boolean))].sort();
            
            console.log('Extracted classes:', classes);
            console.log('Extracted subjects:', subjects);
            
            // Populate class filter dropdown
            const classFilter = document.getElementById('classFilter');
            console.log('Class filter element:', classFilter);
            if (classFilter) {
                // Clear existing options first (except the default)
                classFilter.innerHTML = '<option value="">All Classes</option>';
                classes.forEach(className => {
                    const option = document.createElement('option');
                    option.value = className;
                    option.textContent = `Class ${className}`;
                    classFilter.appendChild(option);
                });
                console.log(`Added ${classes.length} class options`);
            }

            // Populate subject filter dropdown
            const subjectFilter = document.getElementById('subjectFilter');
            console.log('Subject filter element:', subjectFilter);
            if (subjectFilter) {
                // Clear existing options first (except the default)
                subjectFilter.innerHTML = '<option value="">All Subjects</option>';
                subjects.forEach(subject => {
                    const option = document.createElement('option');
                    option.value = subject;
                    option.textContent = subject;
                    subjectFilter.appendChild(option);
                });
                console.log(`Added ${subjects.length} subject options`);
            }
            
            console.log(`Successfully loaded ${classes.length} classes and ${subjects.length} subjects`);
        } else {
            console.log('No books data found or invalid format');
        }
    } catch (err) {
        console.error("Error loading classes and subjects:", err);
        console.error("API URL:", API_URL);
        console.error("Full URL:", `${API_URL}/books`);
    }
}

/* ------------------------------
   LOAD HOME SETTINGS
--------------------------------*/
async function loadHomeSettings() {
    try {
        const res = await fetch(`${API_URL}/home-settings`);
        const data = await res.json();

        if (data.success && data.settings) {
            // Store settings globally
            homeSettings = data.settings;
            
            // Apply visibility settings
            const bundlesSection = document.getElementById('bundlesSection');
            const booksSection = document.getElementById('booksSection');

            if (bundlesSection) {
                bundlesSection.style.display = data.settings.showBundles ? 'block' : 'none';
            }

            if (booksSection) {
                booksSection.style.display = data.settings.showFeaturedBooks ? 'block' : 'none';
            }

            console.log('✅ Home settings applied:', data.settings);
        }
    } catch (err) {
        console.error("Error loading home settings:", err);
        // On error, show both sections by default
        homeSettings = { showBundles: true, showFeaturedBooks: true };
        const bundlesSection = document.getElementById('bundlesSection');
        const booksSection = document.getElementById('booksSection');
        
        if (bundlesSection) bundlesSection.style.display = 'block';
        if (booksSection) booksSection.style.display = 'block';
    }
}

/* ------------------------------
   LOAD NOTIFICATIONS
--------------------------------*/
async function loadNotifications() {
    try {
        const res = await fetch(`${API_URL}/notifications`);
        const data = await res.json();

        if (data.notifications && data.notifications.length > 0) {
            displayNotifications(data.notifications);
            // Show drop-up notification for offers
            showDropupNotification(data.notifications);
        }
        initOffersLinkHandlers();
    } catch (err) {
        console.error("Error loading notifications:", err);
        console.error("API URL:", API_URL);
        console.error("Full URL:", `${API_URL}/notifications`);
    }
}

function displayNotifications(notifications) {
    const section = document.getElementById('notificationsSection');
    if (!section || !notifications || notifications.length === 0) return;
    
    const notif = notifications[0];
    section.innerHTML = `
        <div class="editorial-offer-banner">
            <div class="editorial-offer-content">
                <span class="editorial-offer-pill">Special Promotion</span>
                <h3 class="editorial-offer-title">${notif.title}</h3>
                <p class="editorial-offer-desc">${notif.message}</p>
                <button type="button" class="btn-editorial-offer" onclick="document.getElementById('booksSection').scrollIntoView({behavior: 'smooth'})">Explore Offers →</button>
            </div>
            <div class="class-feature-visual" aria-hidden="true" style="display: flex; gap: 12px;">
                <div class="class-book-thumb" style="width: 130px; height: 180px;">
                    <img src="https://res.cloudinary.com/dbtqqalo2/image/upload/v1766681378/bundles/bundle_1766681375288_gh0s4iuo3.jpg" alt="Special Offer" loading="lazy">
                </div>
            </div>
        </div>
    `;
    
    section.style.display = 'block';
}

// Drop-up notification functionality
let currentOfferIndex = 0;
let allOffers = [];
let offerCycleInterval = null;

// Expose variables globally for navigation functions
window.currentOfferIndex = 0;
window.allOffers = [];
window.offerCycleInterval = null;
window.displayCurrentOffer = displayCurrentOffer;
window.hideDropupNotification = hideDropupNotification;
window.previousOffer = previousOffer;
window.nextOffer = nextOffer;
window.goToOffer = goToOffer;

function showDropupNotification(notifications) {
    // Find all offers to display
    allOffers = notifications.filter(notif => 
        notif.type === 'offer' || notif.type === 'discount'
    );
    
    // Update global variables
    window.allOffers = allOffers;
    
    if (allOffers.length === 0) return;
    
    // Reset index
    currentOfferIndex = 0;
    window.currentOfferIndex = 0;
    
    // Show navigation if multiple offers
    const navigationElement = document.getElementById('dropupNavigation');
    if (navigationElement) {
        if (allOffers.length > 1) {
            navigationElement.style.display = 'flex';
            createOfferDots();
        } else {
            navigationElement.style.display = 'none';
        }
    }
    
    // Show the first offer
    displayCurrentOffer();
    
    // If there are multiple offers, cycle through them
    if (allOffers.length > 1) {
        // Clear any existing interval
        if (offerCycleInterval) {
            clearInterval(offerCycleInterval);
        }
        
        // Cycle through offers every 4 seconds
        offerCycleInterval = setInterval(() => {
            currentOfferIndex = (currentOfferIndex + 1) % allOffers.length;
            window.currentOfferIndex = currentOfferIndex;
            displayCurrentOffer();
        }, 4000);
    }
    
    // Show the drop-up after a delay
    setTimeout(() => {
        const dropupElement = document.getElementById('dropupNotification');
        if (dropupElement) {
            dropupElement.classList.add('show');
        }
    }, 2000);
    
    // Auto-hide after 15 seconds (longer for multiple offers)
    setTimeout(() => {
        const dropupElement = document.getElementById('dropupNotification');
        if (dropupElement && dropupElement.classList.contains('show')) {
            hideDropupNotification();
        }
    }, 15000);
}

function createOfferDots() {
    const dotsContainer = document.getElementById('dropupDots');
    if (!dotsContainer) return;
    
    dotsContainer.innerHTML = '';
    dotsContainer.style.display = 'flex';
    dotsContainer.style.alignItems = 'center';
    dotsContainer.style.gap = '6px';
    
    for (let i = 0; i < allOffers.length; i++) {
        const dot = document.createElement('div');
        dot.className = `dropup-dot ${i === currentOfferIndex ? 'active' : ''}`;
        dot.style.width = '8px';
        dot.style.height = '8px';
        dot.style.borderRadius = '50%';
        dot.style.display = 'inline-block';
        dot.style.cursor = 'pointer';
        dot.setAttribute('role', 'button');
        dot.setAttribute('aria-label', `Go to offer ${i + 1}`);
        dot.onclick = () => goToOffer(i);
        dotsContainer.appendChild(dot);
    }
}

function displayCurrentOffer() {
    if (allOffers.length === 0) return;
    
    const offer = allOffers[currentOfferIndex];
    
    // Update drop-up content
    const dropupElement = document.getElementById('dropupNotification');
    const titleElement = document.getElementById('dropupOfferTitle');
    const messageElement = document.getElementById('dropupOfferMessage');
    const iconElement = document.getElementById('dropupOfferIcon');
    const counterElement = document.getElementById('dropupOfferCounter');
    
    if (dropupElement && titleElement && messageElement && iconElement) {
        titleElement.textContent = offer.title;
        
        // Create enhanced message with offer details if available
        let message = offer.message;
        if (offer.offerDetails && offer.offerDetails.minAmount && offer.offerDetails.discountValue) {
            const minAmount = offer.offerDetails.minAmount;
            const discountValue = offer.offerDetails.discountValue;
            const discountType = offer.offerDetails.discountType;
            
            if (discountType === 'percentage') {
                message = `Buy above ₹${minAmount} and get ${discountValue}% off!`;
            } else {
                message = `Buy above ₹${minAmount} and get ₹${discountValue} off!`;
            }
        }
        
        messageElement.textContent = message;
        
        // Set appropriate icon based on offer type
        iconElement.textContent = offer.type === 'offer' ? '🎉' : '💰';
        
        // Update counter if there are multiple offers
        if (counterElement) {
            if (allOffers.length > 1) {
                counterElement.textContent = `${currentOfferIndex + 1} of ${allOffers.length}`;
                counterElement.style.display = 'block';
            } else {
                counterElement.style.display = 'none';
            }
        }
        
        // Update dots
        updateOfferDots();
        
        // Add click handler to navigate to books section
        dropupElement.onclick = function(e) {
            if (e.target.classList.contains('dropup-close') || 
                e.target.classList.contains('dropup-nav-btn') ||
                e.target.classList.contains('dropup-dot')) return;
            
            // Scroll to books section
            const booksSection = document.getElementById('booksSection');
            if (booksSection) {
                booksSection.scrollIntoView({ behavior: 'smooth' });
            }
            
            hideDropupNotification();
        };
    }
}

function updateOfferDots() {
    const dots = document.querySelectorAll('.dropup-dot');
    dots.forEach((dot, index) => {
        if (index === currentOfferIndex) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
}

function hideDropupNotification() {
    if (offerCycleInterval) {
        clearInterval(offerCycleInterval);
        offerCycleInterval = null;
        window.offerCycleInterval = null;
    }
    const dropupElement = document.getElementById('dropupNotification');
    if (dropupElement) {
        dropupElement.classList.remove('show');
    }
}

function previousOffer() {
    if (!allOffers || allOffers.length <= 1) return;
    if (offerCycleInterval) {
        clearInterval(offerCycleInterval);
        offerCycleInterval = null;
        window.offerCycleInterval = null;
    }
    currentOfferIndex = (currentOfferIndex - 1 + allOffers.length) % allOffers.length;
    window.currentOfferIndex = currentOfferIndex;
    displayCurrentOffer();
}

function nextOffer() {
    if (!allOffers || allOffers.length <= 1) return;
    if (offerCycleInterval) {
        clearInterval(offerCycleInterval);
        offerCycleInterval = null;
        window.offerCycleInterval = null;
    }
    currentOfferIndex = (currentOfferIndex + 1) % allOffers.length;
    window.currentOfferIndex = currentOfferIndex;
    displayCurrentOffer();
}

function goToOffer(index) {
    if (!allOffers || index < 0 || index >= allOffers.length) return;
    if (offerCycleInterval) {
        clearInterval(offerCycleInterval);
        offerCycleInterval = null;
        window.offerCycleInterval = null;
    }
    currentOfferIndex = index;
    window.currentOfferIndex = currentOfferIndex;
    displayCurrentOffer();
}

// Attach dropup controls to window
window.hideDropupNotification = hideDropupNotification;
window.previousOffer = previousOffer;
window.nextOffer = nextOffer;
window.goToOffer = goToOffer;

function isSectionVisible(el) {
    if (!el) return false;
    if (el.hidden) return false;
    if (el.style && el.style.display === 'none') return false;
    if (typeof window.getComputedStyle === 'function') {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return el.offsetHeight > 0;
}

function handleOffersLinkClick(e) {
    const notifSection = document.getElementById('notificationsSection');
    const isVisible = isSectionVisible(notifSection);

    if (!isVisible) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.closeMobileNavDrawer === 'function') {
            window.closeMobileNavDrawer();
        } else {
            const drawer = document.getElementById('mobileNavDrawer');
            if (drawer) {
                drawer.classList.remove('open', 'is-open');
                drawer.setAttribute('aria-hidden', 'true');
                document.body.style.overflow = '';
            }
        }
        const bundlesSection = document.getElementById('bundlesSection');
        const booksSection = document.getElementById('booksSection');
        const target = isSectionVisible(bundlesSection) ? bundlesSection : booksSection;
        if (target && typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ behavior: 'smooth' });
        }
    } else {
        if (typeof window.closeMobileNavDrawer === 'function') {
            window.closeMobileNavDrawer();
        } else {
            const drawer = document.getElementById('mobileNavDrawer');
            if (drawer) {
                drawer.classList.remove('open', 'is-open');
                drawer.setAttribute('aria-hidden', 'true');
                document.body.style.overflow = '';
            }
        }
    }
}

function initOffersLinkHandlers() {
    const offerLinks = document.querySelectorAll('a[href$="#notificationsSection"]');
    offerLinks.forEach(link => {
        if (link.dataset && link.dataset.offersHandlerBound) return;
        if (link.dataset) link.dataset.offersHandlerBound = 'true';
        link.addEventListener('click', handleOffersLinkClick);
    });
}
window.initOffersLinkHandlers = initOffersLinkHandlers;

// Event delegation fallback so dynamically added offer links are always caught
document.addEventListener('click', (e) => {
    const link = e.target && e.target.closest && e.target.closest('a[href$="#notificationsSection"]');
    if (!link) return;
    if (link.dataset && link.dataset.offersHandlerBound) return;
    handleOffersLinkClick.call(link, e);
});

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initOffersLinkHandlers();
} else {
    document.addEventListener('DOMContentLoaded', initOffersLinkHandlers);
}

/* ------------------------------
   LOAD BOOKS WITH FILTERS (INFINITE SCROLL)
--------------------------------*/
async function loadBooksWithFilters({ page = 1, limit = 4, category, minPrice, maxPrice, search } = {}) {
    const filters = {};
    if (category) filters.category = category;
    if (minPrice) filters.minPrice = minPrice;
    if (maxPrice) filters.maxPrice = maxPrice;
    if (search) filters.search = search;

    const selectedClass = document.getElementById('classFilter') ? document.getElementById('classFilter').value : '';
    const selectedSubject = document.getElementById('subjectFilter') ? document.getElementById('subjectFilter').value : '';
    if (selectedClass) filters.class = selectedClass;
    if (selectedSubject) filters.subject = selectedSubject;

    await resetAndLoadBooks(filters);
}

/* ------------------------------
   AUTH CHECK
--------------------------------*/
function checkAuth() {
    if (typeof window.updateGlobalNavbarAuth === "function") {
        return window.updateGlobalNavbarAuth();
    }
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");

    if (token && user) {
        const authLinks = document.getElementById("authLinks");
        const userLinks = document.getElementById("userLinks");
        const userName = document.getElementById("userName");
        const accountLink = document.getElementById("accountLink");
        const ordersLink = document.getElementById("ordersLink");
        const referralLink = document.getElementById("referralLink");
        const adminLink = document.getElementById("adminLink");
        const cartLink = document.getElementById("cartLink");

        if (authLinks) authLinks.style.display = "none";
        if (userLinks) userLinks.style.display = "inline-flex";
        if (userName) userName.textContent = user.name || "Account";
        if (accountLink) accountLink.style.display = "flex";
        if (ordersLink) ordersLink.style.display = "flex";
        if (referralLink) referralLink.style.display = "flex";
        
        if (cartLink) {
            cartLink.style.display = "inline-flex";
            updateCartCount();
        }

        if (user.role === "admin" && adminLink) {
            adminLink.style.display = "flex";
        }
    } else {
        const cartLink = document.getElementById("cartLink");
        if (cartLink) cartLink.style.display = "none";
    }
}

/* ------------------------------
   UPDATE CART COUNT
--------------------------------*/
function updateCartCount() {
    const cartCount = document.getElementById("cartCount");
    if (!cartCount) return;

    const cart = getCart();
    const totalItems = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    cartCount.textContent = totalItems;
}

/* ------------------------------
   EVENT LISTENERS
--------------------------------*/
function setupEventListeners() {
    initOffersLinkHandlers();
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", logout);

    const searchInput = document.querySelector('input[type="search"], #searchInput, #search-bar, .search-input');
    const searchButton = document.querySelector('#searchBtn, #search-btn, .search-btn');

    if (searchButton) {
        searchButton.addEventListener("click", (e) => {
            e.preventDefault();
            performSearch(true);
        });
    }
    
    if (searchInput) {
        // Immediate search on Enter key (keypress / keydown) with smooth scroll
        searchInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                performSearch(true);
            }
        });

        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                performSearch(true);
            }
        });

        // Instant live search as user types
        searchInput.addEventListener("input", debounce(() => {
            performSearch(false);
        }, 200));
    }
}

/* ------------------------------
   LOGOUT
--------------------------------*/
function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
}

/* ------------------------------
   DISPLAY BOOKS
--------------------------------*/
function displayBooks(books) {
    const grid = document.getElementById("booksGrid");
    grid.innerHTML = "";

    books.forEach((book) => {
        grid.appendChild(createBookCard(book));
    });
}

function createBookCard(book) {
    const card = document.createElement("div");
    card.className = "book-card";

    const coverImage = book.cover_image || "https://via.placeholder.com/250x300?text=No+Cover";

    // Create prominent points badge if book has reward points
    const pointsBadge = book.rewardPoints && book.rewardPoints > 0 
        ? `<div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 8px 12px; border-radius: 8px; margin: 10px 0; text-align: center; box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3); font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 6px;">
               <span style="font-size: 18px;">🎁</span>
               <span>Earn ${book.rewardPoints} Points</span>
           </div>`
        : '';

    // Create stock status overlay sticker
    const getStockOverlay = (book) => {
        console.log('🔍 Stock badge for book:', book.title, {
            trackStock: book.trackStock,
            stockQuantity: book.stockQuantity,
            stockStatus: book.stockStatus,
            lowStockThreshold: book.lowStockThreshold
        });
        
        if (!book.trackStock) return ''; // No badge for unlimited stock
        
        const quantity = book.stockQuantity || 0;
        const threshold = book.lowStockThreshold || 5;
        
        switch (book.stockStatus) {
            case 'out_of_stock':
                return `<div class="stock-overlay out-of-stock">
                           <span>❌ OUT OF STOCK</span>
                       </div>`;
            case 'limited_stock':
                return `<div class="stock-overlay limited-stock">
                           <span>⚠️ ONLY ${quantity} LEFT!</span>
                       </div>`;
            case 'in_stock':
                if (quantity <= threshold) {
                    return `<div class="stock-overlay limited-stock">
                               <span>⚠️ ONLY ${quantity} LEFT!</span>
                           </div>`;
                }
                return ''; // No badge for normal stock levels
            default:
                return '';
        }
    };

    // Create cashback sticker
    const getCashbackSticker = (book) => {
        let cashbackAmount = 0;
        const pricing = window.getBookDisplayPricing ? window.getBookDisplayPricing(book) : { sellingPrice: parseFloat(book.price) || 0 };
        const sellingPrice = pricing.sellingPrice;
        
        if (book.cashbackAmount > 0) {
            cashbackAmount = book.cashbackAmount;
        } else if (book.cashbackPercentage > 0) {
            cashbackAmount = (sellingPrice * book.cashbackPercentage) / 100;
        }
        
        if (cashbackAmount > 0) {
            return `<div class="cashback-sticker">
                       <span class="cashback-icon">💰</span>
                       <span class="cashback-text">₹${cashbackAmount.toFixed(0)} Cashback</span>
                   </div>`;
        }
        return '';
    };

    const stockOverlay = getStockOverlay(book);
    const cashbackSticker = getCashbackSticker(book);
    const isOutOfStock = book.trackStock && book.stockStatus === 'out_of_stock';

    const pricing = window.getBookDisplayPricing ? window.getBookDisplayPricing(book) : { hasOffer: false, sellingPrice: parseFloat(book.price) || 0, mrp: parseFloat(book.price) || 0, discountAmount: 0, discountPercentage: 0 };
    
    let priceDisplayHtml = '';
    if (pricing.hasOffer) {
        priceDisplayHtml = `
            <div class="book-price-offer">
                <div class="offer-price-row">
                    <span class="offer-selling-price">₹${pricing.sellingPrice.toFixed(2)}</span>
                    <span class="offer-mrp">₹${pricing.mrp.toFixed(2)}</span>
                    <span class="offer-discount-badge">${pricing.discountPercentage}% OFF</span>
                </div>
                <div class="offer-saving">Save ₹${pricing.discountAmount.toFixed(0)}</div>
            </div>
        `;
    } else {
        priceDisplayHtml = `<p class="book-price">₹${pricing.sellingPrice.toFixed(2)}</p>`;
    }

    card.innerHTML = `
        <div class="book-image-container">
            <img src="${coverImage}" class="book-cover" />
            ${stockOverlay}
            ${cashbackSticker}
        </div>
        <div class="book-info">
            <h3>${book.title}</h3>
            <p class="book-author">by ${book.author}</p>
            ${priceDisplayHtml}
            ${pointsBadge}
        </div>
        <div class="book-actions">
            <button class="btn-secondary" onclick="previewBook('${book._id}')">Preview</button>
            ${isOutOfStock 
                ? '<button class="btn-disabled" disabled style="background: #6c757d; cursor: not-allowed;">Out of Stock</button>'
                : `<button class="btn-primary" onclick="handleBuyClick('${book._id}')">Buy</button>`
            }
            ${isOutOfStock 
                ? '<button class="btn-disabled cart-btn" disabled style="background: #6c757d; cursor: not-allowed;" data-id="' + book._id + '">Out of Stock</button>'
                : `<button class="btn-secondary cart-btn" data-id="${book._id}">Add to Cart</button>`
            }
        </div>
    `;
    return card;
}

/* ------------------------------
   SEARCH & DISPLAY SEARCH RESULTS
--------------------------------*/
function displaySearchResults(data, searchTerm = "") {
    const books = Array.isArray(data) ? data : (data.books || []);
    console.log("Rendering search results count:", books.length);

    if (infiniteScrollObserver) infiniteScrollObserver.disconnect();
    if (bookAbortController) {
        try { bookAbortController.abort(); } catch (_) {}
    }
    bookFetchToken++;
    hasMoreBooks = false;
    isInfiniteScrollLoading = false;
    loadedBookIds.clear();

    const booksGrid = document.getElementById("booksGrid");
    const emptyState = document.getElementById("emptyState");
    const pagContainer = document.getElementById("paginationContainer");
    if (pagContainer) pagContainer.style.display = "none";

    getOrCreateInfiniteScrollUI();
    const loadingEl = document.getElementById("infiniteScrollLoading");
    const errorEl = document.getElementById("infiniteScrollError");
    const endEl = document.getElementById("infiniteScrollEnd");
    if (loadingEl) loadingEl.style.display = "none";
    if (errorEl) errorEl.style.display = "none";
    hideLegacyLoadingSpinner();

    if (books.length === 0) {
        if (emptyState) emptyState.style.display = "block";
        if (booksGrid) {
            booksGrid.innerHTML = "";
            booksGrid.style.display = "none";
        }
        if (endEl) endEl.style.display = "none";
        updateBooksStatsText(0, searchTerm);
        return;
    }

    if (emptyState) emptyState.style.display = "none";
    if (booksGrid) {
        booksGrid.innerHTML = "";
        booksGrid.style.display = currentView === 'list' ? 'flex' : 'grid';
        booksGrid.className = `books-grid ${currentView === 'list' ? 'list-view' : ''}`;
        books.forEach(b => {
            const id = b._id || b.id;
            if (id && !loadedBookIds.has(id)) {
                loadedBookIds.add(id);
                booksGrid.appendChild(createBookCard(b));
            }
            const idx = allBooks.findIndex(existing => (existing._id || existing.id) === id);
            if (idx === -1) allBooks.push(b);
            else allBooks[idx] = b;
        });
    }

    if (endEl) endEl.style.display = "block";
    updateBooksStatsText(books.length, searchTerm);
}

async function performSearch(shouldScroll = false) {
    const searchInput = document.querySelector('input[type="search"], #searchInput, #search-bar, .search-input');
    const term = searchInput ? searchInput.value.trim() : "";
    
    console.log("🔍 Performing search with term:", term);
    
    const selectedClass = document.getElementById('classFilter') ? document.getElementById('classFilter').value : '';
    const selectedSubject = document.getElementById('subjectFilter') ? document.getElementById('subjectFilter').value : '';
    
    if (!term) {
        filterAndDisplayBooks(selectedClass, selectedSubject, "");
        return;
    }

    try {
        // Query backend dedicated search endpoint /api/books/search?q=
        const response = await fetch(`${API_URL}/books/search?q=${encodeURIComponent(term)}`);
        const data = await response.json();
        
        if (data && (data.success || Array.isArray(data.books))) {
            let resultBooks = data.books || [];
            if (selectedClass || selectedSubject) {
                resultBooks = resultBooks.filter(book => {
                    const matchesClass = !selectedClass || (book.class && book.class.toString() === selectedClass);
                    const matchesSubject = !selectedSubject || (book.subject && book.subject.toLowerCase() === selectedSubject.toLowerCase());
                    return matchesClass && matchesSubject;
                });
            }
            displaySearchResults({ success: true, count: resultBooks.length, books: resultBooks }, term);
        } else if (allBooks && allBooks.length > 0) {
            // Fallback to in-memory filter if needed
            filterAndDisplayBooks(selectedClass, selectedSubject, term);
        }
    } catch (err) {
        console.error("Search error:", err);
        if (allBooks && allBooks.length > 0) {
            filterAndDisplayBooks(selectedClass, selectedSubject, term);
        }
    }
    
    if (shouldScroll && term) {
        const booksSection = document.getElementById("booksSection") || document.querySelector(".books-section");
        if (booksSection) {
            booksSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }
}

/* ------------------------------
   PREVIEW & BUY
--------------------------------*/
function previewBook(id) {
    window.location.href = `/book.html?id=${id}`;
}

function handleBuyClick(id) {
    const token = localStorage.getItem("token");
    if (!token) {
        localStorage.setItem("redirectAfterLogin", `/book.html?id=${id}`);
        return (window.location.href = "/login.html");
    }
    window.location.href = `/book.html?id=${id}`;
}

function handleBundleBuyClick(bundleId) {
    const token = localStorage.getItem("token");
    if (!token) {
        localStorage.setItem("redirectAfterLogin", `/bundle.html?id=${bundleId}`);
        return (window.location.href = "/login.html");
    }
    
    // Store bundle ID for purchase flow
    window.currentBundleId = bundleId;
    
    // Show delivery method selection modal
    showDeliveryMethodModal();
}

// Delivery Method Modal Functions
function showDeliveryMethodModal() {
    const modal = document.getElementById("deliveryMethodModal");
    if (modal) {
        modal.style.display = "block";
    }
}

function closeDeliveryMethodModal() {
    const modal = document.getElementById("deliveryMethodModal");
    if (modal) {
        modal.style.display = "none";
    }
}

function selectDeliveryMethod(method) {
    closeDeliveryMethodModal();
    window.selectedDeliveryMethod = method;
    
    // Show payment method selection modal
    showPaymentMethodModal();
}

// Payment Method Modal Functions
function showPaymentMethodModal() {
    const modal = document.getElementById("paymentMethodModal");
    if (modal) {
        modal.style.display = "block";
    }
}

function closePaymentMethodModal() {
    const modal = document.getElementById("paymentMethodModal");
    if (modal) {
        modal.style.display = "none";
    }
}

function selectPaymentMethod(method) {
    closePaymentMethodModal();
    
    const bundleId = window.currentBundleId;
    const deliveryMethod = window.selectedDeliveryMethod;
    
    if (method === 'online') {
        // Redirect to bundle page with purchase parameters
        window.location.href = `/bundle.html?id=${bundleId}&buy=true&delivery=${deliveryMethod}&payment=online`;
    } else if (method === 'cheque') {
        // Redirect to bundle page with cheque payment
        window.location.href = `/bundle.html?id=${bundleId}&buy=true&delivery=${deliveryMethod}&payment=cheque`;
    } else if (method === 'transfer') {
        // Redirect to bundle page with bank transfer
        window.location.href = `/bundle.html?id=${bundleId}&buy=true&delivery=${deliveryMethod}&payment=transfer`;
    }
}

/* ------------------------------
   LOAD BUNDLES (COMBO OFFERS)
--------------------------------*/
async function loadBundles() {
    try {
        console.log('🔍 Loading bundles from API...');
        console.log('API URL:', `${API_URL}/bundles`);
        
        const res = await fetch(`${API_URL}/bundles`);
        console.log('Bundles API response status:', res.status);
        
        const data = await res.json();
        console.log('Bundles API response data:', data);

        if (data.bundles && data.bundles.length > 0) {
            console.log(`✅ Found ${data.bundles.length} bundles`);
            // Show 5 bundles on desktop, 3 on mobile
            const isMobile = window.innerWidth <= 768;
            const limit = isMobile ? 3 : 5;
            const limitedBundles = data.bundles.slice(0, limit);
            console.log(`Displaying ${limitedBundles.length} bundles (limit: ${limit})`);
            
            displayBundles(limitedBundles, data.bundles.length, limit);
            
            // Only show if home settings allow it
            const bundlesSection = document.getElementById("bundlesSection");
            if (bundlesSection && homeSettings.showBundles) {
                bundlesSection.style.display = "block";
                console.log('✅ Bundles section made visible');
            } else {
                console.log('❌ Bundles section not shown - homeSettings.showBundles:', homeSettings.showBundles);
            }
        } else {
            console.log('❌ No bundles found in API response');
            console.log('Response data:', data);
            console.log('data.bundles:', data.bundles);
            console.log('data.bundles type:', typeof data.bundles);
            console.log('data.bundles length:', data.bundles ? data.bundles.length : 'undefined');
            
            // Check if bundles property exists but is empty
            if (data.bundles && Array.isArray(data.bundles)) {
                console.log('📊 Bundles array exists but is empty - no active bundles in database');
            } else {
                console.log('📊 Bundles property missing or not an array');
            }
        }
    } catch (err) {
        console.error("❌ Error loading bundles:", err);
        console.error("API URL:", `${API_URL}/bundles`);
    }
}

function displayBundles(bundles, totalCount, limit) {
    console.log('🎨 Displaying bundles:', bundles.length);
    const grid = document.getElementById("bundlesGrid");
    
    if (!grid) {
        console.error('❌ bundlesGrid element not found!');
        return;
    }
    
    console.log('✅ bundlesGrid element found');
    grid.innerHTML = "";

    bundles.forEach((bundle) => {
        const discount = bundle.discount || Math.round(((bundle.originalPrice - bundle.bundlePrice) / bundle.originalPrice) * 100);
        const savings = bundle.originalPrice - bundle.bundlePrice;
        const pointsBadge = bundle.rewardPoints && bundle.rewardPoints > 0 
            ? `<span style="background: #DCFCE7; color: #166534; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; margin-left: 8px;">🎁 ${bundle.rewardPoints} Points</span>`
            : '';

        const bundleCard = document.createElement("div");
        bundleCard.className = "bundle-hero-showcase";
        bundleCard.innerHTML = `
            <div class="bundle-3d-visual-wrap">
                <img src="${bundle.image || 'images/press.png'}" alt="${bundle.name}" />
            </div>
            <div class="bundle-details-wrap">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <span class="bundle-savings-badge">${discount}% OFF • COMPLETE SET</span>
                    ${pointsBadge}
                </div>
                <h3 class="bundle-name-title">${bundle.name}</h3>
                <p class="bundle-books-list"><strong>${bundle.books ? bundle.books.length : 6} Books Included:</strong> Complete grade syllabus package with all core textbooks & study guides.</p>
                <div class="bundle-price-row">
                    <span class="bundle-price-current">₹${bundle.bundlePrice}</span>
                    ${bundle.originalPrice ? `<span class="bundle-price-mrp">₹${bundle.originalPrice}</span>` : ''}
                    ${savings > 0 ? `<span class="bundle-save-amt">Save ₹${savings}</span>` : ''}
                </div>
                <div class="bundle-actions-row">
                    <button class="btn-bundle-buy" onclick="handleBundleBuyClick('${bundle._id}')">Buy Complete Set</button>
                    <button class="btn-bundle-cart" onclick="addBundleToCart('${bundle._id}')">Add to Cart</button>
                    <button class="btn-bundle-view" onclick="viewBundle('${bundle._id}')">View Details</button>
                </div>
            </div>
        `;
        grid.appendChild(bundleCard);
    });

    // Add "View All Offers" button if there are more bundles than the limit
    if (totalCount > limit) {
        const viewAllCard = document.createElement("div");
        viewAllCard.className = "book-card";
        viewAllCard.style.background = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
        viewAllCard.style.display = "flex";
        viewAllCard.style.alignItems = "center";
        viewAllCard.style.justifyContent = "center";
        viewAllCard.style.cursor = "pointer";
        viewAllCard.style.minHeight = "280px";
        
        viewAllCard.innerHTML = `
            <div style="text-align: center; color: white;">
                <div style="font-size: 40px; margin-bottom: 10px;">🎁</div>
                <h3 style="color: white; font-size: 18px; margin-bottom: 8px;">View All Offers</h3>
                <p style="color: rgba(255,255,255,0.9); font-size: 13px; margin-bottom: 12px;">${totalCount - limit} more bundles available</p>
                <button class="btn-primary" style="background: white; color: #667eea; padding: 8px 16px; font-size: 13px;">Explore All</button>
            </div>
        `;
        
        viewAllCard.onclick = () => {
            window.location.href = "/bundles.html";
        };
        
        grid.appendChild(viewAllCard);
    }
}

function viewBundle(bundleId) {
    window.location.href = `/bundle.html?id=${bundleId}`;
}

async function addBundleToCart(bundleId) {
    try {
        const res = await fetch(`${API_URL}/bundles/${bundleId}`);
        const data = await res.json();
        const bundle = data.bundle;
        if (!bundle) throw new Error("Bundle not found");

        let cart = getCart();

        // Check if bundle already in cart
        if (cart.find(item => item.bundleId === bundleId)) {
            const count = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
            if (typeof showCartNotification === "function") {
                showCartNotification({
                    title: "Already in Cart",
                    message: `Bundle "${bundle.name}" is already in your cart!`,
                    count: count,
                    type: "warning"
                });
            } else {
                alert("This bundle is already in your cart!");
            }
            return;
        }

        // Add bundle as a special cart item
        cart.push({
            bundleId: bundleId,
            isBundle: true,
            title: bundle.name,
            price: bundle.bundlePrice,
            originalPrice: bundle.originalPrice,
            books: bundle.books,
            quantity: 1,
            coverImage: bundle.image || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="250" height="300"%3E%3Crect fill="%23ddd" width="250" height="300"/%3E%3Ctext fill="%23999" font-family="Arial" font-size="20" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EBundle%3C/text%3E%3C/svg%3E'
        });

        saveCart(cart);
        updateCartCount();

        const count = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
        if (typeof showCartNotification === "function") {
            showCartNotification({
                title: "Added to Cart!",
                message: `Bundle "${bundle.name}" added to cart.`,
                count: count,
                type: "success"
            });
        } else {
            alert(`Bundle "${bundle.name}" added to cart!`);
        }
    } catch (err) {
        console.error("Error adding bundle to cart:", err);
        if (typeof showCartNotification === "function") {
            showCartNotification({
                title: "Error",
                message: "Error adding bundle to cart",
                type: "error"
            });
        } else {
            alert("Error adding bundle to cart");
        }
    }
}

function updateCartCount() {
    if (typeof updateAllCartBadges === "function") {
        updateAllCartBadges();
        return;
    }
    const cart = getCart();
    const cartCount = document.getElementById("cartCount");
    if (cartCount) {
        cartCount.textContent = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    }
}

/* ------------------------------
   ADD TO CART (HOME PAGE)
--------------------------------*/
document.addEventListener("click", (e) => {
    const btn = e.target.closest(".cart-btn");
    if (!btn) return;

    // Check if button is disabled (out of stock)
    if (btn.disabled) {
        if (typeof showCartNotification === "function") {
            showCartNotification({
                title: "Out of Stock",
                message: "This book is currently out of stock!",
                type: "error"
            });
        } else {
            alert("This book is currently out of stock!");
        }
        return;
    }

    const bookId = btn.dataset.id;
    const card = btn.closest(".book-card");
    const book = allBooks.find((b) => (b._id || b.id) === bookId) || {};

    const title = book.title || (card && card.querySelector("h3") ? card.querySelector("h3").textContent.trim() : "Book");
    const author = book.author || (card && card.querySelector(".book-author") ? card.querySelector(".book-author").textContent.replace("by ", "").trim() : "");
    const pricing = window.getBookDisplayPricing ? window.getBookDisplayPricing(book) : { sellingPrice: parseFloat(book.price) || 0 };
    const price = (pricing && pricing.sellingPrice > 0) ? pricing.sellingPrice : (parseFloat(book.price) || 0);
    const coverImage = book.cover_image || (card && card.querySelector("img") ? card.querySelector("img").src : "");

    let cart = getCart();

    if (cart.find((item) => item.id === bookId)) {
        const cartCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
        if (typeof showCartNotification === "function") {
            showCartNotification({
                title: "Already in Cart",
                message: `"${title}" is already in your cart.`,
                count: cartCount,
                type: "warning"
            });
        } else {
            alert("Already in cart!");
        }
        return;
    }

    // Additional stock validation by checking the book data
    if (book && book.trackStock && book.stockStatus === 'out_of_stock') {
        if (typeof showCartNotification === "function") {
            showCartNotification({
                title: "Out of Stock",
                message: "This book is currently out of stock!",
                type: "error"
            });
        } else {
            alert("This book is currently out of stock!");
        }
        return;
    }

    cart.push({ id: bookId, title, author, price, coverImage, quantity: 1 });
    saveCart(cart);
    updateCartCount();

    // Show popup notification with cart count
    const cartCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    if (typeof showCartNotification === "function") {
        showCartNotification({
            title: "Added to Cart!",
            message: `"${title}" added to cart.`,
            count: cartCount,
            type: "success"
        });
    } else {
        alert(`✅ "${title}" added to cart!\n\nCart now has ${cartCount} item${cartCount > 1 ? 's' : ''}.`);
    }
});

/* ------------------------------
   INFINITE SCROLL UI & CONTROLS
--------------------------------*/

function hideLegacyLoadingSpinner() {
    const spinner = document.getElementById('loadingSpinner') || document.querySelector('.books-section .loading');
    if (spinner) {
        spinner.style.display = 'none';
        spinner.setAttribute('aria-hidden', 'true');
    }
}

function getOrCreateInfiniteScrollUI() {
    let container = document.getElementById('infiniteScrollContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'infiniteScrollContainer';
        container.className = 'infinite-scroll-container';
        container.innerHTML = `
            <div id="infiniteScrollLoading" class="infinite-scroll-loading" style="display: none;">
                <div class="spinner-small"></div>
                <span>Loading more books...</span>
            </div>
            <div id="infiniteScrollEnd" class="infinite-scroll-end" style="display: none;">
                No more books
            </div>
            <div id="infiniteScrollError" class="infinite-scroll-error" style="display: none;">
                <span>Failed to load more books.</span>
                <button type="button" id="retryInfiniteScrollBtn" class="btn-retry-scroll">Retry</button>
            </div>
            <div id="infiniteScrollSentinel" style="height: 20px; width: 100%; margin: 10px 0;"></div>
        `;

        const booksGrid = document.getElementById('booksGrid');
        if (booksGrid && booksGrid.parentNode) {
            booksGrid.parentNode.insertBefore(container, booksGrid.nextSibling);
        }

        const retryBtn = container.querySelector('#retryInfiniteScrollBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                fetchNextBookBatch();
            });
        }
    }
    return container;
}

async function resetAndLoadBooks(filters = {}) {
    // Cancel any in-flight request for previous filter session
    if (bookAbortController) {
        try { bookAbortController.abort(); } catch (_) {}
    }
    bookAbortController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const currentToken = ++bookFetchToken;

    // Disconnect any active observer
    if (infiniteScrollObserver) {
        infiniteScrollObserver.disconnect();
    }

    infiniteScrollPage = 1;
    hasMoreBooks = true;
    isInfiniteScrollLoading = false;
    loadedBookIds.clear();

    const booksGrid = document.getElementById('booksGrid');
    if (booksGrid) {
        booksGrid.innerHTML = '';
        booksGrid.style.display = currentView === 'list' ? 'flex' : 'grid';
        booksGrid.className = `books-grid ${currentView === 'list' ? 'list-view' : ''}`;
    }

    const emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.style.display = 'none';

    // Hide legacy loading spinner
    hideLegacyLoadingSpinner();

    // Hide legacy pagination container
    const pagContainer = document.getElementById('paginationContainer');
    if (pagContainer) pagContainer.style.display = 'none';

    getOrCreateInfiniteScrollUI();
    const endEl = document.getElementById('infiniteScrollEnd');
    const errorEl = document.getElementById('infiniteScrollError');
    if (endEl) endEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';

    infiniteScrollLastQuery = { ...filters };

    // Fetch the first batch with current session token
    await fetchNextBookBatch(currentToken);

    // Attach IntersectionObserver to sentinel only if still matching current token and has more books
    if (currentToken === bookFetchToken && hasMoreBooks) {
        setupInfiniteScrollObserver();
    }
}

async function fetchNextBookBatch(expectedToken) {
    if (isInfiniteScrollLoading || !hasMoreBooks) return;

    // If an expectedToken was passed, ensure it matches current bookFetchToken
    const thisToken = expectedToken !== undefined ? expectedToken : bookFetchToken;
    if (thisToken !== bookFetchToken) return;

    isInfiniteScrollLoading = true;

    const loadingEl = document.getElementById('infiniteScrollLoading');
    const errorEl = document.getElementById('infiniteScrollError');
    const endEl = document.getElementById('infiniteScrollEnd');
    const emptyState = document.getElementById('emptyState');
    const booksGrid = document.getElementById('booksGrid');

    if (loadingEl) loadingEl.style.display = 'flex';
    if (errorEl) errorEl.style.display = 'none';

    const qs = new URLSearchParams();
    qs.set('page', infiniteScrollPage);
    qs.set('limit', BOOKS_BATCH_SIZE);

    if (infiniteScrollLastQuery.class) qs.set('class', infiniteScrollLastQuery.class);
    if (infiniteScrollLastQuery.subject) qs.set('subject', infiniteScrollLastQuery.subject);
    if (infiniteScrollLastQuery.search) qs.set('search', infiniteScrollLastQuery.search);
    if (infiniteScrollLastQuery.category) qs.set('category', infiniteScrollLastQuery.category);
    if (infiniteScrollLastQuery.minPrice) qs.set('minPrice', infiniteScrollLastQuery.minPrice);
    if (infiniteScrollLastQuery.maxPrice) qs.set('maxPrice', infiniteScrollLastQuery.maxPrice);

    const signal = bookAbortController ? bookAbortController.signal : undefined;

    try {
        const res = await fetch(`${API_URL}/books?${qs.toString()}`, { signal });
        if (thisToken !== bookFetchToken) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (thisToken !== bookFetchToken) return;

        if (loadingEl) loadingEl.style.display = 'none';
        hideLegacyLoadingSpinner();

        const books = Array.isArray(data.books) ? data.books : [];
        infiniteScrollTotalPages = data.totalPages || 1;
        infiniteScrollTotalBooks = data.totalCount !== undefined ? data.totalCount : books.length;

        // Dedup new books
        const newBooks = books.filter(b => {
            const id = b._id || b.id;
            if (!id || loadedBookIds.has(id)) return false;
            loadedBookIds.add(id);
            return true;
        });

        // Add to allBooks cache for stock checks and cart addition
        newBooks.forEach(b => {
            const idx = allBooks.findIndex(existing => (existing._id || existing.id) === (b._id || b.id));
            if (idx === -1) allBooks.push(b);
            else allBooks[idx] = b;
        });

        if (loadedBookIds.size === 0) {
            if (emptyState) emptyState.style.display = 'block';
            if (booksGrid) booksGrid.style.display = 'none';
            hasMoreBooks = false;
            updateBooksStatsText(0, infiniteScrollLastQuery.search);
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        if (booksGrid) {
            booksGrid.style.display = currentView === 'list' ? 'flex' : 'grid';
            newBooks.forEach(book => {
                booksGrid.appendChild(createBookCard(book));
            });
        }

        updateBooksStatsText(infiniteScrollTotalBooks, infiniteScrollLastQuery.search);

        // Check if more books remain
        if (infiniteScrollPage >= infiniteScrollTotalPages || books.length < BOOKS_BATCH_SIZE || books.length === 0) {
            hasMoreBooks = false;
            if (endEl) endEl.style.display = 'block';
            if (infiniteScrollObserver) infiniteScrollObserver.disconnect();
        } else {
            infiniteScrollPage++;
        }
    } catch (err) {
        if (err && err.name === 'AbortError') {
            return;
        }
        if (thisToken !== bookFetchToken) {
            return;
        }
        console.error("Error fetching book batch:", err);
        if (loadingEl) loadingEl.style.display = 'none';
        hideLegacyLoadingSpinner();
        if (errorEl) errorEl.style.display = 'flex';
    } finally {
        if (thisToken === bookFetchToken) {
            isInfiniteScrollLoading = false;
        }
    }
}

function setupInfiniteScrollObserver() {
    if (infiniteScrollObserver) infiniteScrollObserver.disconnect();

    const sentinel = document.getElementById('infiniteScrollSentinel');
    if (!sentinel) return;

    if (!('IntersectionObserver' in window)) {
        console.warn('IntersectionObserver not supported, fallback scroll listener');
        window.addEventListener('scroll', debounce(() => {
            if (hasMoreBooks && !isInfiniteScrollLoading) {
                const rect = sentinel.getBoundingClientRect();
                if (rect.top <= window.innerHeight + 300) {
                    fetchNextBookBatch();
                }
            }
        }, 150));
        return;
    }

    infiniteScrollObserver = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting && hasMoreBooks && !isInfiniteScrollLoading) {
            fetchNextBookBatch();
        }
    }, {
        root: null,
        rootMargin: '250px',
        threshold: 0.05
    });

    infiniteScrollObserver.observe(sentinel);
}

function setupPaginationControls() {
    // Hide legacy pagination container permanently
    const pagContainer = document.getElementById('paginationContainer');
    if (pagContainer) {
        pagContainer.style.display = 'none';
        const controls = pagContainer.querySelector('.pagination-controls');
        if (controls) controls.style.display = 'none';
    }

    // Class filter
    const classFilter = document.getElementById('classFilter');
    if (classFilter) {
        classFilter.addEventListener('change', handleFilters);
    }

    // Subject filter
    const subjectFilter = document.getElementById('subjectFilter');
    if (subjectFilter) {
        subjectFilter.addEventListener('change', handleFilters);
    }

    // View controls
    const gridViewBtn = document.getElementById('gridView');
    const listViewBtn = document.getElementById('listView');

    if (gridViewBtn && listViewBtn) {
        gridViewBtn.classList.toggle('active', currentView === 'grid');
        listViewBtn.classList.toggle('active', currentView === 'list');
        gridViewBtn.addEventListener('click', () => switchView('grid'));
        listViewBtn.addEventListener('click', () => switchView('list'));
    }
}

function handleFilters() {
    const selectedClass = document.getElementById('classFilter') ? document.getElementById('classFilter').value : '';
    const selectedSubject = document.getElementById('subjectFilter') ? document.getElementById('subjectFilter').value : '';
    const searchInput = document.getElementById("searchInput");
    const searchTerm = searchInput ? searchInput.value.trim() : '';

    resetAndLoadBooks({
        class: selectedClass,
        subject: selectedSubject,
        search: searchTerm
    });
}

window.filterAndDisplayBooks = function(selectedClass = '', selectedSubject = '', searchTerm = '') {
    resetAndLoadBooks({
        class: selectedClass,
        subject: selectedSubject,
        search: searchTerm
    });
};

window.filterByClass = function (classValue, el) {
    document.querySelectorAll('.discovery-class-btn, .class-chip-pill').forEach(c => c.classList.remove('active'));
    if (el && el.classList) {
        el.classList.add('active');
    } else if (classValue) {
        const btn = document.querySelector(`.discovery-class-btn[data-class="${classValue}"]`);
        if (btn) btn.classList.add('active');
    }

    const classFilter = document.getElementById('classFilter');
    if (classFilter) {
        let exists = Array.from(classFilter.options).some(opt => opt.value === String(classValue));
        if (!exists && classValue) {
            const opt = document.createElement('option');
            opt.value = classValue;
            opt.textContent = `Class ${classValue}`;
            classFilter.appendChild(opt);
        }
        classFilter.value = classValue;
    }

    const subjectFilter = document.getElementById('subjectFilter');
    const selectedSubject = subjectFilter ? subjectFilter.value : '';
    const searchInput = document.getElementById("searchInput");
    const searchTerm = searchInput ? searchInput.value.trim() : '';

    resetAndLoadBooks({
        class: String(classValue),
        subject: selectedSubject,
        search: searchTerm
    });

    const booksSection = document.getElementById('booksSection');
    if (booksSection) {
        booksSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

function displayPaginatedBooks() {
    // Kept for backward compatibility: hide legacy container and use infinite scroll
    const pagContainer = document.getElementById('paginationContainer');
    if (pagContainer) pagContainer.style.display = 'none';
}

function updatePaginationUI() {
    // Hide legacy pagination container permanently
    const pagContainer = document.getElementById('paginationContainer');
    if (pagContainer) pagContainer.style.display = 'none';
}

function switchView(view) {
    currentView = view;
    try {
        localStorage.setItem('booksViewMode', view);
    } catch (e) {}

    // Update button states
    const gridViewBtn = document.getElementById('gridView');
    const listViewBtn = document.getElementById('listView');
    if (gridViewBtn) gridViewBtn.classList.toggle('active', view === 'grid');
    if (listViewBtn) listViewBtn.classList.toggle('active', view === 'list');

    // Update grid class and display
    const grid = document.getElementById("booksGrid");
    if (grid) {
        grid.className = `books-grid ${view === 'list' ? 'list-view' : ''}`;
        grid.style.display = view === 'list' ? 'flex' : 'grid';
    }
}

function updateBooksStatsText(total, searchTerm = '') {
    const booksCount = document.getElementById('booksCount');
    if (!booksCount) return;

    const selectedClass = document.getElementById('classFilter') ? document.getElementById('classFilter').value : '';
    const selectedSubject = document.getElementById('subjectFilter') ? document.getElementById('subjectFilter').value : '';

    let statusText = `${total} books`;
    if (searchTerm) {
        statusText = `${total} book${total === 1 ? '' : 's'} found for "${searchTerm}"`;
    } else if (selectedClass || selectedSubject) {
        statusText += ' found';
        if (selectedClass) statusText += ` for Class ${selectedClass}`;
        if (selectedSubject) statusText += ` in ${selectedSubject}`;
    }
    booksCount.textContent = statusText;

    const currentPageSpan = document.getElementById('currentPage');
    if (currentPageSpan) currentPageSpan.textContent = '';
}

function updateBooksStats(searchTerm = '') {
    updateBooksStatsText(infiniteScrollTotalBooks || totalBooks, searchTerm);
}

// Utility function for debouncing search
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/* ------------------------------
   DYNAMIC 3D HERO BOOK UPDATER
--------------------------------*/
function updateHeroBooks(books) {
    if (!books || !Array.isArray(books) || books.length === 0) return;

    // Filter books with valid cover images
    const lbaBooks = books.filter(b => b.cover_image && b.cover_image.trim() !== '');
    if (lbaBooks.length === 0) return;

    // 1. Select Main Center Book: Preferably Mathematics
    let mainBook = lbaBooks.find(b => 
        (b.title && b.title.toUpperCase().includes('MATH')) || 
        (b.subject && b.subject.toUpperCase().includes('MATH'))
    );
    if (!mainBook) mainBook = lbaBooks[0];

    // Remaining supporting books
    const remainingBooks = lbaBooks.filter(b => String(b._id || b.id) !== String(mainBook._id || mainBook.id));

    // Helper to find specific subject book or fallback
    const getSubjectBook = (subjectKeyword, excludeIds) => {
        let match = remainingBooks.find(b => {
            const bId = String(b._id || b.id);
            if (excludeIds.includes(bId)) return false;
            const text = `${b.title || ''} ${b.subject || ''}`.toUpperCase();
            return text.includes(subjectKeyword);
        });
        if (!match) {
            match = remainingBooks.find(b => !excludeIds.includes(String(b._id || b.id)));
        }
        return match;
    };

    const usedIds = [String(mainBook._id || mainBook.id)];

    const scienceBook = getSubjectBook('SCIENCE', usedIds);
    if (scienceBook) usedIds.push(String(scienceBook._id || scienceBook.id));

    const socialBook = getSubjectBook('SOCIAL', usedIds);
    if (socialBook) usedIds.push(String(socialBook._id || socialBook.id));

    const hindiBook = getSubjectBook('HINDI', usedIds);
    if (hindiBook) usedIds.push(String(hindiBook._id || hindiBook.id));

    const kannadaBook = getSubjectBook('KANNADA', usedIds);
    if (kannadaBook) usedIds.push(String(kannadaBook._id || kannadaBook.id));

    // Update 3D Stage Covers & Alt Texts
    const primaryImg = document.getElementById('heroImgPrimary');
    if (primaryImg && mainBook.cover_image) {
        primaryImg.src = mainBook.cover_image;
        primaryImg.alt = mainBook.title || 'Mathematics Textbook Cover';
    }

    const rearLeftImg = document.getElementById('heroImgRearLeft');
    if (rearLeftImg && scienceBook && scienceBook.cover_image) {
        rearLeftImg.src = scienceBook.cover_image;
        rearLeftImg.alt = scienceBook.title || 'Science Textbook Cover';
    }

    const backLeftImg = document.getElementById('heroImgBackLeft');
    if (backLeftImg && socialBook && socialBook.cover_image) {
        backLeftImg.src = socialBook.cover_image;
        backLeftImg.alt = socialBook.title || 'Social Science Textbook Cover';
    }

    const backRightImg = document.getElementById('heroImgBackRight');
    if (backRightImg && hindiBook && hindiBook.cover_image) {
        backRightImg.src = hindiBook.cover_image;
        backRightImg.alt = hindiBook.title || 'Hindi Textbook Cover';
    }

    const rearRightImg = document.getElementById('heroImgRearRight');
    if (rearRightImg && kannadaBook && kannadaBook.cover_image) {
        rearRightImg.src = kannadaBook.cover_image;
        rearRightImg.alt = kannadaBook.title || 'Kannada Textbook Cover';
    }

    // Dynamic Year Badge (if year string exists in data e.g. 2026-27 or 2025-26)
    const yearPattern = /(20\d{2}[-\/]\d{2,4})/;
    let detectedYear = null;
    for (const b of books) {
        const textToSearch = `${b.title || ''} ${b.description || ''}`;
        const match = textToSearch.match(yearPattern);
        if (match) {
            detectedYear = match[1];
            break;
        }
    }

    const editionLabel = document.getElementById('heroEditionLabel');
    const editionTitle = document.getElementById('heroEditionTitle');
    if (editionLabel && editionTitle) {
        if (detectedYear) {
            editionLabel.textContent = `${detectedYear} Edition`;
            editionTitle.textContent = 'Current Edition';
        } else {
            const classVal = mainBook.class || '10';
            editionLabel.textContent = `Class ${classVal} Syllabus`;
            editionTitle.textContent = 'Current Edition';
        }
    }
}

// Global exposures for navigation and inline calls
window.performSearch = performSearch;
window.displaySearchResults = displaySearchResults;
window.filterAndDisplayBooks = filterAndDisplayBooks;
window.loadBooksWithFilters = loadBooksWithFilters;

