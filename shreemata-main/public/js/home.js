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
let currentView = 'grid';
let homeSettings = { showBundles: true, showFeaturedBooks: true }; // Store home settings

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

            // Populate dynamic Class Container (Adaptive Class 10 Hub or multi-class chips)
            const classChipsContainer = document.getElementById('classChipsContainer');
            if (classChipsContainer) {
                if (classes.length === 1 && classes[0] === '10') {
                    classChipsContainer.innerHTML = `
                        <div class="class-feature-banner">
                            <div class="class-feature-info">
                                <span class="class-feature-pill">Curriculum Spotlight</span>
                                <h3 class="class-feature-title">Everything for Class 10</h3>
                                <p class="class-feature-desc">
                                    Complete official syllabus textbooks, practice workbooks, and discounted all-in-one sets covering Mathematics, Science, Social Science, English, Kannada, and Hindi.
                                </p>
                                <div class="class-feature-badges">
                                    <span class="class-subject-tag">📐 Mathematics</span>
                                    <span class="class-subject-tag">🔬 Science</span>
                                    <span class="class-subject-tag">🌍 Social Science</span>
                                    <span class="class-subject-tag">📖 Languages</span>
                                </div>
                                <div class="class-feature-actions">
                                    <button type="button" class="btn-class-primary" onclick="selectClassChip(this, '10')">Explore Class 10 Books →</button>
                                    <a href="#bundlesSection" class="btn-class-secondary">Buy Complete 10th Set (₹325)</a>
                                </div>
                            </div>
                            <div class="class-feature-visual" aria-hidden="true">
                                <div class="class-book-thumb">
                                    <img src="https://res.cloudinary.com/dbtqqalo2/image/upload/v1766247514/kl2gbelkihjecix4uf11.jpg" alt="Mathematics" loading="lazy">
                                </div>
                                <div class="class-book-thumb">
                                    <img src="https://res.cloudinary.com/dbtqqalo2/image/upload/v1766248060/yvfjzpxleo9yb0fbav6z.jpg" alt="Science" loading="lazy">
                                </div>
                                <div class="class-book-thumb">
                                    <img src="https://res.cloudinary.com/dbtqqalo2/image/upload/v1766250002/rwbfwmpvmmsljwwj2cmq.jpg" alt="Kannada" loading="lazy">
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    classChipsContainer.innerHTML = `
                        <div class="class-chips-scroll">
                            <button type="button" class="class-chip-pill active" data-class="" onclick="selectClassChip(this, '')">All Grades</button>
                            ${classes.map(className => `
                                <button type="button" class="class-chip-pill" data-class="${className}" onclick="selectClassChip(this, '${className}')">Class ${className}</button>
                            `).join('')}
                        </div>
                    `;
                }
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

            // Populate dynamic Subject Cards with Real Book Thumbnails from catalog
            const subjectChipsContainer = document.getElementById('subjectChipsContainer');
            if (subjectChipsContainer) {
                subjectChipsContainer.innerHTML = subjects.map(subject => {
                    const matchingBooks = books.filter(b => b.subject && b.subject.toLowerCase() === subject.toLowerCase());
                    const repBook = matchingBooks[0] || books[0];
                    const minPrice = Math.min(...matchingBooks.map(b => parseFloat(b.price) || 99));
                    return `
                        <div class="subject-real-card" onclick="selectSubjectChip('${subject}')">
                            <div class="subject-thumb-box">
                                <img src="${repBook.cover_image || 'images/press.png'}" alt="${subject}" loading="lazy" />
                            </div>
                            <div class="subject-title">${subject}</div>
                            <div class="subject-meta">${matchingBooks.length} Book${matchingBooks.length > 1 ? 's' : ''} • From ₹${minPrice.toFixed(0)}</div>
                            <span class="subject-explore-link">Explore Subject →</span>
                        </div>
                    `;
                }).join('');
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
    
    for (let i = 0; i < allOffers.length; i++) {
        const dot = document.createElement('div');
        dot.className = `dropup-dot ${i === currentOfferIndex ? 'active' : ''}`;
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

/* ------------------------------
   LOAD BOOKS WITH FILTERS
--------------------------------*/
async function loadBooksWithFilters({ page = 1, limit = 1000, category, minPrice, maxPrice, search } = {}) {
    const loadingSpinner = document.getElementById("loadingSpinner");
    const booksGrid = document.getElementById("booksGrid");

    if (booksGrid && (!allBooks || allBooks.length === 0)) {
        booksGrid.style.display = "grid";
        booksGrid.innerHTML = `
            <div class="skeleton-card"><div class="skeleton-thumb"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>
            <div class="skeleton-card"><div class="skeleton-thumb"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>
            <div class="skeleton-card"><div class="skeleton-thumb"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>
            <div class="skeleton-card"><div class="skeleton-thumb"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>
        `;
    }

    const qs = new URLSearchParams();
    qs.set("page", page);
    qs.set("limit", limit);
    if (category) qs.set("category", category);
    if (minPrice) qs.set("minPrice", minPrice);
    if (maxPrice) qs.set("maxPrice", maxPrice);
    if (search) qs.set("search", search);

    try {
        const res = await fetch(`${API_URL}/books?${qs.toString()}`);
        const data = await res.json();

        if (loadingSpinner) loadingSpinner.style.display = "none";

        if (data.books && Array.isArray(data.books)) {
            allBooks = data.books;

            // Check if there is an active search query from input or URL
            const searchInput = document.getElementById("searchInput");
            const currentSearch = search !== undefined ? search : (searchInput ? searchInput.value.trim() : '');
            const selectedClass = document.getElementById('classFilter') ? document.getElementById('classFilter').value : '';
            const selectedSubject = document.getElementById('subjectFilter') ? document.getElementById('subjectFilter').value : '';

            if (currentSearch || selectedClass || selectedSubject) {
                filterAndDisplayBooks(selectedClass, selectedSubject, currentSearch);
            } else {
                filteredBooks = [...allBooks];
                totalBooks = allBooks.length;
                currentPage = 1;
                displayPaginatedBooks();
                updatePaginationUI();
                updateBooksStats();
            }
        } else {
            filteredBooks = [];
            totalBooks = 0;
            if (booksGrid) booksGrid.style.display = 'none';
            const emptyState = document.getElementById('emptyState');
            if (emptyState) emptyState.style.display = 'block';
        }

    } catch (err) {
        console.error("Error loading books:", err);
        if (loadingSpinner) loadingSpinner.style.display = "none";
        if (booksGrid) booksGrid.style.display = 'none';
        const emptyState = document.getElementById('emptyState');
        if (emptyState) emptyState.style.display = 'block';
    }
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
        
        if (book.cashbackAmount > 0) {
            cashbackAmount = book.cashbackAmount;
        } else if (book.cashbackPercentage > 0) {
            cashbackAmount = (book.price * book.cashbackPercentage) / 100;
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

    card.innerHTML = `
        <div class="book-image-container">
            <img src="${coverImage}" class="book-cover" />
            ${stockOverlay}
            ${cashbackSticker}
        </div>
        <h3>${book.title}</h3>
        <p class="book-author">by ${book.author}</p>
        <p class="book-price">₹${parseFloat(book.price).toFixed(2)}</p>
        ${pointsBadge}
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

    filteredBooks = [...books];
    totalBooks = filteredBooks.length;
    currentPage = 1;

    displayPaginatedBooks();
    updatePaginationUI();
    updateBooksStats(searchTerm);
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

        let cart = getCart();

        // Check if bundle already in cart
        if (cart.find(item => item.bundleId === bundleId)) {
            return alert("This bundle is already in your cart!");
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
        alert(`Bundle "${bundle.name}" added to cart!`);
        
        // Update cart count if exists
        updateCartCount();
    } catch (err) {
        console.error("Error adding bundle to cart:", err);
        alert("Error adding bundle to cart");
    }
}

function updateCartCount() {
    const cart = getCart();
    const cartCount = document.getElementById("cartCount");
    if (cartCount) {
        cartCount.textContent = cart.length;
    }
}

/* ------------------------------
   ADD TO CART
--------------------------------*/
document.addEventListener("click", (e) => {
    if (e.target.classList.contains("cart-btn")) {
        // Check if button is disabled (out of stock)
        if (e.target.disabled) {
            alert("This book is currently out of stock!");
            return;
        }

        const bookId = e.target.dataset.id;
        const card = e.target.closest(".book-card");

        const title = card.querySelector("h3").textContent;
        const author = card.querySelector(".book-author").textContent.replace("by ", "");
        const price = parseFloat(card.querySelector(".book-price").textContent.replace("₹", "").split("🎁")[0].trim());
        const coverImage = card.querySelector("img").src;

        let cart = getCart();

        if (cart.find((item) => item.id === bookId)) {
            return alert("Already in cart!");
        }

        // Additional stock validation by checking the book data
        const book = allBooks.find(b => b._id === bookId);
        if (book && book.trackStock && book.stockStatus === 'out_of_stock') {
            alert("This book is currently out of stock!");
            return;
        }

        cart.push({ id: bookId, title, author, price, coverImage, quantity: 1 });
        saveCart(cart);
        updateCartCount();
        
        // Show success message with cart count
        const cartCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
        alert(`✅ "${title}" added to cart!\n\nCart now has ${cartCount} item${cartCount > 1 ? 's' : ''}.`);
    }
});

/* ------------------------------
   ENHANCED PAGINATION & FILTERING
--------------------------------*/

function setupPaginationControls() {
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
        gridViewBtn.addEventListener('click', () => switchView('grid'));
        listViewBtn.addEventListener('click', () => switchView('list'));
    }
    
    // Pagination controls
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    
    if (prevBtn) prevBtn.addEventListener('click', () => changePage(currentPage - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => changePage(currentPage + 1));
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', loadMoreBooks);
}

function handleFilters() {
    const selectedClass = document.getElementById('classFilter') ? document.getElementById('classFilter').value : '';
    const selectedSubject = document.getElementById('subjectFilter') ? document.getElementById('subjectFilter').value : '';
    const searchInput = document.getElementById("searchInput");
    const searchTerm = searchInput ? searchInput.value.trim() : '';
    filterAndDisplayBooks(selectedClass, selectedSubject, searchTerm);
}

function filterAndDisplayBooks(selectedClass = '', selectedSubject = '', searchTerm = '') {
    if (!searchTerm) {
        const searchInput = document.getElementById("searchInput");
        if (searchInput) searchTerm = searchInput.value.trim();
    }
    
    const lowerTerm = searchTerm ? searchTerm.toLowerCase() : '';
    
    filteredBooks = allBooks.filter(book => {
        const matchesClass = !selectedClass || 
            (book.class && book.class.toString() === selectedClass);
            
        const matchesSubject = !selectedSubject || 
            (book.subject && book.subject.toLowerCase() === selectedSubject.toLowerCase());
            
        let matchesSearch = true;
        if (lowerTerm) {
            const title = (book.title || '').toLowerCase();
            const author = (book.author || '').toLowerCase();
            const subject = (book.subject || '').toLowerCase();
            const bookClass = (book.class || '').toString().toLowerCase();
            const desc = (book.description || '').toLowerCase();
            const cat = (book.category || '').toLowerCase();
            matchesSearch = title.includes(lowerTerm) || 
                            author.includes(lowerTerm) || 
                            subject.includes(lowerTerm) || 
                            bookClass.includes(lowerTerm) || 
                            desc.includes(lowerTerm) || 
                            cat.includes(lowerTerm);
        }
        
        return matchesClass && matchesSubject && matchesSearch;
    });
    
    totalBooks = filteredBooks.length;
    currentPage = 1;
    displayPaginatedBooks();
    updatePaginationUI();
    updateBooksStats(searchTerm);
}

function displayPaginatedBooks() {
    const startIndex = (currentPage - 1) * booksPerPage;
    const endIndex = startIndex + booksPerPage;
    const booksToShow = filteredBooks.slice(startIndex, endIndex);
    
    const grid = document.getElementById("booksGrid");
    grid.className = `books-grid ${currentView === 'list' ? 'list-view' : ''}`;
    
    if (booksToShow.length === 0) {
        document.getElementById('emptyState').style.display = 'block';
        grid.style.display = 'none';
        document.getElementById('paginationContainer').style.display = 'none';
    } else {
        document.getElementById('emptyState').style.display = 'none';
        grid.style.display = 'grid';
        document.getElementById('paginationContainer').style.display = 'block';
        
        grid.innerHTML = "";
        booksToShow.forEach((book) => {
            grid.appendChild(createBookCard(book));
        });
    }
}

function changePage(newPage) {
    const totalPages = Math.ceil(totalBooks / booksPerPage);
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        displayPaginatedBooks();
        updatePaginationUI();
        
        // Smooth scroll to top of books section
        document.querySelector('.books-section').scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
    }
}

