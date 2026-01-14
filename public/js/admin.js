const API = window.API_URL;

let isEditMode = false;
let editingBookId = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log('🔍 Admin.js loaded - API URL:', API);
    console.log('🔍 window.API_URL:', window.API_URL);
    console.log('🔍 window.location.origin:', window.location.origin);
    
    checkAdminAuth();
    loadClassesAndSubjectsForFilters();
    loadBooks();
    setupEventListeners();
    initializeStockFields(); // Initialize stock fields
});

/* AUTH CHECK */
function checkAdminAuth() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || 'null');

    if (!token || !user || user.role !== 'admin') {
        alert('Admin access required');
        window.location.href = '/login.html';
        return;
    }

    document.getElementById('userName').textContent = `Hello, ${user.name}`;
}

/* LOAD CLASSES AND SUBJECTS FOR ADMIN FILTERS */
async function loadClassesAndSubjectsForFilters() {
    try {
        console.log('Admin: Loading classes and subjects for filters...');
        const response = await fetch(`${API}/books`);
        const data = await response.json();
        
        console.log('Admin: Books data received:', data);
        
        if (data.books && Array.isArray(data.books)) {
            const books = data.books;
            console.log('Admin: Sample book data:', books[0]);
            
            // Extract unique classes and subjects
            const classes = [...new Set(books.map(book => book.class).filter(Boolean))].sort((a, b) => a - b);
            const subjects = [...new Set(books.map(book => book.subject).filter(Boolean))].sort();
            
            console.log('Admin: Extracted classes:', classes);
            console.log('Admin: Extracted subjects:', subjects);
            
            // Populate admin class filter
            const adminClassFilter = document.getElementById('adminFilterClass');
            console.log('Admin: Class filter element:', adminClassFilter);
            if (adminClassFilter) {
                try {
                    // Clear existing options first (except the default)
                    adminClassFilter.innerHTML = '<option value="">All Classes</option>';
                    classes.forEach(className => {
                        const option = document.createElement('option');
                        option.value = className;
                        option.textContent = `Class ${className}`;
                        adminClassFilter.appendChild(option);
                    });
                    console.log(`Admin: Added ${classes.length} class options`);
                } catch (err) {
                    console.error('Error populating class filter:', err);
                }
            } else {
                console.warn('Admin: Class filter element not found');
            }
            
            // Populate admin subject filter
            const adminSubjectFilter = document.getElementById('adminFilterSubject');
            console.log('Admin: Subject filter element:', adminSubjectFilter);
            if (adminSubjectFilter) {
                try {
                    // Clear existing options first (except the default)
                    adminSubjectFilter.innerHTML = '<option value="">All Subjects</option>';
                    subjects.forEach(subject => {
                        const option = document.createElement('option');
                        option.value = subject;
                        option.textContent = subject;
                        adminSubjectFilter.appendChild(option);
                    });
                    console.log(`Admin: Added ${subjects.length} subject options`);
                } catch (err) {
                    console.error('Error populating subject filter:', err);
                }
            } else {
                console.warn('Admin: Subject filter element not found');
            }
            
            console.log(`Admin: Successfully loaded ${classes.length} classes and ${subjects.length} subjects`);
        } else {
            console.log('Admin: No books data found or invalid format');
        }
    } catch (err) {
        console.error("Error loading classes and subjects for admin filters:", err);
    }
}

/* EVENT LISTENERS */
function setupEventListeners() {
    // Add null checks for all elements before adding event listeners
    const logoutBtn = document.getElementById('logoutBtn');
    const toggleFormBtn = document.getElementById('toggleFormBtn');
    const bookForm = document.getElementById('bookForm');
    const cancelBtn = document.getElementById('cancelBtn');
    const previewImages = document.getElementById('previewImages');
    const trackStock = document.getElementById('trackStock');
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    } else {
        console.warn('Admin: logoutBtn element not found');
    }
    
    if (toggleFormBtn) {
        toggleFormBtn.addEventListener('click', toggleForm);
    } else {
        console.warn('Admin: toggleFormBtn element not found');
    }
    
    if (bookForm) {
        bookForm.addEventListener('submit', handleFormSubmit);
    } else {
        console.warn('Admin: bookForm element not found');
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', resetForm);
    } else {
        console.warn('Admin: cancelBtn element not found');
    }

    if (previewImages) {
        previewImages.addEventListener('change', (e) => {
            // No limit on preview images - removed the 4 image limit
            console.log(`📷 Selected ${e.target.files.length} preview images`);
        });
    } else {
        console.warn('Admin: previewImages element not found');
    }

    // Stock tracking toggle
    if (trackStock) {
        trackStock.addEventListener('change', (e) => {
            const stockFields = document.getElementById('stockFields');
            const stockQuantity = document.getElementById('stockQuantity');
            const lowStockThreshold = document.getElementById('lowStockThreshold');
            
            if (e.target.checked) {
                stockFields.style.display = 'flex';
                stockQuantity.required = true;
            } else {
                stockFields.style.display = 'none';
                stockQuantity.required = false;
                // Set default values for unlimited stock
                stockQuantity.value = 999999;
                lowStockThreshold.value = 0;
            }
        });
    } else {
        console.warn('Admin: trackStock element not found');
    }

    // Auto-calculate online price when physical price changes
    const priceInput = document.getElementById('price');
    if (priceInput) {
        priceInput.addEventListener('input', (e) => {
            const physicalPrice = parseFloat(e.target.value) || 0;
            // Remove digital content auto-calculation
        });
    }

    // Auto-update stock status based on quantity
    const stockQuantityInput = document.getElementById('stockQuantity');
    if (stockQuantityInput) {
        stockQuantityInput.addEventListener('input', (e) => {
            const quantity = parseInt(e.target.value) || 0;
            const threshold = parseInt(document.getElementById('lowStockThreshold').value) || 5;
            const stockStatusEl = document.getElementById('stockStatus');
            
            if (quantity === 0) {
                stockStatusEl.value = 'out_of_stock';
            } else if (quantity <= threshold) {
                stockStatusEl.value = 'limited_stock';
            } else {
                stockStatusEl.value = 'in_stock';
            }
            
            console.log('📦 Auto-updated stock status:', stockStatusEl.value, 'for quantity:', quantity);
        });
    }

    document.getElementById("adminApplyFilter").addEventListener("click", () => {
        const filters = {
            class: document.getElementById("adminFilterClass").value,
            subject: document.getElementById("adminFilterSubject").value,
            search: document.getElementById("adminFilterSearch").value,
            minPrice: document.getElementById("adminFilterMin").value,
            maxPrice: document.getElementById("adminFilterMax").value
        };
        loadBooks(filters);
    });

    // Refresh books button
    document.getElementById("refreshBooksBtn").addEventListener("click", () => {
        console.log('🔄 Manual refresh triggered');
        loadBooks();
    });

    document.getElementById('booksTableBody').addEventListener('click', (e) => {
        const edit = e.target.closest('.edit-btn');
        const del = e.target.closest('.delete-btn');

        if (edit) editBook(edit.dataset.id);
        if (del) deleteBook(del.dataset.id);
    });
}

