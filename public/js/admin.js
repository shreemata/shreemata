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
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('toggleFormBtn').addEventListener('click', toggleForm);
    document.getElementById('bookForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('cancelBtn').addEventListener('click', resetForm);

    document.getElementById('previewImages').addEventListener('change', (e) => {
        // No limit on preview images - removed the 4 image limit
        console.log(`📷 Selected ${e.target.files.length} preview images`);
    });

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
        // Desktop table row
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><img src="${book.cover_image}" width="50"/></td>
            <td>${book.title}</td>
            <td>${book.author}</td>
            <td>${book.class ? `Class ${book.class}` : 'N/A'}</td>
            <td>${book.subject || 'N/A'}</td>
            <td>₹${parseFloat(book.price).toFixed(2)}</td>
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
        const descriptionEl = document.getElementById('description');
        const bookClassEl = document.getElementById('bookClass');
        const subjectEl = document.getElementById('subject');
        
        if (titleEl) titleEl.value = book.title;
        if (authorEl) authorEl.value = book.author;
        if (priceEl) priceEl.value = book.price;
        if (weightEl) weightEl.value = book.weight || 0.5;
        if (rewardPointsEl) rewardPointsEl.value = book.rewardPoints || 0;
        if (descriptionEl) descriptionEl.value = book.description;
        if (bookClassEl) bookClassEl.value = book.class || '';
        if (subjectEl) subjectEl.value = book.subject || '';

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
        
        console.log('Weight element:', weightEl ? '✅' : '❌');
        console.log('RewardPoints element:', rewardPointsEl ? '✅' : '❌');
        
        if (!weightEl) throw new Error('Weight field not found');
        if (!rewardPointsEl) throw new Error('Reward points field not found');
        
        const weight = weightEl.value;
        const rewardPoints = rewardPointsEl.value;

        const coverImageEl = document.getElementById('coverImage');
        const previewImagesEl = document.getElementById('previewImages');
        
        console.log('CoverImage element:', coverImageEl ? '✅' : '❌');
        console.log('PreviewImages element:', previewImagesEl ? '✅' : '❌');
        
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
            const bookData = {
                title,
                author,
                price,
                description,
                class: bookClass,
                subject,
                weight,
                rewardPoints,
                cover_image: coverImageUrl,
                preview_images: previewImageUrls
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
                console.log('📦 Compressing cover image...');
                compressedCoverFile = await window.imageCompressor.compressImage(coverFile, 800, 1200, 0.8);
            }

            if (previewFiles.length > 0) {
                console.log('� Codmpressing preview images...');
                compressedPreviewFiles = await window.imageCompressor.compressMultipleImages(previewFiles);
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

            if (compressedCoverFile) {
                console.log('📎 Adding compressed cover image:', compressedCoverFile.name, compressedCoverFile.size, 'bytes');
                formData.append('coverImage', compressedCoverFile);
            }
            
            for (let i = 0; i < compressedPreviewFiles.length; i++) {
                console.log('📎 Adding compressed preview image:', compressedPreviewFiles[i].name, compressedPreviewFiles[i].size, 'bytes');
                formData.append('previewImages', compressedPreviewFiles[i]);
            }

            console.log('🚀 Sending to:', url);
            console.log('🔍 Method:', method);
            console.log('🔍 Token exists:', !!token);

            res = await fetch(url, {
                method,
                headers: { "Authorization": `Bearer ${token}` },
                body: formData
            });

            console.log('📥 Server response:', res.status, res.statusText);
        } else if (!isEditMode) {
            // No images and not edit mode
            alert('Please upload a cover image');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add Book';
            return;
        } else {
            // Edit mode without new images
            submitBtn.textContent = 'Saving book...';
            const bookData = {
                title,
                author,
                price,
                description,
                class: bookClass,
                subject,
                weight,
                rewardPoints
            };

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
            alert('Server error: Received invalid response. Check console for details.');
            return;
        }

        const data = await res.json();

        if (res.ok) {
            alert(data.message);
            resetForm();
            loadBooks();
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
    document.getElementById('submitBtn').textContent = "Add Book";
}