function updatePaginationUI() {
    const totalPages = Math.ceil(totalBooks / booksPerPage);
    
    // Update pagination info
    const paginationInfo = document.getElementById('paginationInfo');
    if (paginationInfo) {
        const startItem = (currentPage - 1) * booksPerPage + 1;
        const endItem = Math.min(currentPage * booksPerPage, totalBooks);
        paginationInfo.textContent = `Showing ${startItem}-${endItem} of ${totalBooks} books`;
    }
    
    // Update current page indicator
    const currentPageSpan = document.getElementById('currentPage');
    if (currentPageSpan) {
        currentPageSpan.textContent = totalPages > 1 ? `Page ${currentPage} of ${totalPages}` : '';
    }
    
    // Update prev/next buttons
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    
    // Update page numbers
    updatePageNumbers(totalPages);
    
    // Show/hide load more button
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.style.display = currentPage < totalPages ? 'block' : 'none';
    }
}

function updatePageNumbers(totalPages) {
    const pageNumbersContainer = document.getElementById('pageNumbers');
    if (!pageNumbersContainer) return;
    
    pageNumbersContainer.innerHTML = '';
    
    if (totalPages <= 1) return;
    
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    // Adjust start page if we're near the end
    if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    // Add first page and ellipsis if needed
    if (startPage > 1) {
        addPageNumber(1);
        if (startPage > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            ellipsis.className = 'page-ellipsis';
            pageNumbersContainer.appendChild(ellipsis);
        }
    }
    
    // Add visible page numbers
    for (let i = startPage; i <= endPage; i++) {
        addPageNumber(i);
    }
    
    // Add last page and ellipsis if needed
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            ellipsis.className = 'page-ellipsis';
            pageNumbersContainer.appendChild(ellipsis);
        }
        addPageNumber(totalPages);
    }
}