/* LOGOUT */
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
}

/* TOGGLE FORM */
function toggleForm() {
    const form = document.getElementById('addBookForm');
    const toggleBtn = document.getElementById('toggleFormBtn');
    
    const isHidden = form.style.display === 'none' || form.style.display === '';
    form.style.display = isHidden ? 'block' : 'none';
    toggleBtn.textContent = isHidden ? 'Hide Form' : 'Show Form';

    if (!isHidden) resetForm();
}

/* LOAD BOOKS */
async function loadBooks(filters = {}) {
    try {
        let qs = new URLSearchParams(filters).toString();
        const loading = document.getElementById('loadingSpinner');
        const table = document.getElementById('booksTable');
        const empty = document.getElementById('emptyState');

        console.log('Loading books with filters:', filters);
        console.log('API URL:', `${API}/books?${qs}`);

        const res = await fetch(`${API}/books?${qs}`);
        
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        const data = await res.json();
        console.log('Books loaded:', data);

        loading.style.display = 'none';

        if (data.books && data.books.length) {
            displayBooks(data.books);
            table.style.display = 'block';
            empty.style.display = 'none';
        } else {
            table.style.display = 'none';
            empty.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading books:', error);
        const loading = document.getElementById('loadingSpinner');
        const table = document.getElementById('booksTable');
        const empty = document.getElementById('emptyState');
        
        loading.style.display = 'none';
        table.style.display = 'none';
        empty.style.display = 'block';
        
        // Show error message
        const emptyState = document.getElementById('emptyState');
        if (emptyState) {
            emptyState.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #dc3545;">
                    <h3>Error Loading Books</h3>
                    <p>${error.message}</p>
                    <button class="btn" onclick="loadBooks()">Try Again</button>
                </div>
            `;
        }
    }
}

/* DISPLAY BOOKS */
function displayBooks(books) {
    const tbody = document.getElementById('booksTableBody');
    const mobileContainer = document.getElementById('mobileBooksContainer');
    tbody.innerHTML = '';
    mobileContainer.innerHTML = '';

    books.forEach(book => {
        // Debug: Log stock data for each book
        console.log(`📦 Book: ${book.title}`, {
            trackStock: book.trackStock,
            stockQuantity: book.stockQuantity,
            stockStatus: book.stockStatus,
            lowStockThreshold: book.lowStockThreshold
        });
        
        // Get stock status display
        const getStockStatusDisplay = (book) => {
            if (!book.trackStock) return '<span style="color: #28a745; font-weight: 600;">✅ Available</span>';
            
            const quantity = book.stockQuantity || 0;
            const threshold = book.lowStockThreshold || 5;
            
            switch (book.stockStatus) {
                case 'out_of_stock':
                    return '<span style="color: #dc3545; font-weight: 600;">❌ Out of Stock</span>';
                case 'limited_stock':
                    return `<span style="color: #ffc107; font-weight: 600;">⚠️ Limited (${quantity})</span>`;
                case 'in_stock':
                    if (quantity <= threshold) {
                        return `<span style="color: #ffc107; font-weight: 600;">⚠️ Low Stock (${quantity})</span>`;
                    }
                    return `<span style="color: #28a745; font-weight: 600;">✅ In Stock (${quantity})</span>`;
                default:
                    return `<span style="color: #28a745; font-weight: 600;">✅ Available (${quantity})</span>`;
            }
        };

        // Desktop table row
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><img src="${book.cover_image}" width="50"/></td>
            <td>${book.title}</td>
            <td>${book.author}</td>
            <td>${book.class ? `Class ${book.class}` : 'N/A'}</td>
            <td>${book.subject || 'N/A'}</td>
            <td>₹${parseFloat(book.price).toFixed(2)}</td>
            <td>${getStockStatusDisplay(book)}</td>
            <td>
                <button class="btn-secondary edit-btn" data-id="${book._id}">Edit</button>
                <button class="btn-danger delete-btn" data-id="${book._id}">Delete</button>
            </td>
        `;
        tbody.appendChild(row);

        // Mobile card
        const card = document.createElement('div');
        card.className = 'mobile-book-card';
        card.innerHTML = `
            <div class="mobile-book-header">
                <img src="${book.cover_image}" class="mobile-book-cover" alt="${book.title}">
                <div class="mobile-book-info">
                    <h3>${book.title}</h3>
                    <p><strong>Author:</strong> ${book.author}</p>
                    <p><strong>Class:</strong> ${book.class ? `Class ${book.class}` : 'N/A'}</p>
                    <p><strong>Subject:</strong> ${book.subject || 'N/A'}</p>
                    <div class="mobile-book-price">₹${parseFloat(book.price).toFixed(2)}</div>
                    <div style="margin-top: 8px;">${getStockStatusDisplay(book)}</div>
                </div>
            </div>
            <div class="mobile-book-actions">
                <button class="btn btn-secondary edit-btn" data-id="${book._id}">✏️ Edit</button>
                <button class="btn btn-danger delete-btn" data-id="${book._id}">🗑️ Delete</button>
            </div>
        `;
        mobileContainer.appendChild(card);
    });

    // Add event listeners for mobile cards using event delegation
    mobileContainer.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        
        if (editBtn) {
            e.preventDefault();
            e.stopPropagation();
            editBook(editBtn.dataset.id);
        }
        if (deleteBtn) {
            e.preventDefault();
            e.stopPropagation();
            deleteBook(deleteBtn.dataset.id);
        }
    });
}

