/**
 * SHREE MATA — PREMIUM ORDER HISTORY CONTROLLER
 * Handles Order List Loading, Search, Filter Chips, Order Cards, Modal & Action Routing
 */

(function () {
    let allOrders = [];
    let currentFilter = 'all';
    let searchQuery = '';

    // HTML escape helper
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Format Indian Rupee currency
    function formatCurrency(amount) {
        const num = Number(amount || 0);
        return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // Format customer friendly date
    function formatDate(dateStr) {
        if (!dateStr) return '—';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            return date.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });
        } catch (e) {
            return dateStr;
        }
    }

    // Determine normalized status and badge style
    function getOrderStatusMeta(order) {
        const status = (order.status || '').toLowerCase();
        const deliveryStatus = (order.deliveryStatus || '').toLowerCase();

        if (deliveryStatus === 'delivered' || status === 'completed') {
            return {
                key: 'delivered',
                label: 'Delivered ✓',
                badgeClass: 'badge-status-delivered'
            };
        }
        if (deliveryStatus === 'shipped') {
            return {
                key: 'shipped',
                label: 'Shipped 🚚',
                badgeClass: 'badge-status-shipped'
            };
        }
        if (deliveryStatus === 'processing' || status === 'processing') {
            return {
                key: 'processing',
                label: 'Processing ⚙️',
                badgeClass: 'badge-status-processing'
            };
        }
        if (status === 'pending_payment_verification' || status === 'pending') {
            return {
                key: 'processing',
                label: status === 'pending_payment_verification' ? 'Payment Verification' : 'Pending',
                badgeClass: 'badge-status-pending'
            };
        }
        if (status === 'cancelled' || status === 'failed') {
            return {
                key: 'cancelled',
                label: status === 'cancelled' ? 'Cancelled' : 'Failed',
                badgeClass: 'badge-status-cancelled'
            };
        }
        return {
            key: 'processing',
            label: 'Processing',
            badgeClass: 'badge-status-processing'
        };
    }

    // Determine payment badge info
    function getPaymentMeta(order) {
        const status = (order.status || '').toLowerCase();
        const payDetails = order.paymentDetails || {};
        const payStatus = (payDetails.status || '').toLowerCase();
        const hasRazorpay = Boolean(order.razorpay_payment_id);

        if (status === 'completed' || hasRazorpay || payStatus === 'verified') {
            return {
                label: '✓ Paid',
                class: 'paid'
            };
        }
        if (status === 'pending_payment_verification' || payStatus === 'pending_verification') {
            return {
                label: 'Pending Verification',
                class: 'pending-pay'
            };
        }
        if (status === 'failed' || payStatus === 'rejected') {
            return {
                label: 'Failed',
                class: 'failed'
            };
        }
        return {
            label: 'Pending Payment',
            class: 'pending-pay'
        };
    }

    // Determine delivery method label
    function getDeliveryTypeMeta(order) {
        const method = (order.deliveryMethod || '').toLowerCase();
        if (method === 'pickup') {
            return {
                label: '🏪 Store Pickup',
                isPickup: true
            };
        }
        return {
            label: '🏠 Doorstep Courier',
            isPickup: false
        };
    }

    // ── RENDER SKELETON LOADERS ──
    function renderSkeletons() {
        const container = document.getElementById('ordersListContainer');
        if (!container) return;

        let skeletonsHtml = '';
        for (let i = 0; i < 3; i++) {
            skeletonsHtml += `
                <div class="order-skeleton-card">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 16px;">
                        <div class="skeleton-shimmer" style="width: 140px; height: 20px;"></div>
                        <div class="skeleton-shimmer" style="width: 90px; height: 24px; border-radius: 9999px;"></div>
                    </div>
                    <div style="display: flex; gap: 14px; margin-bottom: 14px;">
                        <div class="skeleton-shimmer" style="width: 48px; height: 64px; border-radius: 6px;"></div>
                        <div style="flex: 1;">
                            <div class="skeleton-shimmer" style="width: 70%; height: 16px; margin-bottom: 8px;"></div>
                            <div class="skeleton-shimmer" style="width: 40%; height: 14px;"></div>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #F0EAE0; padding-top: 14px;">
                        <div class="skeleton-shimmer" style="width: 100px; height: 22px;"></div>
                        <div class="skeleton-shimmer" style="width: 110px; height: 36px; border-radius: 8px;"></div>
                    </div>
                </div>
            `;
        }
        container.innerHTML = skeletonsHtml;
    }

    // ── FETCH ORDERS FROM API ──
    async function fetchOrders() {
        const token = localStorage.getItem("token");
        const container = document.getElementById('ordersListContainer');

        if (!token) {
            window.location.href = "/login.html";
            return;
        }

        renderSkeletons();

        try {
            const res = await fetch(`${window.API_URL}/orders`, {
                headers: { "Authorization": "Bearer " + token }
            });

            if (!res.ok) {
                throw new Error(`Server returned status ${res.status}`);
            }

            const data = await res.json();
            allOrders = Array.isArray(data.orders) ? data.orders : [];
            updateOrderCounts();
            applyFilterAndRender();

        } catch (err) {
            console.error("Error fetching orders:", err);
            if (container) {
                container.innerHTML = `
                    <div class="orders-empty-state">
                        <div class="empty-state-icon" style="background: #FEE2E2; border-color: #FCA5A5; color: #DC2626;">⚠️</div>
                        <h2 class="empty-state-title">Unable to load your orders right now.</h2>
                        <p class="empty-state-desc">Please check your network connection and try again.</p>
                        <button type="button" class="btn-order-action primary" onclick="window.fetchOrders()" style="margin: 0 auto;">
                            🔄 Try Again
                        </button>
                    </div>
                `;
            }
        }
    }
    window.fetchOrders = fetchOrders;

    // Update filter counts and total badge
    function updateOrderCounts() {
        const badge = document.getElementById('orderCountBadge');
        if (badge) {
            badge.textContent = `${allOrders.length} ${allOrders.length === 1 ? 'Order' : 'Orders'}`;
        }

        // Count for chips
        const counts = {
            all: allOrders.length,
            processing: 0,
            shipped: 0,
            delivered: 0,
            cancelled: 0
        };

        allOrders.forEach(order => {
            const meta = getOrderStatusMeta(order);
            if (counts[meta.key] !== undefined) {
                counts[meta.key]++;
            }
        });

        document.querySelectorAll('.filter-chip').forEach(chip => {
            const filterKey = chip.getAttribute('data-filter');
            const countEl = chip.querySelector('.chip-count');
            if (countEl && counts[filterKey] !== undefined) {
                countEl.textContent = counts[filterKey];
            }
        });
    }

    // ── FILTER & SEARCH FILTERING ──
    function applyFilterAndRender() {
        const container = document.getElementById('ordersListContainer');
        if (!container) return;

        let filtered = [...allOrders];

        // 1. Status Filter
        if (currentFilter !== 'all') {
            filtered = filtered.filter(order => {
                const meta = getOrderStatusMeta(order);
                return meta.key === currentFilter;
            });
        }

        // 2. Search Query Filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(order => {
                const orderId = String(order._id || '').toLowerCase();
                const razorpayId = String(order.razorpay_order_id || '').toLowerCase();
                const utr = String(order.paymentDetails?.utrNumber || '').toLowerCase();
                const checkNum = String(order.paymentDetails?.checkNumber || '').toLowerCase();
                const itemsMatch = Array.isArray(order.items) && order.items.some(it => 
                    String(it.title || '').toLowerCase().includes(q) || 
                    String(it.author || '').toLowerCase().includes(q)
                );
                return orderId.includes(q) || razorpayId.includes(q) || utr.includes(q) || checkNum.includes(q) || itemsMatch;
            });
        }

        // 3. Render Output
        if (allOrders.length === 0) {
            container.innerHTML = `
                <div class="orders-empty-state">
                    <div class="empty-state-icon">📦</div>
                    <h2 class="empty-state-title">No orders yet</h2>
                    <p class="empty-state-desc">Your purchased books will appear here once you place an order.</p>
                    <a href="/#booksSection" class="btn-order-action gold" style="display: inline-flex; margin: 0 auto;">
                        📚 Explore Books
                    </a>
                </div>
            `;
            return;
        }

        if (filtered.length === 0) {
            const filterLabel = currentFilter !== 'all' ? currentFilter : '';
            container.innerHTML = `
                <div class="orders-empty-state">
                    <div class="empty-state-icon" style="background: #F1F5F9; border-color: #CBD5E1; color: #64748B;">🔍</div>
                    <h2 class="empty-state-title">No ${filterLabel ? filterLabel + ' ' : ''}orders found</h2>
                    <p class="empty-state-desc">Try clearing your search query or selecting a different status filter.</p>
                    <button type="button" class="btn-order-action outline" onclick="window.clearOrderFilters()" style="margin: 0 auto;">
                        ✕ Clear Filters & Search
                    </button>
                </div>
            `;
            return;
        }

        // Render Cards
        container.innerHTML = filtered.map(order => buildOrderCardHtml(order)).join('');
    }

    // Clear filters handler
    window.clearOrderFilters = function () {
        currentFilter = 'all';
        searchQuery = '';
        const searchInput = document.getElementById('orderSearchInput');
        if (searchInput) searchInput.value = '';
        
        document.querySelectorAll('.filter-chip').forEach(c => {
            if (c.getAttribute('data-filter') === 'all') c.classList.add('active');
            else c.classList.remove('active');
        });
        applyFilterAndRender();
    };

    // ── BUILD ORDER CARD HTML ──
    function buildOrderCardHtml(order) {
        const orderId = String(order._id || '');
        const displayId = orderId ? ('#SM-' + orderId.slice(-6).toUpperCase()) : 'Order';
        const dateFormatted = formatDate(order.createdAt);
        const statusMeta = getOrderStatusMeta(order);
        const payMeta = getPaymentMeta(order);
        const deliveryMeta = getDeliveryTypeMeta(order);

        const items = Array.isArray(order.items) ? order.items : [];
        const totalItemsCount = items.reduce((sum, it) => sum + (it.quantity || 1), 0);
        const displayItems = items.slice(0, 2);
        const remainingCount = items.length - 2;

        const isBillable = order.status !== 'cancelled' && order.status !== 'failed';
        const hasTracking = !deliveryMeta.isPickup && (
            (order.trackingInfo && (order.trackingInfo.trackingId || order.trackingInfo.trackingWebsite || order.trackingInfo.trackingUrl)) ||
            statusMeta.key === 'shipped' || statusMeta.key === 'delivered'
        );

        // Product rows
        const productsHtml = displayItems.map(item => `
            <div class="card-product-row">
                <img src="${escapeHtml(item.coverImage || '/images/press.png')}" onerror="this.src='/images/press.png'" alt="${escapeHtml(item.title)}" class="card-product-thumb">
                <div class="card-product-info">
                    <div class="card-product-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
                    <div class="card-product-meta">
                        <span>Qty ${item.quantity || 1}</span>
                        ${item.author ? `<span>• ${escapeHtml(item.author)}</span>` : ''}
                    </div>
                </div>
                <div class="card-product-price">${formatCurrency(item.price)}</div>
            </div>
        `).join('');

        const moreItemsHtml = remainingCount > 0 ? `
            <button type="button" class="more-items-pill" onclick="window.openOrderDetailsModal('${orderId}')">
                + ${remainingCount} more ${remainingCount === 1 ? 'item' : 'items'}
            </button>
        ` : '';

        return `
            <article class="order-history-card" data-order-id="${orderId}">
                <!-- Header -->
                <div class="card-header-bar">
                    <div class="card-order-id-group">
                        <div class="card-order-num">${escapeHtml(displayId)}</div>
                        <div class="card-order-date">
                            <span>📅 ${escapeHtml(dateFormatted)}</span>
                            <span>•</span>
                            <span class="badge-meta-pill ${payMeta.class}">${payMeta.label}</span>
                            <span class="badge-meta-pill">${deliveryMeta.label}</span>
                        </div>
                    </div>
                    <div class="card-status-badges">
                        <span class="badge-order-status ${statusMeta.badgeClass}">${statusMeta.label}</span>
                    </div>
                </div>

                <!-- Product Previews -->
                <div class="card-products-list">
                    ${productsHtml}
                    ${moreItemsHtml}
                </div>

                <!-- Footer / Actions -->
                <div class="card-footer-bar">
                    <div class="card-total-group">
                        <span class="card-total-label">${totalItemsCount} ${totalItemsCount === 1 ? 'Item' : 'Items'} • Order Total</span>
                        <span class="card-total-amount">${formatCurrency(order.totalAmount)}</span>
                    </div>

                    <div class="card-actions-group">
                        <button type="button" class="btn-order-action outline" onclick="window.openOrderDetailsModal('${orderId}')">
                            👁️ View Details
                        </button>
                        
                        ${hasTracking ? `
                            <a href="/track-order.html?billNumber=${encodeURIComponent(order.invoiceNumber || orderId)}" class="btn-order-action primary">
                                📦 Track Order
                            </a>
                        ` : ''}

                        ${isBillable ? `
                            <a href="/invoice.html?orderId=${encodeURIComponent(orderId)}" target="_blank" rel="noopener" class="btn-order-action gold">
                                📄 Invoice
                            </a>
                        ` : ''}
                    </div>
                </div>
            </article>
        `;
    }

    // ── ORDER DETAILS MODAL CONTROLLER ──
    function openOrderDetailsModal(orderId) {
        const order = allOrders.find(o => String(o._id) === String(orderId));
        if (!order) return;

        const modal = document.getElementById('orderDetailsModal');
        const modalBody = document.getElementById('orderDetailsModalBody');
        const modalTitle = document.getElementById('orderDetailsModalTitle');
        if (!modal || !modalBody) return;

        const displayId = orderId ? ('#SM-' + String(orderId).slice(-6).toUpperCase()) : 'Order';
        if (modalTitle) modalTitle.textContent = `Order Details ${displayId}`;

        const statusMeta = getOrderStatusMeta(order);
        const payMeta = getPaymentMeta(order);
        const deliveryMeta = getDeliveryTypeMeta(order);
        const items = Array.isArray(order.items) ? order.items : [];

        // Progression Stepper State
        const steps = ['Confirmed', 'Processing', 'Shipped', 'Delivered'];
        let activeIndex = 0;
        if (statusMeta.key === 'processing') activeIndex = 1;
        if (statusMeta.key === 'shipped') activeIndex = 2;
        if (statusMeta.key === 'delivered') activeIndex = 3;
        if (statusMeta.key === 'cancelled') activeIndex = -1;

        const stepperHtml = statusMeta.key !== 'cancelled' ? `
            <div class="order-progress-stepper">
                ${steps.map((step, idx) => {
                    let stepClass = '';
                    if (idx < activeIndex) stepClass = 'completed';
                    else if (idx === activeIndex) stepClass = 'active';
                    return `
                        <div class="stepper-step ${stepClass}">
                            <div class="stepper-dot">${idx < activeIndex ? '✓' : (idx + 1)}</div>
                            <div class="stepper-label">${step}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        ` : `
            <div style="background: #FEE2E2; border: 1px solid #FCA5A5; color: #991B1B; padding: 12px 16px; border-radius: 8px; font-weight: 700; text-align: center; font-size: 13.5px;">
                ⚠️ This order has been cancelled.
            </div>
        `;

        // Items Table
        let subtotal = 0;
        const itemsRowsHtml = items.map(item => {
            const lineTotal = (item.price || 0) * (item.quantity || 1);
            subtotal += lineTotal;
            return `
                <tr>
                    <td>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <img src="${escapeHtml(item.coverImage || '/images/press.png')}" onerror="this.src='/images/press.png'" alt="${escapeHtml(item.title)}" style="width: 36px; height: 48px; object-fit: cover; border-radius: 4px;">
                            <div>
                                <div style="font-weight: 700; color: #101820;">${escapeHtml(item.title)}</div>
                                ${item.author ? `<div style="font-size: 12px; color: #667085;">${escapeHtml(item.author)}</div>` : ''}
                            </div>
                        </div>
                    </td>
                    <td style="text-align: center; font-weight: 600;">${item.quantity || 1}</td>
                    <td style="text-align: right; font-weight: 600;">${formatCurrency(item.price)}</td>
                    <td style="text-align: right; font-weight: 700; color: #101820;">${formatCurrency(lineTotal)}</td>
                </tr>
            `;
        }).join('');

        // Delivery info block
        let deliveryBlockHtml = '';
        if (deliveryMeta.isPickup) {
            deliveryBlockHtml = `
                <div class="modal-info-card">
                    <h4 class="modal-card-heading">🏪 Store Pickup Location</h4>
                    <p style="margin: 0; font-size: 13.5px; line-height: 1.5; color: #334155;">
                        <strong>Shree Mata Publication Center</strong><br>
                        Main Branch, Bangalore, Karnataka<br>
                        Contact: +91 9886086278
                    </p>
                </div>
            `;
        } else if (order.deliveryAddress) {
            const a = order.deliveryAddress;
            const line1 = a.homeAddress1 || a.street || '';
            const line2 = a.homeAddress2 || a.streetName || '';
            const loc = [a.village || a.city, a.taluk, a.district, a.state, a.pincode].filter(Boolean).join(', ');
            deliveryBlockHtml = `
                <div class="modal-info-card">
                    <h4 class="modal-card-heading">📍 Delivery Address</h4>
                    <p style="margin: 0; font-size: 13.5px; line-height: 1.5; color: #334155;">
                        ${line1 ? `<strong>${escapeHtml(line1)}</strong><br>` : ''}
                        ${line2 ? `${escapeHtml(line2)}<br>` : ''}
                        ${loc ? `${escapeHtml(loc)}<br>` : ''}
                        ${a.phone ? `📞 Phone: ${escapeHtml(a.phone)}` : ''}
                    </p>
                </div>
            `;
        }

        // Tracking block (if available)
        let trackingBlockHtml = '';
        if (order.trackingInfo && (order.trackingInfo.trackingId || order.trackingInfo.trackingWebsite)) {
            const t = order.trackingInfo;
            trackingBlockHtml = `
                <div class="modal-info-card" style="border-left: 4px solid #2563EB;">
                    <h4 class="modal-card-heading" style="color: #1D4ED8;">🚚 Courier Tracking Details</h4>
                    <div style="font-size: 13.5px; display: flex; flex-direction: column; gap: 4px;">
                        ${t.trackingId ? `<div><strong>Tracking Number:</strong> <span style="font-family: monospace; background: #E2E8F0; padding: 2px 6px; border-radius: 4px;">${escapeHtml(t.trackingId)}</span></div>` : ''}
                        ${t.trackingWebsite ? `<div><strong>Courier Partner:</strong> ${escapeHtml(t.trackingWebsite)}</div>` : ''}
                    </div>
                </div>
            `;
        }

        // Discount / courier breakdown
        const savings = order.appliedOffer ? (order.appliedOffer.savings || 0) : 0;
        const courier = order.courierCharge || 0;

        modalBody.innerHTML = `
            ${stepperHtml}

            <!-- Order Meta Overview -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px;">
                <div class="modal-info-card">
                    <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748B;">Date Placed</div>
                    <div style="font-weight: 700; color: #101820; font-size: 13.5px; margin-top: 2px;">${formatDate(order.createdAt)}</div>
                </div>
                <div class="modal-info-card">
                    <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748B;">Order Status</div>
                    <div style="margin-top: 2px;"><span class="badge-order-status ${statusMeta.badgeClass}">${statusMeta.label}</span></div>
                </div>
                <div class="modal-info-card">
                    <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748B;">Payment Status</div>
                    <div style="margin-top: 2px;"><span class="badge-meta-pill ${payMeta.class}">${payMeta.label}</span></div>
                </div>
                <div class="modal-info-card">
                    <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748B;">Delivery Type</div>
                    <div style="font-weight: 700; color: #101820; font-size: 13.5px; margin-top: 2px;">${deliveryMeta.label}</div>
                </div>
            </div>

            <!-- Items List Table -->
            <div class="modal-info-card" style="padding: 12px;">
                <h4 class="modal-card-heading" style="padding: 4px 6px;">📚 Purchased Items (${items.length})</h4>
                <div style="overflow-x: auto;">
                    <table class="modal-items-table">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th style="text-align: center;">Qty</th>
                                <th style="text-align: right;">Unit Price</th>
                                <th style="text-align: right;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsRowsHtml}
                        </tbody>
                    </table>
                </div>

                <!-- Price Breakdown -->
                <div class="modal-price-breakdown" style="padding: 12px 6px 4px 6px;">
                    <div class="breakdown-row">
                        <span>Items Subtotal</span>
                        <span>${formatCurrency(subtotal || order.totalAmount)}</span>
                    </div>
                    ${savings > 0 ? `
                        <div class="breakdown-row" style="color: #15803D; font-weight: 600;">
                            <span>Offer Discount (${escapeHtml(order.appliedOffer.offerTitle || 'Promo')})</span>
                            <span>- ${formatCurrency(savings)}</span>
                        </div>
                    ` : ''}
                    ${courier > 0 ? `
                        <div class="breakdown-row">
                            <span>Courier & Delivery Charge</span>
                            <span>+ ${formatCurrency(courier)}</span>
                        </div>
                    ` : ''}
                    <div class="breakdown-row total">
                        <span>Grand Total</span>
                        <span>${formatCurrency(order.totalAmount)}</span>
                    </div>
                </div>
            </div>

            ${deliveryBlockHtml}
            ${trackingBlockHtml}
        `;

        // Update modal actions
        const modalFooter = document.getElementById('orderDetailsModalFooter');
        if (modalFooter) {
            const isBillable = order.status !== 'cancelled' && order.status !== 'failed';
            modalFooter.innerHTML = `
                <button type="button" class="btn-order-action outline" onclick="window.closeOrderDetailsModal()">Close</button>
                ${isBillable ? `
                    <a href="/invoice.html?orderId=${encodeURIComponent(orderId)}" target="_blank" rel="noopener" class="btn-order-action gold">
                        📄 Download Invoice
                    </a>
                ` : ''}
                ${!deliveryMeta.isPickup ? `
                    <a href="/track-order.html?billNumber=${encodeURIComponent(order.invoiceNumber || orderId)}" class="btn-order-action primary">
                        📦 Track Order
                    </a>
                ` : ''}
            `;
        }

        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }
    window.openOrderDetailsModal = openOrderDetailsModal;

    function closeOrderDetailsModal() {
        const modal = document.getElementById('orderDetailsModal');
        if (modal) {
            modal.classList.remove('open');
            modal.setAttribute('aria-hidden', 'true');
        }
        document.body.style.overflow = '';
    }
    window.closeOrderDetailsModal = closeOrderDetailsModal;

    // ── EVENT INITIALIZATION ──
    function initOrderEvents() {
        // Filter Chips Click
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                currentFilter = chip.getAttribute('data-filter') || 'all';
                applyFilterAndRender();
            });
        });

        // Search Input
        const searchInput = document.getElementById('orderSearchInput');
        const clearBtn = document.getElementById('orderSearchClear');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                searchQuery = e.target.value.trim();
                if (clearBtn) clearBtn.style.display = searchQuery ? 'flex' : 'none';
                applyFilterAndRender();
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                searchQuery = '';
                clearBtn.style.display = 'none';
                applyFilterAndRender();
            });
        }

        // Modal backdrop click
        const modal = document.getElementById('orderDetailsModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeOrderDetailsModal();
                }
            });
        }

        // Escape key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('orderDetailsModal');
                if (modal && modal.classList.contains('open')) {
                    closeOrderDetailsModal();
                }
            }
        });
    }

    // Bootstrap on DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        initOrderEvents();
        fetchOrders();
    });
})();