function addPageNumber(pageNum) {
    const pageNumbersContainer = document.getElementById('pageNumbers');
    const pageBtn = document.createElement('button');
    pageBtn.textContent = pageNum;
    pageBtn.className = `page-number ${pageNum === currentPage ? 'active' : ''}`;
    pageBtn.addEventListener('click', () => changePage(pageNum));
    pageNumbersContainer.appendChild(pageBtn);
}

function loadMoreBooks() {
    const totalPages = Math.ceil(totalBooks / booksPerPage);
    if (currentPage < totalPages) {
        changePage(currentPage + 1);
    }
}

function switchView(view) {
    currentView = view;
    
    // Update button states
    document.getElementById('gridView').classList.toggle('active', view === 'grid');
    document.getElementById('listView').classList.toggle('active', view === 'list');
    
    // Update grid class
    const grid = document.getElementById("booksGrid");
    grid.className = `books-grid ${view === 'list' ? 'list-view' : ''}`;
}

function updateBooksStats(searchTerm = '') {
    const booksCount = document.getElementById('booksCount');
    if (booksCount) {
        const selectedClass = document.getElementById('classFilter') ? document.getElementById('classFilter').value : '';
        const selectedSubject = document.getElementById('subjectFilter') ? document.getElementById('subjectFilter').value : '';
        if (!searchTerm) {
            const searchInput = document.getElementById("searchInput");
            if (searchInput) searchTerm = searchInput.value.trim();
        }
        
        let statusText = `${totalBooks} books`;
        
        if (searchTerm) {
            statusText = `${totalBooks} book${totalBooks === 1 ? '' : 's'} found for "${searchTerm}"`;
        } else if (selectedClass || selectedSubject) {
            statusText += ' found';
            if (selectedClass) statusText += ` for Class ${selectedClass}`;
            if (selectedSubject) statusText += ` in ${selectedSubject}`;
        }
        
        booksCount.textContent = statusText;
    }
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

// Global exposures for navigation and inline calls
window.performSearch = performSearch;
window.displaySearchResults = displaySearchResults;
window.filterAndDisplayBooks = filterAndDisplayBooks;
window.loadBooksWithFilters = loadBooksWithFilters;