/* EDIT BOOK */
async function editBook(bookId) {
    console.log('📝 Edit book called with ID:', bookId);
    console.log('📝 ID type:', typeof bookId);
    console.log('📝 ID length:', bookId ? bookId.length : 'null');
    
    try {
        const res = await fetch(`${API}/books/${bookId}`);
        console.log('📝 Fetch book response status:', res.status);
        
        if (!res.ok) {
            console.error('❌ Failed to fetch book for editing:', res.status, res.statusText);
            alert(`Failed to load book for editing: ${res.status} ${res.statusText}`);
            return;
        }
        
        const data = await res.json();
        console.log('📝 Book data received:', data);

        const book = data.book;

        isEditMode = true;
        editingBookId = bookId;
        
        console.log('📝 Setting edit mode - bookId:', editingBookId);

        const titleEl = document.getElementById('title');
        const authorEl = document.getElementById('author');
        const priceEl = document.getElementById('price');
        const weightEl = document.getElementById('weight');
        const rewardPointsEl = document.getElementById('rewardPoints');
        const cashbackAmountEl = document.getElementById('cashbackAmount');
        const cashbackPercentageEl = document.getElementById('cashbackPercentage');
        const descriptionEl = document.getElementById('description');
        const bookClassEl = document.getElementById('bookClass');
        const subjectEl = document.getElementById('subject');
        
        // Stock management elements
        const trackStockEl = document.getElementById('trackStock');
        const stockQuantityEl = document.getElementById('stockQuantity');
        const lowStockThresholdEl = document.getElementById('lowStockThreshold');
        const stockStatusEl = document.getElementById('stockStatus');
        const stockFieldsEl = document.getElementById('stockFields');
        
        if (titleEl) titleEl.value = book.title;
        if (authorEl) authorEl.value = book.author;
        if (priceEl) priceEl.value = book.price;
        if (weightEl) weightEl.value = book.weight || 0.5;
        if (rewardPointsEl) rewardPointsEl.value = book.rewardPoints || 0;
        if (cashbackAmountEl) cashbackAmountEl.value = book.cashbackAmount || 0;
        if (cashbackPercentageEl) cashbackPercentageEl.value = book.cashbackPercentage || 0;
        if (descriptionEl) descriptionEl.value = book.description;
        if (bookClassEl) bookClassEl.value = book.class || '';
        if (subjectEl) subjectEl.value = book.subject || '';

        // Populate stock fields
        if (trackStockEl) {
            trackStockEl.checked = book.trackStock !== false; // Default to true if undefined
            console.log('📦 Set trackStock checkbox to:', trackStockEl.checked);
        }
        if (stockQuantityEl) {
            stockQuantityEl.value = book.stockQuantity || 10;
            console.log('📦 Set stockQuantity to:', stockQuantityEl.value);
        }
        if (lowStockThresholdEl) {
            lowStockThresholdEl.value = book.lowStockThreshold || 5;
            console.log('📦 Set lowStockThreshold to:', lowStockThresholdEl.value);
        }
        if (stockStatusEl) {
            stockStatusEl.value = book.stockStatus || 'in_stock';
            console.log('📦 Set stockStatus to:', stockStatusEl.value);
        }
        
        // Show/hide stock fields based on trackStock
        if (stockFieldsEl && trackStockEl) {
            stockFieldsEl.style.display = trackStockEl.checked ? 'flex' : 'none';
            console.log('📦 Stock fields visibility:', trackStockEl.checked ? 'visible' : 'hidden');
        }

        document.getElementById('addBookForm').style.display = "block";
        document.getElementById('toggleFormBtn').textContent = "Hide Form";
        document.getElementById('submitBtn').textContent = "Update Book";
        
        console.log('📝 Edit form populated and shown');
    } catch (error) {
        console.error('❌ Error in editBook:', error);
        alert(`Error loading book for editing: ${error.message}`);
    }
}

