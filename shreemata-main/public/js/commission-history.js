/**
 * SHREE MATA — PREMIUM COMMISSION HISTORY CONTROLLER
 * Handles Earnings Loading, Search, Filter Chips, Date Ranges, Cards, and Modal
 */

(function () {
    let allTransactions = [];
    let currentPage = 1;
    let paginationData = null;
    let currentTypeFilter = 'all';
    let currentDateFilter = 'all';
    let searchQuery = '';
    let summaryData = {};

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

    // Format customer friendly date & time
    function formatDateTime(dateStr) {
        if (!dateStr) return '—';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            const datePart = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            const timePart = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
            return `${datePart} • ${timePart}`;
        } catch (e) {
            return dateStr;
        }
    }

    // Commission type metadata
    function getCommissionMeta(item) {
        const type = (item.commissionType || '').toLowerCase();
        if (type === 'direct') {
            return {
                label: 'Buyer Cashback',
                icon: '💰',
                iconClass: 'direct',
                levelBadge: 'Direct',
                filterKey: 'cashback'
            };
        }
        if (type === 'referral') {
            return {
                label: 'Direct Referral',
                icon: '👥',
                iconClass: 'referral',
                levelBadge: 'L1 Direct',
                filterKey: 'referral'
            };
        }
        if (type === 'tree') {
            return {
                label: 'Tree Commission',
                icon: '🌳',
                iconClass: 'tree',
                levelBadge: `Level ${item.level || 1}`,
                filterKey: 'tree'
            };
        }
        return {
            label: 'Earnings',
            icon: '💰',
            iconClass: 'direct',
            levelBadge: 'Standard',
            filterKey: 'other'
        };
    }

    // ── RENDER SKELETON LOADERS ──
    function renderSkeletons() {
        const listContainer = document.getElementById('commissionListContainer');
        if (!listContainer) return;

        let skeletonsHtml = '';
        for (let i = 0; i < 4; i++) {
            skeletonsHtml += `
                <div class="ch-skeleton-card">
                    <div style="display: flex; align-items: center; gap: 14px; flex: 1;">
                        <div class="ch-shimmer" style="width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0;"></div>
                        <div style="flex: 1;">
                            <div class="ch-shimmer" style="width: 40%; height: 16px; margin-bottom: 8px;"></div>
                            <div class="ch-shimmer" style="width: 60%; height: 13px;"></div>
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
                        <div class="ch-shimmer" style="width: 80px; height: 20px;"></div>
                        <div class="ch-shimmer" style="width: 60px; height: 18px; border-radius: 9999px;"></div>
                    </div>
                </div>
            `;
        }
        listContainer.innerHTML = skeletonsHtml;
    }

    // ── FETCH COMMISSIONS FROM API ──
    async function fetchCommissions(page = 1) {
        const token = localStorage.getItem("token");
        const listContainer = document.getElementById('commissionListContainer');

        if (!token) {
            window.location.href = "/login.html";
            return;
        }

        currentPage = page;
        renderSkeletons();

        try {
            const params = new URLSearchParams({
                page: currentPage,
                limit: 50
            });

            const res = await fetch(`${window.API_URL}/referral/commissions?${params.toString()}`, {
                headers: { "Authorization": "Bearer " + token }
            });

            if (!res.ok) {
                throw new Error(`Server returned status ${res.status}`);
            }

            const data = await res.json();
            allTransactions = Array.isArray(data.commissions) ? data.commissions : [];
            summaryData = data.summary || {};
            paginationData = data.pagination || {};

            updateSummaryCards();
            updateFilterCounts();
            applyFiltersAndRender();

        } catch (err) {
            console.error("Error fetching commissions:", err);
            if (listContainer) {
                listContainer.innerHTML = `
                    <div class="ch-empty-state">
                        <div class="ch-empty-icon" style="background: #FEE2E2; border-color: #FCA5A5; color: #DC2626;">⚠️</div>
                        <h2 class="ch-empty-title">Unable to load your commission history right now.</h2>
                        <p class="ch-empty-desc">Please check your network connection and try again.</p>
                        <button type="button" class="btn-ch-action gold" onclick="window.fetchCommissions(1)" style="margin: 0 auto;">
                            🔄 Try Again
                        </button>
                    </div>
                `;
            }
        }
    }
    window.fetchCommissions = fetchCommissions;

    // Update Summary Header Cards
    function updateSummaryCards() {
        const totalEarnedEl = document.getElementById('summaryTotalEarnings');
        const directEarnedEl = document.getElementById('summaryDirectEarnings');
        const treeEarnedEl = document.getElementById('summaryTreeEarnings');
        const cashbackEarnedEl = document.getElementById('summaryCashbackEarnings');
        const walletBalanceEl = document.getElementById('summaryWalletBalance');

        // Calculate breakdown
        let directSum = 0;
        let cashbackSum = 0;
        let treeSum = 0;
        let totalSum = 0;

        allTransactions.forEach(tx => {
            const amt = Number(tx.amount || 0);
            totalSum += amt;
            if (tx.commissionType === 'direct') {
                cashbackSum += amt;
            } else if (tx.commissionType === 'referral') {
                directSum += amt;
            } else if (tx.commissionType === 'tree') {
                treeSum += amt;
            }
        });

        // Use summary if available, or fallback to transactions aggregate
        const displayTotal = summaryData.totalCommission !== undefined ? summaryData.totalCommission : totalSum;
        const displayTree = summaryData.totalTreeCommission !== undefined ? summaryData.totalTreeCommission : treeSum;
        const displayDirect = directSum > 0 ? directSum : (summaryData.totalDirectCommission || 0);
        const displayCashback = cashbackSum > 0 ? cashbackSum : 0;
        const displayWallet = summaryData.walletBalance !== undefined ? summaryData.walletBalance : 0;

        if (totalEarnedEl) totalEarnedEl.textContent = formatCurrency(displayTotal);
        if (directEarnedEl) directEarnedEl.textContent = formatCurrency(displayDirect);
        if (treeEarnedEl) treeEarnedEl.textContent = formatCurrency(displayTree);
        if (cashbackEarnedEl) cashbackEarnedEl.textContent = formatCurrency(displayCashback);
        if (walletBalanceEl) walletBalanceEl.textContent = formatCurrency(displayWallet);
    }

    // Update Filter Chip Badges
    function updateFilterCounts() {
        const counts = {
            all: allTransactions.length,
            cashback: 0,
            referral: 0,
            tree: 0
        };

        allTransactions.forEach(tx => {
            const meta = getCommissionMeta(tx);
            if (counts[meta.filterKey] !== undefined) {
                counts[meta.filterKey]++;
            }
        });

        const chipAll = document.getElementById('chipCountAll');
        const chipCashback = document.getElementById('chipCountCashback');
        const chipReferral = document.getElementById('chipCountReferral');
        const chipTree = document.getElementById('chipCountTree');

        if (chipAll) chipAll.textContent = counts.all;
        if (chipCashback) chipCashback.textContent = counts.cashback;
        if (chipReferral) chipReferral.textContent = counts.referral;
        if (chipTree) chipTree.textContent = counts.tree;
    }

    // ── APPLY FILTERS & RENDER ──
    function applyFiltersAndRender() {
        const listContainer = document.getElementById('commissionListContainer');
        if (!listContainer) return;

        let filtered = [...allTransactions];

        // 1. Commission Type Filter
        if (currentTypeFilter !== 'all') {
            filtered = filtered.filter(tx => {
                const meta = getCommissionMeta(tx);
                return meta.filterKey === currentTypeFilter;
            });
        }

        // 2. Date Range Filter
        if (currentDateFilter !== 'all') {
            const now = new Date();
            filtered = filtered.filter(tx => {
                if (!tx.date) return true;
                const d = new Date(tx.date);
                if (currentDateFilter === 'month') {
                    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                }
                if (currentDateFilter === '30days') {
                    const diffDays = (now.getTime() - d.getTime()) / (1000 * 3600 * 24);
                    return diffDays <= 30;
                }
                if (currentDateFilter === 'year') {
                    return d.getFullYear() === now.getFullYear();
                }
                return true;
            });
        }

        // 3. Search Query Filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(tx => {
                const txId = String(tx._id || '').toLowerCase();
                const orderId = String(tx.orderId || '').toLowerCase();
                const orderNum = String(tx.orderNumber || '').toLowerCase();
                const purchaserName = String(tx.purchaser?.name || '').toLowerCase();
                const meta = getCommissionMeta(tx);
                return txId.includes(q) || orderId.includes(q) || orderNum.includes(q) || purchaserName.includes(q) || meta.label.toLowerCase().includes(q);
            });
        }

        // 4. Output Rendering
        if (allTransactions.length === 0) {
            listContainer.innerHTML = `
                <div class="ch-empty-state">
                    <div class="ch-empty-icon">💰</div>
                    <h2 class="ch-empty-title">No earnings yet</h2>
                    <p class="ch-empty-desc">Your eligible cashback, direct referral, and tree commissions will appear here once earned.</p>
                    <a href="/referral.html" class="btn-ch-action gold" style="display: inline-flex; margin: 0 auto;">
                        👥 View Referral & Rewards
                    </a>
                </div>
            `;
            updatePaginationUI(0, 0);
            return;
        }

        if (filtered.length === 0) {
            listContainer.innerHTML = `
                <div class="ch-empty-state">
                    <div class="ch-empty-icon" style="background: #F1F5F9; border-color: #CBD5E1; color: #64748B;">🔍</div>
                    <h2 class="ch-empty-title">No matching earnings found</h2>
                    <p class="ch-empty-desc">Try clearing your search query or selecting a different filter.</p>
                    <button type="button" class="btn-ch-action outline" onclick="window.clearCommissionFilters()" style="margin: 0 auto;">
                        ✕ Clear Filters & Search
                    </button>
                </div>
            `;
            updatePaginationUI(0, 0);
            return;
        }

        listContainer.innerHTML = filtered.map(tx => buildTransactionCardHtml(tx)).join('');
        updatePaginationUI(filtered.length, allTransactions.length);
    }

    // Build Transaction Card HTML
    function buildTransactionCardHtml(tx) {
        const txId = String(tx._id || '');
        const meta = getCommissionMeta(tx);
        const amountFormatted = '+' + formatCurrency(tx.amount);
        const dateFormatted = formatDateTime(tx.date);
        const orderDisplay = tx.orderNumber ? `#${tx.orderNumber}` : (tx.orderId ? `#SM-${String(tx.orderId).slice(-6).toUpperCase()}` : 'Order Credit');

        return `
            <article class="ch-transaction-card" onclick="window.openTransactionModal('${escapeHtml(txId)}')">
                <div class="ch-tx-left">
                    <div class="ch-tx-icon-wrap ${meta.iconClass}">
                        ${meta.icon}
                    </div>
                    <div class="ch-tx-info">
                        <div class="ch-tx-title-row">
                            <span class="ch-tx-title">${escapeHtml(meta.label)}</span>
                            <span class="ch-tx-badge-level">${escapeHtml(meta.levelBadge)}</span>
                        </div>
                        <div class="ch-tx-meta">
                            <span>📅 ${escapeHtml(dateFormatted)}</span>
                            <span>•</span>
                            <span class="ch-tx-order-pill">📦 ${escapeHtml(orderDisplay)}</span>
                        </div>
                    </div>
                </div>

                <div class="ch-tx-right">
                    <div class="ch-tx-amount-group">
                        <div class="ch-tx-amount">${amountFormatted}</div>
                        <span class="ch-tx-status-badge">✓ Credited</span>
                    </div>
                    <button type="button" class="btn-tx-details" onclick="event.stopPropagation(); window.openTransactionModal('${escapeHtml(txId)}')">
                        <span>Details</span>
                        <span aria-hidden="true">›</span>
                    </button>
                </div>
            </article>
        `;
    }

    // Pagination display
    function updatePaginationUI(showingCount, totalCount) {
        const paginationBar = document.getElementById('commissionPaginationBar');
        const pageInfo = document.getElementById('commissionPageInfo');
        if (!paginationBar || !pageInfo) return;

        if (totalCount <= 50) {
            paginationBar.style.display = 'none';
        } else {
            paginationBar.style.display = 'flex';
            pageInfo.textContent = `Showing ${showingCount} of ${totalCount} records`;
        }
    }

    // Clear Filters
    window.clearCommissionFilters = function () {
        currentTypeFilter = 'all';
        currentDateFilter = 'all';
        searchQuery = '';

        const searchInput = document.getElementById('commissionSearchInput');
        const clearBtn = document.getElementById('commissionSearchClear');
        if (searchInput) searchInput.value = '';
        if (clearBtn) clearBtn.style.display = 'none';

        document.querySelectorAll('.ch-filter-chip').forEach(c => {
            if (c.getAttribute('data-filter') === 'all') c.classList.add('active');
            else c.classList.remove('active');
        });

        document.querySelectorAll('.date-chip').forEach(c => {
            if (c.getAttribute('data-date') === 'all') c.classList.add('active');
            else c.classList.remove('active');
        });

        applyFiltersAndRender();
    };

    // ── DETAILS MODAL CONTROLLER ──
    function openTransactionModal(txId) {
        const tx = allTransactions.find(t => String(t._id) === String(txId));
        if (!tx) return;

        const modal = document.getElementById('transactionModal');
        const modalBody = document.getElementById('transactionModalBody');
        if (!modal || !modalBody) return;

        const meta = getCommissionMeta(tx);
        const orderDisplay = tx.orderNumber ? `#${tx.orderNumber}` : (tx.orderId ? `#SM-${String(tx.orderId).slice(-6).toUpperCase()}` : 'Direct Reference');
        const rateDisplay = tx.percentage ? `${tx.percentage}%` : 'Standard';

        modalBody.innerHTML = `
            <div style="display: flex; align-items: center; gap: 14px; background: #FAF7F1; padding: 16px; border-radius: 12px; border: 1px solid rgba(16, 24, 32, 0.08);">
                <div class="ch-tx-icon-wrap ${meta.iconClass}" style="width: 52px; height: 52px; font-size: 26px;">
                    ${meta.icon}
                </div>
                <div>
                    <div style="font-size: 17px; font-weight: 800; color: #101820;">${escapeHtml(meta.label)}</div>
                    <div style="font-size: 13px; color: #64748B;">Earned on customer purchase</div>
                </div>
                <div style="margin-left: auto; text-align: right;">
                    <div style="font-size: 22px; font-weight: 800; color: #16A34A;">+${formatCurrency(tx.amount)}</div>
                    <span class="ch-tx-status-badge">✓ Credited to Wallet</span>
                </div>
            </div>

            <div class="ch-modal-info-grid">
                <div class="ch-modal-info-item">
                    <div class="ch-modal-info-label">Transaction Date</div>
                    <div class="ch-modal-info-val">${formatDateTime(tx.date)}</div>
                </div>
                <div class="ch-modal-info-item">
                    <div class="ch-modal-info-label">Related Order</div>
                    <div class="ch-modal-info-val" style="font-family: monospace;">${escapeHtml(orderDisplay)}</div>
                </div>
                <div class="ch-modal-info-item">
                    <div class="ch-modal-info-label">Commission Rate</div>
                    <div class="ch-modal-info-val">${escapeHtml(rateDisplay)}</div>
                </div>
                <div class="ch-modal-info-item">
                    <div class="ch-modal-info-label">Tree / Referral Tier</div>
                    <div class="ch-modal-info-val">${escapeHtml(meta.levelBadge)}</div>
                </div>
                <div class="ch-modal-info-item" style="grid-column: span 2;">
                    <div class="ch-modal-info-label">Transaction Reference</div>
                    <div class="ch-modal-info-val" style="font-family: monospace; font-size: 12.5px; color: #64748B;">${escapeHtml(txId)}</div>
                </div>
            </div>
        `;

        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }
    window.openTransactionModal = openTransactionModal;

    function closeTransactionModal() {
        const modal = document.getElementById('transactionModal');
        if (modal) {
            modal.classList.remove('open');
            modal.setAttribute('aria-hidden', 'true');
        }
        document.body.style.overflow = '';
    }
    window.closeTransactionModal = closeTransactionModal;

    // ── INITIALIZE EVENTS ──
    function initEvents() {
        // Type filter chips
        document.querySelectorAll('.ch-filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.ch-filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                currentTypeFilter = chip.getAttribute('data-filter') || 'all';
                applyFiltersAndRender();
            });
        });

        // Date chips
        document.querySelectorAll('.date-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.date-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                currentDateFilter = chip.getAttribute('data-date') || 'all';
                applyFiltersAndRender();
            });
        });

        // Search input
        const searchInput = document.getElementById('commissionSearchInput');
        const clearBtn = document.getElementById('commissionSearchClear');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                searchQuery = e.target.value.trim();
                if (clearBtn) clearBtn.style.display = searchQuery ? 'flex' : 'none';
                applyFiltersAndRender();
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                searchQuery = '';
                clearBtn.style.display = 'none';
                applyFiltersAndRender();
            });
        }

        // Modal backdrop click
        const modal = document.getElementById('transactionModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeTransactionModal();
            });
        }

        // Escape key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('transactionModal');
                if (modal && modal.classList.contains('open')) closeTransactionModal();
            }
        });
    }

    // Bootstrap on DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        initEvents();
        fetchCommissions(1);
    });
})();
