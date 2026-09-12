/**
 * SHREE MATA — ADMIN OPERATIONS DASHBOARD CONTROLLER
 * Fetches real-time operational metrics, renders KPI cards, Action Required,
 * Financial Summaries, Inventory Alerts, and 7-Day Sales Trend.
 */

(function () {
    let currentPeriod = 'today';
    let isRefreshing = false;
    let abortController = null;

    // Helper: Escape HTML
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Helper: Currency Formatter
    function formatCurrency(num) {
        const val = Number(num || 0);
        return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // Helper: Compact Currency Formatter
    function formatCompactCurrency(num) {
        const val = Number(num || 0);
        return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    // Helper: Date & Time Formatter
    function formatDateTime(dStr) {
        if (!dStr) return '—';
        try {
            const d = new Date(dStr);
            if (isNaN(d.getTime())) return dStr;
            const datePart = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            const timePart = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
            return `${datePart}, ${timePart}`;
        } catch (e) {
            return dStr;
        }
    }

    // Render Skeletons
    function renderLoadingSkeletons() {
        // KPI skeletons
        const kpiValues = document.querySelectorAll('.kpi-value');
        kpiValues.forEach(el => {
            el.innerHTML = '<div class="skeleton-shimmer" style="height: 28px; width: 60%; margin: 2px 0;"></div>';
        });

        // Action required skeleton
        const actionContainer = document.getElementById('actionRequiredContainer');
        if (actionContainer) {
            actionContainer.innerHTML = `
                <div class="skeleton-shimmer" style="height: 64px; margin-bottom: 10px;"></div>
                <div class="skeleton-shimmer" style="height: 64px; margin-bottom: 10px;"></div>
                <div class="skeleton-shimmer" style="height: 64px;"></div>
            `;
        }

        // Recent orders skeleton
        const ordersTableBody = document.getElementById('recentOrdersTableBody');
        if (ordersTableBody) {
            ordersTableBody.innerHTML = `
                <tr><td colspan="8"><div class="skeleton-shimmer" style="height: 38px;"></div></td></tr>
                <tr><td colspan="8"><div class="skeleton-shimmer" style="height: 38px;"></div></td></tr>
                <tr><td colspan="8"><div class="skeleton-shimmer" style="height: 38px;"></div></td></tr>
            `;
        }
    }

    // Main Fetch Function
    async function fetchDashboardMetrics(period = currentPeriod) {
        if (isRefreshing) return;
        isRefreshing = true;
        currentPeriod = period;

        const refreshBtn = document.getElementById('refreshDashboardBtn');
        if (refreshBtn) refreshBtn.classList.add('spinning');

        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = '/login.html';
            return;
        }

        // Cancel previous fetch if active
        if (abortController) {
            abortController.abort();
        }
        abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 15000);

        try {
            const res = await fetch(`/api/admin/dashboard/operations?period=${encodeURIComponent(period)}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                signal: abortController.signal
            });
            clearTimeout(timeoutId);

            if (res.status === 401 || res.status === 403) {
                window.location.href = '/login.html';
                return;
            }

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Failed to load dashboard data');
            }

            renderDashboard(data.data);
            updateLastUpdatedTime();

        } catch (err) {
            clearTimeout(timeoutId);
            console.error('Error loading operations dashboard:', err);
            showDashboardError(err.message || 'Unable to connect to operations server');
        } finally {
            isRefreshing = false;
            if (refreshBtn) refreshBtn.classList.remove('spinning');
        }
    }

    // Update Last Updated Timestamp
    function updateLastUpdatedTime() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        const lastEl = document.getElementById('lastUpdatedText');
        if (lastEl) {
            lastEl.textContent = `Last updated: ${timeStr}`;
        }
    }

    // Render Full Dashboard
    function renderDashboard(d) {
        if (!d) return;

        // 1. KPI Cards
        const kpis = d.kpis || {};
        setText('kpiOrdersToday', (kpis.ordersToday || 0).toLocaleString('en-IN'));
        setText('kpiRevenueToday', formatCurrency(kpis.revenueToday));
        setText('kpiPaidOrders', (kpis.paidOrdersToday || 0).toLocaleString('en-IN'));
        setText('kpiPendingPayments', (kpis.pendingPaymentsCount || 0).toLocaleString('en-IN'));
        setText('kpiOrdersToProcess', (kpis.ordersToProcess || 0).toLocaleString('en-IN'));
        setText('kpiReadyToDispatch', (kpis.readyToDispatch || 0).toLocaleString('en-IN'));
        setText('kpiReadyForPickup', (kpis.readyForPickup || 0).toLocaleString('en-IN'));
        setText('kpiDeliveredToday', (kpis.deliveredToday || 0).toLocaleString('en-IN'));
        setText('kpiCancelledToday', (kpis.cancelledToday || 0).toLocaleString('en-IN'));
        setText('kpiNewMembers', (kpis.newMembersToday || 0).toLocaleString('en-IN'));
        setText('kpiPendingWithdrawals', (kpis.pendingWithdrawalsCount || 0).toLocaleString('en-IN'));
        setText('kpiLowStock', (kpis.lowStockCount || 0).toLocaleString('en-IN'));

        // 2. Action Required Section
        renderActionRequired(d.actionRequired || []);

        // 3. Order Operations Breakdown
        renderOrderOperations(d.orderOperations || {});

        // 4. Recent Orders
        renderRecentOrders(d.recentOrders || []);

        // 5. Financial Overview
        renderFinancialOverview(d.financialOverview || {});

        // 6. Inventory Alerts
        renderInventoryAlerts(d.inventoryAlerts || {});

        // 7. Customers & Membership Overview
        renderCustomersAndMembership(d.customersAndMembership || {});

        // 8. Referral Network Overview
        renderReferralNetwork(d.referralNetwork || {});

        // 9. VIP Master Cards Overview
        renderVipCards(d.vipMasterCards || {});

        // 10. Payment Monitoring
        renderPaymentsMonitoring(d.paymentsMonitoring || {});

        // 11. 7-Day Sales Trend Chart
        renderSevenDaysSalesChart(d.sevenDaysSales || []);

        // 12. Read-Only Database Backup Health
        renderDatabaseBackup(d.databaseBackup || {});
    }

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    // Render Database Backup Health
    function renderDatabaseBackup(b) {
        const badge = document.getElementById('backupHealthBadge');
        if (badge) {
            badge.textContent = b.statusLabel || 'HEALTHY';
            if (b.alertLevel === 'HEALTHY') {
                badge.style.background = 'rgba(21, 128, 61, 0.12)';
                badge.style.color = '#15803d';
            } else if (b.alertLevel === 'WARNING') {
                badge.style.background = 'rgba(217, 119, 6, 0.14)';
                badge.style.color = '#d97706';
            } else if (b.alertLevel === 'CRITICAL') {
                badge.style.background = 'rgba(220, 38, 38, 0.14)';
                badge.style.color = '#dc2626';
            } else {
                badge.style.background = 'rgba(100, 116, 139, 0.14)';
                badge.style.color = '#64748b';
            }
        }

        setText('backupLastSuccessDate', b.lastBackupFormatted || '--');
        setText('backupAgeHours', b.ageHours !== null && b.ageHours !== undefined ? `${b.ageHours} hours ago` : '--');
        setText('backupLastSize', b.sizeFormatted || '--');
        setText('backupOffServerStatus', b.offServerStatus || '--');
        setText('backupLastRestoreTest', b.lastRestoreTestFormatted || 'Not Tested');
    }

    // Render Action Required Items
    function renderActionRequired(items) {
        const container = document.getElementById('actionRequiredContainer');
        if (!container) return;

        if (!items || items.length === 0) {
            container.innerHTML = `
                <div style="background: var(--sm-success-bg); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: var(--sm-radius-md); padding: 18px; text-align: center; color: #065F46; font-weight: 600; font-size: 14px;">
                    ✅ All Clear! No immediate operational bottlenecks requiring admin action.
                </div>
            `;
            return;
        }

        let html = '';
        items.forEach(item => {
            const priorityClass = item.priority === 'high' ? 'priority-high' : (item.priority === 'medium' ? 'priority-medium' : 'priority-info');
            const timeStr = item.timestamp ? formatDateTime(item.timestamp) : '';

            html += `
                <div class="action-item-card ${priorityClass}">
                    <div class="action-item-info">
                        <div class="action-item-title">${escapeHtml(item.title)}</div>
                        <div class="action-item-meta">${escapeHtml(item.description)} ${timeStr ? `• <span style="color: var(--sm-text-light);">${timeStr}</span>` : ''}</div>
                    </div>
                    <a href="${escapeHtml(item.link || '#')}" class="action-btn-pill">
                        ${escapeHtml(item.linkText || 'Take Action')} →
                    </a>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // Render Order Operations Breakdown
    function renderOrderOperations(ops) {
        const statusMap = ops.statusBreakdown || {};
        const deliveryMap = ops.deliveryStatusBreakdown || {};
        const methodMap = ops.deliveryMethodBreakdown || {};

        setText('opStatusNew', statusMap.pending || 0);
        setText('opStatusPendingPayment', statusMap.pending_payment_verification || 0);
        setText('opStatusProcessing', deliveryMap.processing || 0);
        setText('opStatusShipped', deliveryMap.shipped || 0);
        setText('opStatusReadyPickup', ops.readyForPickupCount || 0);
        setText('opStatusDelivered', deliveryMap.delivered || 0);
        setText('opStatusCancelled', statusMap.cancelled || 0);
    }

    // Render Recent Orders Table
    function renderRecentOrders(orders) {
        const tbody = document.getElementById('recentOrdersTableBody');
        if (!tbody) return;

        if (!orders || orders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--sm-text-muted);">No recent orders found.</td></tr>`;
            return;
        }

        let html = '';
        orders.forEach(o => {
            const invoiceNo = o.invoiceNumber || ('#' + o._id.toString().slice(-8).toUpperCase());
            const amountStr = formatCurrency(o.totalAmount);
            const isPaid = o.status === 'completed' || o.paymentStatus === 'verified' || o.paymentStatus === 'paid';
            const payClass = isPaid ? 'paid' : (o.status === 'cancelled' ? 'cancelled' : 'pending');
            const payLabel = isPaid ? 'Paid' : (o.status === 'cancelled' ? 'Cancelled' : 'Pending');

            let delLabel = o.deliveryStatus || 'Pending';
            let delClass = 'pending';
            if (o.deliveryStatus === 'delivered') { delClass = 'delivered'; delLabel = 'Delivered'; }
            else if (o.deliveryStatus === 'shipped') { delClass = 'processing'; delLabel = 'Shipped'; }
            else if (o.deliveryStatus === 'processing') { delClass = 'processing'; delLabel = 'Processing'; }

            const methodLabel = o.deliveryMethod === 'pickup' ? '🏪 Pickup' : '🚚 Delivery';
            const dateStr = formatDateTime(o.createdAt);

            html += `
                <tr>
                    <td><strong>${escapeHtml(invoiceNo)}</strong></td>
                    <td>
                        <div>${escapeHtml(o.customerName)}</div>
                        <div style="font-size: 11.5px; color: var(--sm-text-muted);">${escapeHtml(o.customerPhone)}</div>
                    </td>
                    <td><span style="font-size: 12px; color: var(--sm-text-muted);">${methodLabel}</span></td>
                    <td><strong>${amountStr}</strong></td>
                    <td><span class="order-badge-pill ${payClass}">${payLabel}</span></td>
                    <td><span class="order-badge-pill ${delClass}">${delLabel}</span></td>
                    <td style="font-size: 12px; color: var(--sm-text-muted);">${dateStr}</td>
                    <td>
                        <a href="/admin-orders.html" class="action-btn-pill" style="padding: 4px 10px; font-size: 11.5px;">
                            View
                        </a>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    // Render Financial Overview
    function renderFinancialOverview(fin) {
        setText('finSalesToday', formatCurrency(fin.salesToday));
        setText('finSalesMonth', formatCurrency(fin.salesThisMonth));
        setText('finCashbackPaid', formatCurrency(fin.buyerCashbackPaid));
        setText('finDirectReferralPaid', formatCurrency(fin.directReferralPaid));
        setText('finTreeCommissionPaid', formatCurrency(fin.treeCommissionPaid));
        setText('finWithdrawalsCompleted', formatCurrency(fin.withdrawalsCompleted));
        setText('finPendingWithdrawals', formatCurrency(fin.pendingWithdrawals));
        setText('finRefunds', formatCurrency(fin.refundsReversals));
    }

    // Render Inventory Alerts
    function renderInventoryAlerts(inv) {
        const container = document.getElementById('inventoryAlertsList');
        if (!container) return;

        setText('invTotalTitles', (inv.totalTitles || 0).toLocaleString('en-IN'));
        setText('invTotalUnits', (inv.totalStockUnits || 0).toLocaleString('en-IN'));
        setText('invOutOfStockCount', (inv.outOfStockCount || 0).toLocaleString('en-IN'));
        setText('invLowStockCount', (inv.lowStockCount || 0).toLocaleString('en-IN'));

        const items = inv.items || [];
        if (items.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; background: var(--sm-success-bg); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: var(--sm-radius-md); padding: 16px; text-align: center; color: #065F46; font-size: 13.5px; font-weight: 600;">
                    ✅ All inventory items are adequately stocked.
                </div>
            `;
            return;
        }

        let html = '';
        items.slice(0, 8).forEach(item => {
            const isOut = item.status === 'OUT_OF_STOCK' || item.stock === 0;
            const cardClass = isOut ? 'out-of-stock' : 'low-stock';
            const badgeText = isOut ? 'OUT OF STOCK' : `LOW STOCK (${item.stock} left)`;
            const badgeClass = isOut ? 'danger' : 'warning';
            const fallbackImg = '/images/press.png';
            const imgUrl = item.coverImage || fallbackImg;

            html += `
                <div class="inventory-alert-card ${cardClass}">
                    <img src="${escapeHtml(imgUrl)}" onerror="this.src='${fallbackImg}'" class="inventory-thumb" alt="Book Cover" />
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 13px; font-weight: 700; color: var(--sm-navy); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${escapeHtml(item.title)}
                        </div>
                        <div style="font-size: 11.5px; color: var(--sm-text-muted); margin-bottom: 4px;">
                            ${escapeHtml(item.author || '')} • ₹${Number(item.price || 0).toFixed(2)}
                        </div>
                        <span class="kpi-badge ${badgeClass}" style="font-size: 10px;">${badgeText}</span>
                    </div>
                    <a href="/admin.html" class="action-btn-pill" style="padding: 4px 8px; font-size: 11px;">
                        Manage
                    </a>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // Render Customers & Membership
    function renderCustomersAndMembership(cust) {
        setText('custTotalCustomers', (cust.totalCustomers || 0).toLocaleString('en-IN'));
        setText('custNewToday', (cust.newCustomersToday || 0).toLocaleString('en-IN'));
        setText('custTotalMembers', (cust.totalMembers || 0).toLocaleString('en-IN'));
        setText('custNewMembersToday', (cust.newMembersToday || 0).toLocaleString('en-IN'));
        setText('custNonMembers', (cust.nonMembersCount || 0).toLocaleString('en-IN'));
        setText('custReferralUsers', (cust.referralUsersCount || 0).toLocaleString('en-IN'));
    }

    // Render Referral Network
    function renderReferralNetwork(ref) {
        setText('refTotalReferred', (ref.totalReferred || 0).toLocaleString('en-IN'));
        setText('refTreeMembers', (ref.treeMembersCount || 0).toLocaleString('en-IN'));
        setText('refTreeCommissions', formatCompactCurrency(ref.treeCommissionsPaid));
    }

    // Render VIP Cards
    function renderVipCards(vip) {
        setText('vipTotalCards', (vip.totalCards || 0).toLocaleString('en-IN'));
        setText('vipHighestTier', `Tier ${vip.highestTier || 1}`);
        setText('vipTotalWithdrawn', formatCompactCurrency(vip.totalWithdrawn));
        setText('vipPendingWithdrawals', (vip.pendingWithdrawalsCount || 0).toLocaleString('en-IN'));
    }

    // Render Payment Monitoring
    function renderPaymentsMonitoring(pay) {
        setText('paySuccessfulCount', (pay.successfulCount || 0).toLocaleString('en-IN'));
        setText('payPendingCount', (pay.pendingVerificationCount || 0).toLocaleString('en-IN'));
        setText('payFailedCount', (pay.failedCount || 0).toLocaleString('en-IN'));
    }

    // Render 7-Day Sales SVG Chart
    function renderSevenDaysSalesChart(daysData) {
        const chartBox = document.getElementById('sevenDaysChartContainer');
        if (!chartBox) return;

        if (!daysData || daysData.length === 0) {
            chartBox.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--sm-text-muted);">No sales data available.</div>';
            return;
        }

        const maxRevenue = Math.max(...daysData.map(d => d.revenue || 0), 1000);
        const height = 160;
        const width = 600;
        const barWidth = 44;
        const spacing = (width - (barWidth * daysData.length)) / (daysData.length + 1);

        let barsSvg = '';
        daysData.forEach((day, idx) => {
            const barHeight = Math.max(8, (day.revenue / maxRevenue) * (height - 40));
            const x = spacing + idx * (barWidth + spacing);
            const y = height - 26 - barHeight;

            barsSvg += `
                <g class="chart-bar-group" style="cursor: pointer;">
                    <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="6" fill="url(#barGradient)" />
                    <text x="${x + barWidth / 2}" y="${height - 8}" text-anchor="middle" font-size="11" font-weight="700" fill="#64748B">${escapeHtml(day.label)}</text>
                    <text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" font-size="11" font-weight="800" fill="#101820">${formatCompactCurrency(day.revenue)}</text>
                    <title>${day.label}: ₹${day.revenue.toFixed(2)} (${day.ordersCount} orders)</title>
                </g>
            `;
        });

        chartBox.innerHTML = `
            <svg viewBox="0 0 ${width} ${height}" class="chart-svg-wrap" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#D4A72C" />
                        <stop offset="100%" stop-color="#AA820A" />
                    </linearGradient>
                </defs>
                <line x1="0" y1="${height - 24}" x2="${width}" y2="${height - 24}" stroke="#E2E8F0" stroke-width="1" />
                ${barsSvg}
            </svg>
        `;
    }

    // Show Error State
    function showDashboardError(msg) {
        const container = document.getElementById('actionRequiredContainer');
        if (container) {
            container.innerHTML = `
                <div style="background: var(--sm-danger-bg); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: var(--sm-radius-md); padding: 18px; text-align: center; color: #991B1B;">
                    ⚠️ ${escapeHtml(msg)}
                    <div style="margin-top: 10px;">
                        <button onclick="window.refreshOperationsDashboard()" style="padding: 6px 14px; background: var(--sm-danger); color: white; border: none; border-radius: 6px; font-weight: 700; cursor: pointer;">
                            🔄 Retry Loading
                        </button>
                    </div>
                </div>
            `;
        }
    }

    // Global Exposed Functions
    window.refreshOperationsDashboard = function () {
        fetchDashboardMetrics(currentPeriod);
    };

    window.switchDashboardPeriod = function (period) {
        document.querySelectorAll('.date-filter-chip').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.period === period);
        });
        fetchDashboardMetrics(period);
    };

    // Initialize on DOM Ready
    document.addEventListener('DOMContentLoaded', () => {
        // Set date string
        const dateEl = document.getElementById('headerDateDisplay');
        if (dateEl) {
            const today = new Date();
            dateEl.textContent = today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        }

        renderLoadingSkeletons();
        fetchDashboardMetrics('today');
    });

})();