/* DELETE BOOK */
let isDeleting = false; // Flag to prevent multiple deletions

async function deleteBook(bookId) {
    // Prevent multiple simultaneous deletions
    if (isDeleting) {
        console.log('🚫 Delete already in progress, ignoring duplicate call');
        return;
    }
    
    if (!confirm("Are you sure you want to delete this book?")) return;

    isDeleting = true; // Set flag to prevent multiple calls
    const token = localStorage.getItem('token');

    try {
        console.log(`🗑️ Attempting to delete book with ID: ${bookId}`);
        console.log(`📡 DELETE request to: ${API}/books/${bookId}`);
        
        const res = await fetch(`${API}/books/${bookId}`, {
            method: "DELETE",
            headers: { 
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        console.log(`📡 Delete response status: ${res.status}`);
        
        if (res.ok) {
            const data = await res.json();
            console.log('✅ Book deleted successfully:', data);
            alert("Book deleted successfully!");
            loadBooks(); // Reload the books list
        } else {
            const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
            console.error('❌ Delete failed:', errorData);
            alert(`Failed to delete book: ${errorData.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('❌ Delete request failed:', error);
        alert(`Error deleting book: ${error.message}`);
    } finally {
        isDeleting = false; // Reset flag when done
    }
}

/* SUBMIT FORM */
async function handleFormSubmit(e) {
    e.preventDefault();

    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;

    try {
        // Get form data with comprehensive null checks
        console.log('🔍 Checking form elements...');
        
        const titleEl = document.getElementById('title');
        const authorEl = document.getElementById('author');
        const priceEl = document.getElementById('price');
        const descriptionEl = document.getElementById('description');
        const bookClassEl = document.getElementById('bookClass');
        const subjectEl = document.getElementById('subject');
        
        console.log('Form elements found:');
        console.log('Title element:', titleEl ? '✅' : '❌');
        console.log('Author element:', authorEl ? '✅' : '❌');
        console.log('Price element:', priceEl ? '✅' : '❌');
        console.log('Description element:', descriptionEl ? '✅' : '❌');
        console.log('BookClass element:', bookClassEl ? '✅' : '❌');
        console.log('Subject element:', subjectEl ? '✅' : '❌');
        
        if (!titleEl) throw new Error('Title field not found');
        if (!authorEl) throw new Error('Author field not found');
        if (!priceEl) throw new Error('Price field not found');
        if (!bookClassEl) throw new Error('Class field not found');
        if (!subjectEl) throw new Error('Subject field not found');
        
        const title = titleEl.value;
        const author = authorEl.value;
        const price = priceEl.value;
        const description = descriptionEl ? descriptionEl.value : '';
        const bookClass = bookClassEl.value;
        const subject = subjectEl.value;
        
        console.log('Form data being submitted:');
        console.log('Title:', title);
        console.log('Author:', author);
        console.log('Class:', bookClass);
        console.log('Subject:', subject);
        console.log('Price:', price);
        
        const weightEl = document.getElementById('weight');
        const rewardPointsEl = document.getElementById('rewardPoints');
        const cashbackAmountEl = document.getElementById('cashbackAmount');
        const cashbackPercentageEl = document.getElementById('cashbackPercentage');
        
        console.log('Weight element:', weightEl ? '✅' : '❌');
        console.log('RewardPoints element:', rewardPointsEl ? '✅' : '❌');
        console.log('CashbackAmount element:', cashbackAmountEl ? '✅' : '❌');
        console.log('CashbackPercentage element:', cashbackPercentageEl ? '✅' : '❌');
        
        if (!weightEl) throw new Error('Weight field not found');
        if (!rewardPointsEl) throw new Error('Reward points field not found');
        if (!cashbackAmountEl) throw new Error('Cashback amount field not found');
        if (!cashbackPercentageEl) throw new Error('Cashback percentage field not found');
        
        const weight = weightEl.value;
        const rewardPoints = rewardPointsEl.value;
        const cashbackAmount = cashbackAmountEl.value;
        const cashbackPercentage = cashbackPercentageEl.value;

        const coverImageEl = document.getElementById('coverImage');
        const previewImagesEl = document.getElementById('previewImages');
        const digitalPDFEl = document.getElementById('digitalPDF');
        
        console.log('CoverImage element:', coverImageEl ? '✅' : '❌');
        console.log('PreviewImages element:', previewImagesEl ? '✅' : '❌');
        console.log('DigitalPDF element:', digitalPDFEl ? '✅' : '❌');
        
        if (!coverImageEl) throw new Error('Cover image field not found');
        if (!previewImagesEl) throw new Error('Preview images field not found');
        
        const coverFile = coverImageEl.files[0];
        const previewFiles = previewImagesEl.files;

        // Check if cover image is required
        if (!coverFile && !isEditMode) {
            alert('Cover image is required');
            return;
        }

        // Use server upload only (direct Cloudinary has CORS issues)
        let useDirectUpload = false;
        let coverImageUrl = '';
        let previewImageUrls = [];

        // Skip direct upload for now due to CORS issues
        console.log('📤 Using server upload (Cloudinary CORS disabled)');

        const token = localStorage.getItem('token');
        const url = isEditMode ? `${API}/books/${editingBookId}` : `${API}/books`;
        const method = isEditMode ? "PUT" : "POST";
        
        console.log('🔍 Debug URL construction:');
        console.log('API variable:', API);
        console.log('isEditMode:', isEditMode);
        console.log('editingBookId:', editingBookId);
        console.log('Final URL:', url);

        let res;

        if (useDirectUpload && coverImageUrl) {
            // Send JSON with Cloudinary URLs
            submitBtn.textContent = 'Saving book...';
            
            // Get stock fields for JSON submission
            const trackStockEl = document.getElementById('trackStock');
            const stockQuantityEl = document.getElementById('stockQuantity');
            const lowStockThresholdEl = document.getElementById('lowStockThreshold');
            const stockStatusEl = document.getElementById('stockStatus');
            
            const bookData = {
                title,
                author,
                price,
                description,
                class: bookClass,
                subject,
                weight,
                rewardPoints,
                cashbackAmount,
                cashbackPercentage,
                cover_image: coverImageUrl,
                preview_images: previewImageUrls,
                // Add stock fields
                trackStock: trackStockEl ? trackStockEl.checked : true,
                stockQuantity: stockQuantityEl ? parseInt(stockQuantityEl.value) || 0 : 10,
                lowStockThreshold: lowStockThresholdEl ? parseInt(lowStockThresholdEl.value) || 5 : 5,
                stockStatus: stockStatusEl ? stockStatusEl.value || 'in_stock' : 'in_stock'
            };

            res = await fetch(url, {
                method,
                headers: { 
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(bookData)
            });
        } else if (coverFile || previewFiles.length > 0) {
            // Server upload via multipart form with compression
            submitBtn.textContent = 'Compressing images...';
            
            console.log('📤 Preparing server upload:', {
                coverFile: coverFile?.name,
                previewFiles: previewFiles.length,
                title, author, price
            });

            // Compress images first
            let compressedCoverFile = null;
            let compressedPreviewFiles = [];

            if (coverFile) {
                console.log('📦 Compressing cover image for Render...');
                // Very aggressive compression for Render to avoid 502 errors
                compressedCoverFile = await window.imageCompressor.compressImage(coverFile, 500, 750, 0.6);
                console.log(`📦 Cover compressed: ${(coverFile.size/1024).toFixed(0)}KB → ${(compressedCoverFile.size/1024).toFixed(0)}KB`);
            }

            if (previewFiles.length > 0) {
                console.log('📦 Compressing preview images for Render...');
                // Strict limit for Render to avoid 502 errors
                const maxPreviewImages = 4; // Reduced to 4 for better reliability
                const filesToCompress = Array.from(previewFiles).slice(0, maxPreviewImages);
                
                if (previewFiles.length > maxPreviewImages) {
                    console.log(`⚠️ Limiting preview images to ${maxPreviewImages} for Render compatibility`);
                    alert(`Only the first ${maxPreviewImages} preview images will be uploaded to avoid server timeout errors.`);
                }
                
                compressedPreviewFiles = [];
                for (let i = 0; i < filesToCompress.length; i++) {
                    const file = filesToCompress[i];
                    console.log(`📦 Compressing preview image ${i + 1}/${filesToCompress.length}...`);
                    const compressed = await window.imageCompressor.compressImage(file, 400, 600, 0.5);
                    console.log(`📦 Preview ${i+1} compressed: ${(file.size/1024).toFixed(0)}KB → ${(compressed.size/1024).toFixed(0)}KB`);
                    compressedPreviewFiles.push(compressed);
                }
                
                const totalSize = compressedPreviewFiles.reduce((sum, f) => sum + f.size, 0) + (compressedCoverFile ? compressedCoverFile.size : 0);
                console.log(`📦 Total upload size: ${(totalSize/1024).toFixed(0)}KB`);
                
                if (totalSize > 3 * 1024 * 1024) { // 3MB total limit
                    alert('Warning: Total file size is large. Upload may take longer.');
                }
            }

            submitBtn.textContent = 'Uploading images to server...';

            const formData = new FormData();
            formData.append('title', title);
            formData.append('author', author);
            formData.append('price', price);
            formData.append('description', description);
            formData.append('class', bookClass);
            formData.append('subject', subject);
            
            console.log('FormData contents:');
            for (let [key, value] of formData.entries()) {
                console.log(key, value);
            }
            formData.append('weight', weight);
            formData.append('rewardPoints', rewardPoints);
            formData.append('cashbackAmount', cashbackAmount);
            formData.append('cashbackPercentage', cashbackPercentage);

            // Add stock management fields
            const trackStockEl = document.getElementById('trackStock');
            const stockQuantityEl = document.getElementById('stockQuantity');
            const lowStockThresholdEl = document.getElementById('lowStockThreshold');
            const stockStatusEl = document.getElementById('stockStatus');
            
            console.log('📦 Stock fields being submitted:', {
                trackStock: trackStockEl ? trackStockEl.checked : 'element not found',
                stockQuantity: stockQuantityEl ? stockQuantityEl.value : 'element not found',
                lowStockThreshold: lowStockThresholdEl ? lowStockThresholdEl.value : 'element not found',
                stockStatus: stockStatusEl ? stockStatusEl.value : 'element not found'
            });
            
            if (trackStockEl) formData.append('trackStock', trackStockEl.checked);
            if (stockQuantityEl) formData.append('stockQuantity', stockQuantityEl.value || 0);
            if (lowStockThresholdEl) formData.append('lowStockThreshold', lowStockThresholdEl.value || 5);
            if (stockStatusEl) formData.append('stockStatus', stockStatusEl.value || 'in_stock');

            if (compressedCoverFile) {
                console.log('📎 Adding compressed cover image:', compressedCoverFile.name, compressedCoverFile.size, 'bytes');
                formData.append('coverImage', compressedCoverFile);
            }
            
            for (let i = 0; i < compressedPreviewFiles.length; i++) {
                console.log('📎 Adding compressed preview image:', compressedPreviewFiles[i].name, compressedPreviewFiles[i].size, 'bytes');
                formData.append('previewImages', compressedPreviewFiles[i]);
            }

            // Note: PDF files are handled separately after book creation/update
            // This prevents memory overload and timeout issues

            console.log('🚀 Sending to:', url);
            console.log('🔍 Method:', method);
            console.log('🔍 Token exists:', !!token);

            // Add timeout for the entire request to detect 502 errors early
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                console.log('⏰ Request timeout - aborting to prevent 502');
                controller.abort();
            }, 25000); // 25 second timeout

            try {
                res = await fetch(url, {
                    method,
                    headers: { "Authorization": `Bearer ${token}` },
                    body: formData,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                console.log('📥 Server response:', res.status, res.statusText);
                
                // Handle 502 Bad Gateway specifically
                if (res.status === 502) {
                    throw new Error('Server timeout (502 Bad Gateway). Try uploading fewer or smaller images.');
                }
                
            } catch (fetchError) {
                clearTimeout(timeoutId);
                
                if (fetchError.name === 'AbortError') {
                    throw new Error('Upload timeout. The server took too long to respond. Try uploading fewer or smaller images.');
                } else if (fetchError.message.includes('502')) {
                    throw new Error('Server overloaded (502 error). Please try again with fewer images or wait a moment.');
                } else {
                    throw fetchError;
                }
            }
        } else if (!isEditMode) {
            // No images and not edit mode
            alert('Please upload a cover image');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add Book';
            return;
        } else {
            // Edit mode without new images
            submitBtn.textContent = 'Saving book...';
            
            // Get stock fields for JSON submission
            const trackStockEl = document.getElementById('trackStock');
            const stockQuantityEl = document.getElementById('stockQuantity');
            const lowStockThresholdEl = document.getElementById('lowStockThreshold');
            const stockStatusEl = document.getElementById('stockStatus');
            
            const bookData = {
                title,
                author,
                price,
                description,
                class: bookClass,
                subject,
                weight,
                rewardPoints,
                cashbackAmount,
                cashbackPercentage,
                // Add stock fields to JSON submission
                trackStock: trackStockEl ? trackStockEl.checked : true,
                stockQuantity: stockQuantityEl ? parseInt(stockQuantityEl.value) || 0 : 10,
                lowStockThreshold: lowStockThresholdEl ? parseInt(lowStockThresholdEl.value) || 5 : 5,
                stockStatus: stockStatusEl ? stockStatusEl.value || 'in_stock' : 'in_stock'
            };
            
        // Validate form data size before submission
        const formDataSize = new Blob([JSON.stringify(bookData)]).size;
        console.log(`📊 Form data size: ${formDataSize} bytes`);
        
        if (formDataSize > 10 * 1024 * 1024) { // 10MB limit
            alert('Form data is too large. Please reduce the amount of data and try again.');
            return;
        }

            res = await fetch(url, {
                method,
                headers: { 
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(bookData)
            });
        }

        // Check if response is JSON
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await res.text();
            console.error('Non-JSON response:', text.substring(0, 200));
            
            // Check if it's a 502 error page
            if (text.includes('502') || text.includes('Bad Gateway') || text.includes('no-js')) {
                alert('Server timeout error (502). This usually happens when uploading large files. Please try:\n\n1. Upload fewer preview images (max 3-4)\n2. Use smaller image files\n3. Try again in a few minutes');
            } else {
                alert('Server error: Received invalid response. Please try again or contact support.');
            }
            return;
        }

        const data = await res.json();

        if (res.ok) {
            console.log('✅ Book update successful:', data);
            
            // Handle PDF upload separately if provided
            if (digitalPDFFile && data.book && data.book._id) {
                try {
                    submitBtn.textContent = 'Uploading PDF...';
                    console.log('📄 Uploading PDF file separately...');
                    
                    const pdfFormData = new FormData();
                    pdfFormData.append('pdfFile', digitalPDFFile);
                    
                    const pdfRes = await fetch(`${API}/books/${data.book._id}/upload-pdf`, {
                        method: 'POST',
                        headers: { "Authorization": `Bearer ${token}` },
                        body: pdfFormData
                    });
                    
                    if (!pdfRes.ok) {
                        const pdfError = await pdfRes.json();
                        console.error('PDF upload failed:', pdfError);
                        alert(`Book saved successfully, but PDF upload failed: ${pdfError.error || 'Unknown error'}`);
                    } else {
                        console.log('✅ PDF uploaded successfully');
                        alert('Book and PDF uploaded successfully!');
                    }
                } catch (pdfErr) {
                    console.error('PDF upload error:', pdfErr);
                    alert(`Book saved successfully, but PDF upload failed: ${pdfErr.message}`);
                }
            } else {
                alert(data.message);
            }
            
            resetForm();
            
            // Force reload books to show updated stock status
            console.log('🔄 Reloading books to show updated stock status...');
            await loadBooks();
            
            // Also hide the form after successful update
            document.getElementById('addBookForm').style.display = "none";
            document.getElementById('toggleFormBtn').textContent = "Show Form";
            
            // Refresh filters to include new class/subject
            loadClassesAndSubjectsForFilters();
        } else {
            alert(`Error: ${data.error || 'Failed to save book'}\n${data.details || ''}`);
        }
    } catch (err) {
        console.error('Error submitting form:', err);
        alert(`Error: ${err.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

/* RESET FORM */
function resetForm() {
    isEditMode = false;
    editingBookId = null;
    document.getElementById('bookForm').reset();
    
    // Reset stock fields to defaults
    const trackStockEl = document.getElementById('trackStock');
    const stockQuantityEl = document.getElementById('stockQuantity');
    const lowStockThresholdEl = document.getElementById('lowStockThreshold');
    const stockStatusEl = document.getElementById('stockStatus');
    const stockFieldsEl = document.getElementById('stockFields');
    
    if (trackStockEl) trackStockEl.checked = true;
    if (stockQuantityEl) stockQuantityEl.value = 10;
    if (lowStockThresholdEl) lowStockThresholdEl.value = 5;
    if (stockStatusEl) stockStatusEl.value = 'in_stock';
    if (stockFieldsEl) stockFieldsEl.style.display = 'flex';
    
    document.getElementById('submitBtn').textContent = "Add Book";
}

/* INITIALIZE STOCK FIELDS */
function initializeStockFields() {
    console.log('📦 Initializing stock fields...');
    
    const trackStockEl = document.getElementById('trackStock');
    const stockFieldsEl = document.getElementById('stockFields');
    
    if (trackStockEl && stockFieldsEl) {
        // Set initial state based on checkbox
        stockFieldsEl.style.display = trackStockEl.checked ? 'flex' : 'none';
        console.log('📦 Stock fields initialized. Visible:', trackStockEl.checked);
    } else {
        console.warn('📦 Stock field elements not found:', {
            trackStock: !!trackStockEl,
            stockFields: !!stockFieldsEl
        });
    }
}




/* DIGITAL CONTENT MANAGEMENT */
let currentDigitalBookId = null;

function openDigitalContentModal(bookId) {
    currentDigitalBookId = bookId;
    
    // Fetch book details
    fetch(`${API}/books/${bookId}`)
        .then(res => res.json())
        .then(data => {
            const book = data.book;
            
            // Populate modal
            document.getElementById('modalBookTitle').textContent = book.title;
            document.getElementById('modalMaxPrice').textContent = book.price.toFixed(2);
            document.getElementById('modalOnlinePrice').value = book.onlinePrice || '';
            document.getElementById('modalEnableDigital').checked = book.digitalContent?.available || false;
            
            // Show modal
            document.getElementById('digitalContentModal').style.display = 'block';
        })
        .catch(error => {
            console.error('Error loading book details:', error);
            alert('Failed to load book details');
        });
}

function closeDigitalContentModal() {
    document.getElementById('digitalContentModal').style.display = 'none';
    currentDigitalBookId = null;
}

async function saveDigitalContent() {
    if (!currentDigitalBookId) return;
    
    const token = localStorage.getItem('token');
    const pdfFile = document.getElementById('modalPdfFile').files[0];
    const onlinePrice = parseFloat(document.getElementById('modalOnlinePrice').value);
    const enableDigital = document.getElementById('modalEnableDigital').checked;
    
    // Validate PDF file size
    if (pdfFile && pdfFile.size > 50 * 1024 * 1024) {
        alert('PDF file is too large. Maximum size is 50MB.');
        return;
    }
    
    try {
        // Step 1: Upload PDF if provided
        if (pdfFile) {
            console.log('📄 Uploading PDF file...');
            console.log(`📊 PDF file size: ${pdfFile.size} bytes (${(pdfFile.size / 1024 / 1024).toFixed(2)} MB)`);
            
            const formData = new FormData();
            formData.append('pdfFile', pdfFile);
            
            const uploadRes = await fetch(`${API}/books/${currentDigitalBookId}/upload-pdf`, {
                method: 'POST',
                headers: { "Authorization": `Bearer ${token}` },
                body: formData
            });
            
            if (!uploadRes.ok) {
                const errorText = await uploadRes.text();
                console.error('PDF upload failed:', errorText);
                
                let errorMessage = 'PDF upload failed';
                try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.error || errorMessage;
                } catch (e) {
                    // If not JSON, use the text as is
                    errorMessage = errorText.substring(0, 200);
                }
                
                throw new Error(errorMessage);
            }
            
            console.log('✅ PDF uploaded successfully');
        }
        
        // Step 2: Update digital content settings
        if (enableDigital && onlinePrice) {
            console.log('⚙️ Updating digital content settings...');
            const settingsRes = await fetch(`${API}/books/${currentDigitalBookId}/digital-content`, {
                method: 'PUT',
                headers: { 
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    available: enableDigital,
                    onlinePrice: onlinePrice
                })
            });
            
            if (!settingsRes.ok) {
                const error = await settingsRes.json();
                throw new Error(error.error || 'Failed to update digital content settings');
            }
            
            console.log('✅ Digital content settings updated');
        }
        
        alert('Digital content updated successfully!');
        closeDigitalContentModal();
        loadBooks(); // Reload books to show updated status
        
    } catch (error) {
        console.error('Error saving digital content:', error);
        alert(`Error: ${error.message}`);
    }
}

async function verifyPdfFile() {
    if (!currentDigitalBookId) return;
    
    const token = localStorage.getItem('token');
    
    try {
        const res = await fetch(`${API}/books/${currentDigitalBookId}/verify-pdf`, {
            method: 'POST',
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        const data = await res.json();
        
        if (res.ok) {
            alert('PDF file verified successfully!');
        } else {
            alert(`Verification failed: ${data.error}`);
        }
        
    } catch (error) {
        console.error('Error verifying PDF:', error);
        alert(`Error: ${error.message}`);
    }
}

async function loadDigitalSalesReport() {
    const token = localStorage.getItem('token');
    
    try {
        const res = await fetch(`${API}/books/digital-sales-report`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        
        const report = await res.json();
        
        // Update statistics
        document.getElementById('totalDigitalBooks').textContent = report.totalDigitalBooks;
        document.getElementById('totalRevenue').textContent = `₹${report.totalRevenue.toFixed(2)}`;
        document.getElementById('totalSales').textContent = report.totalSales;
        
        // Update table
        const tbody = document.getElementById('digitalBooksTableBody');
        tbody.innerHTML = '';
        
        if (report.books && report.books.length > 0) {
            document.getElementById('digitalBooksTable').style.display = 'block';
            document.getElementById('noDigitalBooks').style.display = 'none';
            
            report.books.forEach(book => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${book.title}</td>
                    <td>${book.author}</td>
                    <td>₹${book.physicalPrice.toFixed(2)}</td>
                    <td>₹${book.onlinePrice.toFixed(2)}</td>
                    <td>${book.discountPercentage}%</td>
                    <td>${(book.fileSize / (1024 * 1024)).toFixed(2)} MB</td>
                    <td><span style="color: #2196F3; font-weight: 600;">✅ Active</span></td>
                    <td>
                        <button class="btn-secondary" onclick="openDigitalContentModal('${book.id}')">Manage</button>
                    </td>
                `;
                tbody.appendChild(row);
            });
        } else {
            document.getElementById('digitalBooksTable').style.display = 'none';
            document.getElementById('noDigitalBooks').style.display = 'block';
        }
        
    } catch (error) {
        console.error('Error loading digital sales report:', error);
        alert('Failed to load digital sales report');
    }
}

function toggleDigitalReport() {
    const booksSection = document.querySelector('.admin-section');
    const digitalSection = document.getElementById('digitalSalesSection');
    const toggleBtn = document.getElementById('toggleDigitalReportBtn');
    
    if (digitalSection.style.display === 'none' || !digitalSection.style.display) {
        // Show digital report
        booksSection.style.display = 'none';
        digitalSection.style.display = 'block';
        toggleBtn.textContent = '📚 Back to Books';
        loadDigitalSalesReport();
    } else {
        // Show books
        booksSection.style.display = 'block';
        digitalSection.style.display = 'none';
        toggleBtn.textContent = '📊 Digital Sales Report';
    }
}

// Add event listeners for digital content modal
document.addEventListener('DOMContentLoaded', () => {
    // Digital content modal listeners
    const closeModalBtn = document.getElementById('closeDigitalModal');
    const cancelModalBtn = document.getElementById('cancelDigitalModal');
    const saveBtn = document.getElementById('saveDigitalContent');
    const verifyBtn = document.getElementById('verifyPdfFile');
    const toggleReportBtn = document.getElementById('toggleDigitalReportBtn');
    const refreshReportBtn = document.getElementById('refreshReportBtn');
    
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeDigitalContentModal);
    if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeDigitalContentModal);
    if (saveBtn) saveBtn.addEventListener('click', saveDigitalContent);
    if (verifyBtn) verifyBtn.addEventListener('click', verifyPdfFile);
    if (toggleReportBtn) toggleReportBtn.addEventListener('click', toggleDigitalReport);
    if (refreshReportBtn) refreshReportBtn.addEventListener('click', loadDigitalSalesReport);
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('digitalContentModal');
        if (e.target === modal) {
            closeDigitalContentModal();
        }
    });
});
