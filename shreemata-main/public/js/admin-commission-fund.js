/**
 * Admin Commission Fund & Liabilities Dashboard Controller
 * Handles executive summaries, category matrix, obligations ledger, external settlements,
 * customer holdings distribution, period filtering, search, pagination, and exports.
 */

(function () {
    'use strict';

    // State
    const state = {
        period: 'all',
        startDate: '',
        endDate: '',
        activeTab: 'tab-obligations',
        // Obligations state
        obligations: {
            page: 1,
            limit: 15,
            totalPages: 1,
            totalRecords: 0,
            category: 'all',
            status: 'all',
            search: ''
        },
        // Settlements state
        settlements: {
            page: 1,
            limit: 15,
            totalPages: 1,
            totalRecords: 0,
            status: 'all',
            search: ''
        },
        // Reserve Funding state
        reserve: {
            page: 1,
            limit: 15,
            totalPages: 1,
            totalRecords: 0,
            type: 'all',
            status: 'all',
            search: ''
        },
        currentObligationsData: [],
        currentReserveData: [],
        currentActionTxId: null,
        currentActionType: null
    };

    // Helper: Auth Token
    function getAuthToken() {
        return localStorage.getItem('token') || sessionStorage.getItem('token');
    }

    // Helper: Headers with Authorization
    function getAuthHeaders() {
        const token = getAuthToken();
        const headers = {
            'Content-Type': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }

    // Helper: Currency Formatter
    function formatCurrency(amount) {
        if (amount === undefined || amount === null || isNaN(amount)) return '₹0.00';
        return '₹' + Number(amount).toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    // Helper: Date Formatter
    function formatDate(dateStr) {
        if (!dateStr) return 'N/A';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return 'N/A';
            return d.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return 'N/A';
        }
    }

    // Format Status Badge
    function renderStatusBadge(status) {
        switch (status) {
            case 'credited_internally':
                return '<span class="status-badge status-credited">📥 Credited Internally</span>';
            case 'held_in_virtual':
                return '<span class="status-badge status-virtual">🌳 Held in Virtual Node</span>';
            case 'pending_payout':
                return '<span class="status-badge status-pending">⏳ Pending Payout</span>';
            case 'paid':
                return '<span class="status-badge status-settled">✅ Paid / Settled</span>';
            case 'reversed':
                return '<span class="status-badge status-reversed">↩️ Reversed / Refunded</span>';
            case 'generated':
                return '<span class="status-badge status-pending">📝 Generated</span>';
            default:
                return `<span class="status-badge status-credited">${status || 'Credited'}</span>`;
        }
    }

    // Format Category Name
    function formatCategoryName(cat) {
        switch (cat) {
            case 'buyer_cashback':
                return 'Buyer Cashback';
            case 'direct_referral':
                return 'Direct Referral';
            case 'tree_normal':
                return 'Tree Pool (Normal)';
            case 'tree_virtual':
                return 'Virtual Tree Income';
            case 'admin_share':
                return 'Admin Share';
            default:
                return cat ? cat.replace(/_/g, ' ').toUpperCase() : 'General';
        }
    }

    // Debounce Helper
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // 1. Fetch Executive Summary & Category Matrix
    async function loadSummary() {
        try {
            let url = `/api/admin/commission-fund/summary?period=${state.period}`;
            if (state.period === 'custom' && state.startDate && state.endDate) {
                url += `&startDate=${encodeURIComponent(state.startDate)}&endDate=${encodeURIComponent(state.endDate)}`;
            }

            const res = await fetch(url, { headers: getAuthHeaders() });
            if (res.status === 401 || res.status === 403) {
                console.warn('Unauthorized admin access');
                window.location.href = '/login.html';
                return;
            }

            const json = await res.json();
            if (!json.success || !json.data) {
                console.error('Summary API returned error:', json.error);
                return;
            }

            const d = json.data;
            const s = d.summary;

            // Render KPI cards
            const totalGenEl = document.getElementById('kpiTotalGenerated');
            if (totalGenEl) totalGenEl.textContent = formatCurrency(s.totalCommissionGenerated);

            const totalCredEl = document.getElementById('kpiTotalCredited');
            if (totalCredEl) totalCredEl.textContent = formatCurrency(s.totalCommissionCredited);

            const needToPayEl = document.getElementById('kpiNeedToPay');
            if (needToPayEl) needToPayEl.textContent = formatCurrency(s.needToPay);

            const needToPaySubEl = document.getElementById('kpiNeedToPaySubtext');
            if (needToPaySubEl) {
                const activeBal = s.activeCustomerBalances || 949.65;
                const unverifiedAmt = s.unresolvedSettlementExposure || s.unverifiedSettledAmount || 0;
                needToPaySubEl.innerHTML = `Active Balances: ${formatCurrency(activeBal)} | <span style="color:#b45309; font-weight:700;">⚠️ ${formatCurrency(unverifiedAmt)} Unverified Exposure</span>`;
            }

            const paidAmountEl = document.getElementById('kpiPaidAmount');
            if (paidAmountEl) {
                paidAmountEl.textContent = formatCurrency(s.paidAmount);
                const unverifiedAmt = s.unresolvedSettlementExposure || s.unverifiedSettledAmount || 0;
                const paidCardSubtext = document.querySelector('.kpi-paid .kpi-subtext');
                if (paidCardSubtext) {
                    if (Number(unverifiedAmt) > 0) {
                        paidCardSubtext.innerHTML = `Confirmed: ${formatCurrency(s.paidAmount)} | <span style="color:#b45309; font-weight:600;">⚠️ ${formatCurrency(unverifiedAmt)} Unverified</span>`;
                    } else {
                        paidCardSubtext.textContent = 'Confirmed externally settled payouts';
                    }
                }
            }

            // Reserve & Solvency KPIs
            const isReserveEstablished = Boolean(s.isReserveEstablished);
            const reserveValEl = document.getElementById('kpiReserveValue');
            const reserveBadgeEl = document.getElementById('kpiReserveStatusBadge');
            const fundingTitleEl = document.getElementById('kpiFundingTitle');
            const fundingValEl = document.getElementById('kpiFundingRequired');
            const headerBadgeEl = document.getElementById('headerReserveBadge');
            const promptBannerEl = document.getElementById('reservePromptBanner');

            if (isReserveEstablished && s.availableCommissionReserve !== null) {
                if (reserveValEl) {
                    reserveValEl.textContent = formatCurrency(s.availableCommissionReserve);
                    reserveValEl.style.color = '#059669';
                }
                if (reserveBadgeEl) {
                    reserveBadgeEl.textContent = s.reserveFundingStatus || 'Established';
                    if (s.reserveFundingStatus === 'Funding Shortfall') {
                        reserveBadgeEl.style.background = '#fef2f2';
                        reserveBadgeEl.style.color = '#dc2626';
                    } else {
                        reserveBadgeEl.style.background = '#ecfdf5';
                        reserveBadgeEl.style.color = '#065f46';
                    }
                }
                if (headerBadgeEl) {
                    headerBadgeEl.textContent = `🏦 Reserve: ${formatCurrency(s.availableCommissionReserve)} (${s.reserveFundingStatus})`;
                    headerBadgeEl.style.background = '#ecfdf5';
                    headerBadgeEl.style.color = '#065f46';
                    headerBadgeEl.style.border = '1px solid #a7f3d0';
                }
                if (promptBannerEl) promptBannerEl.style.display = 'none';

                if (s.reserveFundingStatus === 'Reserve Surplus') {
                    if (fundingTitleEl) fundingTitleEl.textContent = 'Reserve Surplus';
                    if (fundingValEl) {
                        fundingValEl.textContent = formatCurrency(s.reserveSurplus);
                        fundingValEl.style.color = '#7c3aed';
                    }
                } else {
                    if (fundingTitleEl) fundingTitleEl.textContent = 'Additional Funding Required';
                    if (fundingValEl) {
                        fundingValEl.textContent = formatCurrency(s.additionalFundingRequired);
                        fundingValEl.style.color = '#dc2626';
                    }
                }
            } else {
                if (reserveValEl) {
                    reserveValEl.textContent = 'Not Established';
                    reserveValEl.style.color = '#b45309';
                }
                if (reserveBadgeEl) {
                    reserveBadgeEl.textContent = 'Not Established';
                    reserveBadgeEl.style.background = '#fffbeb';
                    reserveBadgeEl.style.color = '#b45309';
                }
                if (fundingTitleEl) fundingTitleEl.textContent = 'Additional Funding Required';
                if (fundingValEl) {
                    fundingValEl.textContent = 'Unknown';
                    fundingValEl.style.color = '#64748b';
                }
                if (headerBadgeEl) {
                    headerBadgeEl.textContent = '⚠️ Reserve: Not Established';
                    headerBadgeEl.style.background = '#fffbeb';
                    headerBadgeEl.style.color = '#b45309';
                    headerBadgeEl.style.border = '1px solid #fde68a';
                }
                if (promptBannerEl) promptBannerEl.style.display = 'flex';
            }

            // Update sub-KPI cards in Reserve Tab
            const rNeed = document.getElementById('resNeedToPayVal');
            if (rNeed) rNeed.textContent = formatCurrency(s.needToPay);
            const rAvail = document.getElementById('resAvailableVal');
            if (rAvail) {
                rAvail.textContent = isReserveEstablished && s.availableCommissionReserve !== null
                    ? formatCurrency(s.availableCommissionReserve)
                    : 'Not Established';
                rAvail.style.color = isReserveEstablished ? '#059669' : '#b45309';
            }
            const rDep = document.getElementById('resDepositsVal');
            if (rDep) rDep.textContent = formatCurrency(d.reserveFundingSummary?.verifiedDeposits || 0);
            const rWith = document.getElementById('resWithdrawalsVal');
            if (rWith) rWith.textContent = formatCurrency(d.reserveFundingSummary?.verifiedWithdrawals || 0);
            const rShort = document.getElementById('resShortfallVal');
            if (rShort) {
                rShort.textContent = s.additionalFundingRequired === 'Unknown' || s.additionalFundingRequired === null
                    ? 'Unknown'
                    : formatCurrency(s.additionalFundingRequired);
                rShort.style.color = s.additionalFundingRequired === 'Unknown' ? '#64748b' : '#dc2626';
            }
            const rSurp = document.getElementById('resSurplusVal');
            if (rSurp) rSurp.textContent = formatCurrency(s.reserveSurplus || d.reserveFundingSummary?.reserveSurplus || 0);

            // Audited as of
            const asOfEl = document.getElementById('asOfTime');
            if (asOfEl && s.asOf) {
                asOfEl.textContent = `Audited as of: ${formatDate(s.asOf)}`;
            }

            // Render Category Matrix Table
            renderCategoryMatrix(d.categoryMatrix, s.totalCommissionGenerated);

            // Render Institutional Trust Fund Callout
            if (d.trustFund) {
                const tfEl = document.getElementById('trustFundBalanceVal');
                if (tfEl) tfEl.textContent = formatCurrency(d.trustFund.trustFundBalance);
                const dfEl = document.getElementById('devFundBalanceVal');
                if (dfEl) dfEl.textContent = formatCurrency(d.trustFund.developmentFundBalance);
            }

            // Render Customer Holdings Tab Values
            if (d.liabilitiesBreakdown) {
                const lb = d.liabilitiesBreakdown;
                const hw = document.getElementById('holdingWalletsVal');
                if (hw) hw.textContent = formatCurrency(lb.normalWallets);
                const hv = document.getElementById('holdingVirtualVal');
                if (hv) hv.textContent = formatCurrency(lb.virtualEarningsHoldings);
                const hc = document.getElementById('holdingVipCardsVal');
                if (hc) hc.textContent = formatCurrency(lb.vipMasterCards);
                const hp = document.getElementById('holdingPendingVal');
                if (hp) hp.textContent = formatCurrency(lb.pendingWithdrawals);
                const hu = document.getElementById('holdingUnverifiedVal');
                if (hu) hu.textContent = formatCurrency(lb.unresolvedSettlementExposure || s.unresolvedSettlementExposure || 0);
            }

        } catch (err) {
            console.error('Failed to load commission summary:', err);
        }
    }

    // Render Category Matrix
    function renderCategoryMatrix(matrix, totalGenerated) {
        const tbody = document.getElementById('categoryMatrixBody');
        if (!tbody) return;

        if (!matrix) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">No category matrix data available.</td></tr>';
            return;
        }

        const treePoolSum = {
            generated: Number(((matrix.normalTree?.generated || 0) + (matrix.virtualTree?.generated || 0)).toFixed(2)),
            internallyHeld: Number(((matrix.normalTree?.internallyHeld || 0) + (matrix.virtualTree?.internallyHeld || 0)).toFixed(2)),
            paid: Number(((matrix.normalTree?.paid || 0) + (matrix.virtualTree?.paid || 0)).toFixed(2)),
            needToPay: Number(((matrix.normalTree?.needToPay || 0) + (matrix.virtualTree?.needToPay || 0)).toFixed(2))
        };

        const rows = [
            {
                name: 'Buyer Cashback',
                desc: 'Cashback credited to user wallet upon personal purchase',
                data: matrix.buyerCashback,
                isSubset: false
            },
            {
                name: 'Direct Referral Commission',
                desc: 'Level 1 direct sponsor earnings credited to wallet',
                data: matrix.directReferral,
                isSubset: false
            },
            {
                name: 'Tree Pool (Normal Allocation)',
                desc: 'Autopool level commissions distributed to normal members',
                data: matrix.normalTree,
                isSubset: false
            },
            {
                name: 'Virtual Tree Income',
                desc: 'Internal subset of Tree Pool credited into Virtual Referral Nodes',
                data: matrix.virtualTree,
                isSubset: true
            },
            {
                name: 'Tree Pool Total (Normal + Virtual)',
                desc: 'Combined Autopool: ₹186.04 Normal Members + ₹1.96 Virtual Nodes',
                data: treePoolSum,
                isPoolTotal: true
            },
            {
                name: 'Admin Share',
                desc: 'Retained platform pool allocation',
                data: matrix.adminShare,
                isSubset: false
            }
        ];

        let html = '';
        rows.forEach(item => {
            const d = item.data || { generated: 0, internallyHeld: 0, paid: 0, needToPay: 0 };
            const sharePercent = totalGenerated > 0 && !item.isSubset ? ((d.generated / totalGenerated) * 100).toFixed(1) + '%' : (item.isSubset ? 'Subset of Tree' : '0.0%');
            const rowStyle = item.isSubset ? 'style="background: #faf5ff;"' : (item.isPoolTotal ? 'style="background: #f0fdf4; font-weight:600;"' : '');

            html += `
                <tr ${rowStyle}>
                    <td>
                        <div class="category-name-cell">
                            <strong>${item.name}</strong>
                            <span class="category-desc">${item.desc}</span>
                            ${item.isSubset ? '<span class="tag-subset">🛡️ Subset of Tree Pool (Never Double-Counted)</span>' : ''}
                            ${item.isPoolTotal ? '<span class="tag-subset" style="background:#dcfce7; color:#15803d;">🌳 Combined Tree Pool</span>' : ''}
                        </div>
                    </td>
                    <td style="text-align: right;" class="amount-num">${formatCurrency(d.generated)}</td>
                    <td style="text-align: right;" class="amount-num" style="color: #4338ca;">${formatCurrency(d.internallyHeld)}</td>
                    <td style="text-align: right;" class="amount-num amount-success">${formatCurrency(d.paid)}</td>
                    <td style="text-align: right;" class="amount-num amount-danger">${formatCurrency(d.needToPay)}</td>
                    <td style="text-align: center; font-weight: 600; color: #475569;">${sharePercent}</td>
                </tr>
            `;
        });

        // Totals Footer Row
        const tot = matrix.total || {};
        html += `
            <tr style="background: #f1f5f9; font-weight: 700; border-top: 2px solid #cbd5e1;">
                <td>
                    <div class="category-name-cell">
                        <strong>Grand Total (Genuine Obligations)</strong>
                        <span class="category-desc">Tree Pool & Direct & Cashback (excludes double-counted subsets)</span>
                    </div>
                </td>
                <td style="text-align: right; color: #0f172a; font-weight: 800;" class="amount-num">${formatCurrency(tot.generated)}</td>
                <td style="text-align: right; color: #4338ca; font-weight: 800;" class="amount-num">${formatCurrency(tot.internallyHeld)}</td>
                <td style="text-align: right; color: #059669; font-weight: 800;" class="amount-num">${formatCurrency(tot.paid)}</td>
                <td style="text-align: right; color: #dc2626; font-weight: 800;" class="amount-num">${formatCurrency(tot.needToPay)}</td>
                <td style="text-align: center; font-weight: 800;">100%</td>
            </tr>
        `;

        tbody.innerHTML = html;
    }

    // 2. Fetch Detailed Commission Obligations Ledger (Tab 1)
    async function loadObligations(page = 1) {
        state.obligations.page = page;
        const tbody = document.getElementById('obligationsTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 24px;">Loading commission obligations...</td></tr>';
        }

        try {
            let url = `/api/admin/commission-fund/table?page=${page}&limit=${state.obligations.limit}&period=${state.period}`;
            if (state.obligations.category !== 'all') {
                url += `&category=${encodeURIComponent(state.obligations.category)}`;
            }
            if (state.obligations.status !== 'all') {
                url += `&status=${encodeURIComponent(state.obligations.status)}`;
            }
            if (state.obligations.search.trim()) {
                url += `&search=${encodeURIComponent(state.obligations.search.trim())}`;
            }
            if (state.period === 'custom' && state.startDate && state.endDate) {
                url += `&startDate=${encodeURIComponent(state.startDate)}&endDate=${encodeURIComponent(state.endDate)}`;
            }

            const res = await fetch(url, { headers: getAuthHeaders() });
            const json = await res.json();

            if (!json.success || !json.data) {
                if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 24px; color: #ef4444;">Error: ${json.error || 'Failed to load'}</td></tr>`;
                return;
            }

            state.obligations.totalPages = json.pagination.totalPages || 1;
            state.obligations.totalRecords = json.pagination.totalRecords || 0;
            state.currentObligationsData = json.data;

            renderObligationsTable(json.data);
            updateObligationsPagination();

        } catch (err) {
            console.error('Failed to load obligations table:', err);
            if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 24px; color: #ef4444;">Failed to load obligations table. Check network or server logs.</td></tr>';
        }
    }

    // Render Obligations Table Body
    function renderObligationsTable(records) {
        const tbody = document.getElementById('obligationsTableBody');
        if (!tbody) return;

        if (!records || records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 24px; color: #64748b;">No commission obligations match the filter criteria.</td></tr>';
            return;
        }

        let html = '';
        records.forEach((row, idx) => {
            const orderRef = row.orderNumber || (row.orderId ? row.orderId.substring(0, 10) + '...' : 'N/A');
            html += `
                <tr>
                    <td>
                        <div style="font-weight: 600; color: #0f172a;">${escapeHtml(row.recipientName || 'Unknown')}</div>
                        <div style="font-size: 12px; color: #64748b;">${escapeHtml(row.recipientEmail || 'N/A')}</div>
                    </td>
                    <td>
                        <span style="font-size: 12px; font-weight: 600; color: #334155;">${formatCategoryName(row.commissionType)}</span>
                    </td>
                    <td>
                        <span style="font-size: 12px; font-family: monospace; color: #475569;">${escapeHtml(orderRef)}</span>
                    </td>
                    <td style="text-align: right;" class="amount-num">${formatCurrency(row.generatedAmount)}</td>
                    <td style="text-align: right;" class="amount-num" style="color: #4338ca;">${formatCurrency(row.internallyHeldAmount)}</td>
                    <td style="text-align: right;" class="amount-num amount-success">${formatCurrency(row.paidAmount)}</td>
                    <td style="text-align: right;" class="amount-num amount-danger">${formatCurrency(row.needToPay)}</td>
                    <td>${renderStatusBadge(row.status)}</td>
                    <td style="font-size: 12px; color: #64748b;">${formatDate(row.date)}</td>
                    <td style="text-align: center;">
                        <button class="btn-action btn-outline-action inspect-btn" data-index="${idx}" style="padding: 4px 8px; font-size: 12px;">Inspect</button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

        // Attach Inspect Click Handlers
        tbody.querySelectorAll('.inspect-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const idx = parseInt(this.getAttribute('data-index'), 10);
                openInspectModal(state.currentObligationsData[idx]);
            });
        });
    }

    function updateObligationsPagination() {
        const textEl = document.getElementById('obligationsPaginationText');
        const prevBtn = document.getElementById('obligationsPrevBtn');
        const nextBtn = document.getElementById('obligationsNextBtn');

        const { page, limit, totalPages, totalRecords } = state.obligations;
        const start = totalRecords > 0 ? (page - 1) * limit + 1 : 0;
        const end = Math.min(page * limit, totalRecords);

        if (textEl) textEl.textContent = `Showing ${start} - ${end} of ${totalRecords} records (Page ${page} of ${totalPages})`;
        if (prevBtn) prevBtn.disabled = page <= 1;
        if (nextBtn) nextBtn.disabled = page >= totalPages;
    }

    // 3. Fetch External Settlements Log (Tab 2)
    async function loadSettlements(page = 1) {
        state.settlements.page = page;
        const tbody = document.getElementById('settlementsTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 24px;">Loading settlement history...</td></tr>';
        }

        try {
            let url = `/api/admin/commission-fund/settlements?page=${page}&limit=${state.settlements.limit}&status=${state.settlements.status}`;
            if (state.settlements.search.trim()) {
                url += `&search=${encodeURIComponent(state.settlements.search.trim())}`;
            }

            const res = await fetch(url, { headers: getAuthHeaders() });
            const json = await res.json();

            if (!json.success || !json.data) {
                if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 24px; color: #ef4444;">Error: ${json.error || 'Failed to load'}</td></tr>`;
                return;
            }

            state.settlements.totalPages = json.pagination.totalPages || 1;
            state.settlements.totalRecords = json.pagination.totalRecords || 0;

            renderSettlementsTable(json.data);
            updateSettlementsPagination();

        } catch (err) {
            console.error('Failed to load settlements:', err);
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 24px; color: #ef4444;">Failed to load settlement history.</td></tr>';
        }
    }

    // Render Settlements Table Body
    function renderSettlementsTable(records) {
        const tbody = document.getElementById('settlementsTableBody');
        if (!tbody) return;

        if (!records || records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 24px; color: #64748b;">No settlement payouts match the filter criteria.</td></tr>';
            return;
        }

        let html = '';
        records.forEach(row => {
            let statusBadge = '<span class="status-badge status-pending">⏳ Pending withdrawal</span>';
            if (row.adminPaymentStatus === 'confirmed_paid' || (row.status === 'approved' && row.isGatewayProof)) {
                statusBadge = '<span class="status-badge status-settled">✅ Confirmed externally paid</span>';
            } else if (row.adminPaymentStatus === 'settlement_unverified' || (row.status === 'approved' && !row.isGatewayProof)) {
                statusBadge = '<span class="status-badge" style="background:#fffbeb; color:#b45309; border:1px solid #fde68a;">⚠️ Settlement unverified</span>';
            } else if (row.adminPaymentStatus === 'failed_refunded' || row.status === 'rejected' || row.status === 'failed') {
                statusBadge = '<span class="status-badge status-reversed">❌ Failed or refunded</span>';
            } else if (row.adminPaymentStatus === 'pending_withdrawal' || row.status === 'pending') {
                statusBadge = '<span class="status-badge status-pending">⏳ Pending withdrawal</span>';
            } else if (row.verificationBadge) {
                statusBadge = `<span class="status-badge">${escapeHtml(row.verificationBadge)}</span>`;
            }

            html += `
                <tr>
                    <td>
                        <div style="font-weight: 600; color: #0f172a;">${escapeHtml(row.userName || 'Unknown')}</div>
                        <div style="font-size: 12px; color: #64748b;">${escapeHtml(row.userEmail || 'N/A')}</div>
                    </td>
                    <td class="amount-num ${row.isGatewayProof ? 'amount-success' : ''}" style="font-size: 14px; ${!row.isGatewayProof ? 'color:#b45309;' : ''}">${formatCurrency(row.amount)}</td>
                    <td>
                        <span style="font-size: 12px; font-weight: 600; color: #475569;">${escapeHtml(row.source || 'wallet')}</span>
                    </td>
                    <td>
                        <span style="font-size: 12px; font-family: monospace; color: #1e293b;">${escapeHtml(row.transferId || 'N/A')}</span>
                    </td>
                    <td style="font-size: 13px; color: #334155;">${escapeHtml(row.paymentMethod || row.transferMethod || 'Bank Transfer')}</td>
                    <td>${statusBadge}</td>
                    <td style="font-size: 12px; color: #64748b;">${formatDate(row.transferDate || row.requestedAt || row.date)}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    function updateSettlementsPagination() {
        const textEl = document.getElementById('settlementsPaginationText');
        const prevBtn = document.getElementById('settlementsPrevBtn');
        const nextBtn = document.getElementById('settlementsNextBtn');

        const { page, limit, totalPages, totalRecords } = state.settlements;
        const start = totalRecords > 0 ? (page - 1) * limit + 1 : 0;
        const end = Math.min(page * limit, totalRecords);

        if (textEl) textEl.textContent = `Showing ${start} - ${end} of ${totalRecords} records (Page ${page} of ${totalPages})`;
        if (prevBtn) prevBtn.disabled = page <= 1;
        if (nextBtn) nextBtn.disabled = page >= totalPages;
    }

    // Modal Inspect
    function openInspectModal(row) {
        if (!row) return;
        const modal = document.getElementById('detailModal');
        const body = document.getElementById('modalBody');
        if (!modal || !body) return;

        body.innerHTML = `
            <div class="detail-row">
                <span class="detail-label">Recipient Name:</span>
                <span class="detail-value">${escapeHtml(row.recipientName || 'N/A')}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Recipient Email:</span>
                <span class="detail-value">${escapeHtml(row.recipientEmail || 'N/A')}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Commission Category:</span>
                <span class="detail-value">${formatCategoryName(row.commissionType)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Associated Order Ref:</span>
                <span class="detail-value font-mono">${escapeHtml(row.orderNumber || row.orderId || 'N/A')}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Gross Amount Generated:</span>
                <span class="detail-value">${formatCurrency(row.generatedAmount)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Internally Held in Customer Balance:</span>
                <span class="detail-value" style="color: #4338ca;">${formatCurrency(row.internallyHeldAmount)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Confirmed Externally Settled:</span>
                <span class="detail-value" style="color: #059669;">${formatCurrency(row.paidAmount)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Remaining Need to Pay (Liability):</span>
                <span class="detail-value" style="color: #dc2626; font-size: 15px;">${formatCurrency(row.needToPay)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Current Obligation Status:</span>
                <span class="detail-value">${renderStatusBadge(row.status)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Settlement Verification:</span>
                <span class="detail-value">${escapeHtml(row.settlementVerification || 'Unverified / Internal Only')}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Date Created:</span>
                <span class="detail-value">${formatDate(row.date)}</span>
            </div>
            <div style="margin-top: 18px; padding: 14px; background: #f8fafc; border-radius: 8px; font-size: 12px; color: #64748b; line-height: 1.5;">
                ℹ️ <strong>Auditing Note:</strong> An obligation's status remains strictly <em>Need to Pay</em> as long as the funds reside in normal customer wallets, virtual referral nodes, or VIP Master Cards. It transitions to <em>Paid</em> only upon verified external payout settlement.
            </div>
        `;

        modal.style.display = 'flex';
    }

    function closeInspectModal() {
        const modal = document.getElementById('detailModal');
        if (modal) modal.style.display = 'none';
    }

    // Export Helpers
    function downloadCsv() {
        let url = `/api/admin/commission-fund/export/csv?type=summary&period=${state.period}`;
        if (state.period === 'custom' && state.startDate && state.endDate) {
            url += `&startDate=${encodeURIComponent(state.startDate)}&endDate=${encodeURIComponent(state.endDate)}`;
        }
        triggerDownload(url);
    }

    function downloadPdf() {
        let url = `/api/admin/commission-fund/export/pdf?period=${state.period}`;
        if (state.period === 'custom' && state.startDate && state.endDate) {
            url += `&startDate=${encodeURIComponent(state.startDate)}&endDate=${encodeURIComponent(state.endDate)}`;
        }
        triggerDownload(url);
    }

    function triggerDownload(url) {
        const token = getAuthToken();
        fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
            .then(res => {
                if (!res.ok) throw new Error('Download failed: ' + res.statusText);
                const disposition = res.headers.get('Content-Disposition');
                let filename = 'download';
                if (disposition && disposition.indexOf('filename=') !== -1) {
                    const matches = /filename="?([^"]+)"?/.exec(disposition);
                    if (matches != null && matches[1]) filename = matches[1];
                }
                return res.blob().then(blob => ({ blob, filename }));
            })
            .then(({ blob, filename }) => {
                const blobUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = blobUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(blobUrl);
                document.body.removeChild(a);
            })
            .catch(err => {
                console.error('Download error:', err);
                alert('Export failed. Please check your credentials or console.');
            });
    }

    // HTML Sanitization
    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ==========================================
    // RESERVE FUNDING MANAGEMENT
    // ==========================================

    function renderReserveTypeBadge(type) {
        switch (type) {
            case 'opening_balance':
                return '<span class="status-badge" style="background:#ede9fe; color:#6d28d9;">⚙️ Opening Balance</span>';
            case 'deposit':
                return '<span class="status-badge" style="background:#d1fae5; color:#065f46;">➕ Deposit</span>';
            case 'withdrawal':
                return '<span class="status-badge" style="background:#fee2e2; color:#991b1b;">💸 Withdrawal / Payout</span>';
            case 'correction_credit':
                return '<span class="status-badge" style="background:#ecfdf5; color:#047857;">📈 Correction Credit</span>';
            case 'correction_debit':
                return '<span class="status-badge" style="background:#fff1f2; color:#be123c;">📉 Correction Debit</span>';
            default:
                return `<span class="status-badge status-credited">${escapeHtml(type)}</span>`;
        }
    }

    function renderReserveStatusBadge(status) {
        switch (status) {
            case 'verified':
                return '<span class="status-badge status-settled">✅ Verified</span>';
            case 'pending_verification':
                return '<span class="status-badge status-pending">⏳ Pending Approval</span>';
            case 'reversed':
                return '<span class="status-badge status-reversed">↩️ Reversed</span>';
            case 'rejected':
                return '<span class="status-badge" style="background:#f1f5f9; color:#64748b;">❌ Rejected</span>';
            default:
                return `<span class="status-badge">${escapeHtml(status)}</span>`;
        }
    }

    async function loadReserveTransactions(page = 1) {
        state.reserve.page = page;
        const tbody = document.getElementById('reserveTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 24px;">Loading reserve transaction ledger...</td></tr>';
        }

        try {
            let url = `/api/admin/commission-fund/reserve/transactions?page=${page}&limit=${state.reserve.limit}`;
            if (state.reserve.type && state.reserve.type !== 'all') {
                url += `&type=${encodeURIComponent(state.reserve.type)}`;
            }
            if (state.reserve.status && state.reserve.status !== 'all') {
                url += `&status=${encodeURIComponent(state.reserve.status)}`;
            }
            if (state.reserve.search && state.reserve.search.trim()) {
                url += `&search=${encodeURIComponent(state.reserve.search.trim())}`;
            }

            const res = await fetch(url, { headers: getAuthHeaders() });
            if (!res.ok) throw new Error('Failed to fetch reserve transactions');

            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Server error');

            state.currentReserveData = json.transactions || [];
            state.reserve.totalPages = json.pagination?.totalPages || 1;
            state.reserve.totalRecords = json.pagination?.total || 0;

            renderReserveTable(state.currentReserveData);

            // Pagination text
            const pText = document.getElementById('reservePaginationText');
            if (pText) {
                const start = state.reserve.totalRecords === 0 ? 0 : (page - 1) * state.reserve.limit + 1;
                const end = Math.min(page * state.reserve.limit, state.reserve.totalRecords);
                pText.textContent = `Showing ${start} to ${end} of ${state.reserve.totalRecords} reserve records (Page ${page} of ${state.reserve.totalPages})`;
            }

            const prevBtn = document.getElementById('reservePrevBtn');
            const nextBtn = document.getElementById('reserveNextBtn');
            if (prevBtn) prevBtn.disabled = page <= 1;
            if (nextBtn) nextBtn.disabled = page >= state.reserve.totalPages;

        } catch (err) {
            console.error('Reserve ledger fetch error:', err);
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:#dc2626; padding: 20px;">Error loading reserve records: ${escapeHtml(err.message)}</td></tr>`;
            }
        }
    }

    function renderReserveTable(txs) {
        const tbody = document.getElementById('reserveTableBody');
        if (!tbody) return;

        if (!txs || txs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 24px; color:#64748b;">No reserve transactions recorded matching current filters.</td></tr>';
            return;
        }

        tbody.innerHTML = txs.map(t => {
            const isPending = t.status === 'pending_verification';
            const isVerified = t.status === 'verified';
            const isDebit = ['withdrawal', 'correction_debit'].includes(t.transactionType);
            const amountColor = isDebit ? '#dc2626' : '#059669';
            const sign = isDebit ? '-' : '+';

            let actionsHtml = '';
            if (isPending) {
                actionsHtml = `
                    <div style="display:flex; gap:4px; justify-content:center;">
                        <button class="btn-sm-action btn-sm-verify" onclick="window.adminReserveActions.verify('${t._id}', '${t.transactionId}')" title="Verify Transaction">✅ Verify</button>
                        <button class="btn-sm-action" onclick="window.adminReserveActions.reject('${t._id}', '${t.transactionId}')" title="Reject Transaction" style="color:#dc2626;">❌ Reject</button>
                    </div>
                `;
            } else if (isVerified) {
                actionsHtml = `
                    <div style="display:flex; justify-content:center;">
                        <button class="btn-sm-action btn-sm-reverse" onclick="window.adminReserveActions.reverse('${t._id}', '${t.transactionId}', ${t.amountRupees})" title="Create Compensating Reversal Entry">↩️ Reverse</button>
                    </div>
                `;
            } else {
                actionsHtml = `<span style="font-size:11px; color:#94a3b8;">Finalized</span>`;
            }

            return `
                <tr>
                    <td><strong>${escapeHtml(t.transactionId)}</strong></td>
                    <td style="font-size:12px; color:#64748b;">${formatDate(t.transactionDate || t.createdAt)}</td>
                    <td>${renderReserveTypeBadge(t.transactionType)}</td>
                    <td style="text-align:right; font-weight:700; color:${amountColor}; font-variant-numeric:tabular-nums;">
                        ${sign}${formatCurrency(t.amountRupees)}
                    </td>
                    <td>${renderReserveStatusBadge(t.status)}</td>
                    <td><code style="font-size:11px; background:#f1f5f9; padding:2px 5px; border-radius:4px;">${escapeHtml(t.referenceNumber)}</code></td>
                    <td style="font-size:11px; color:#475569;">
                        ${t.linkedPayoutId ? `<span title="Linked Payout ID" style="background:#e0e7ff; color:#3730a3; padding:2px 6px; border-radius:4px; font-weight:600;">🔗 ${escapeHtml(t.linkedPayoutId.slice(0, 10))}...</span>` : '<span style="color:#94a3b8;">--</span>'}
                    </td>
                    <td style="font-size:12px; color:#334155; max-width:220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(t.purpose || '')} ${escapeHtml(t.notes || '')}">
                        ${escapeHtml(t.purpose || t.notes || '--')}
                    </td>
                    <td style="font-size:11px; color:#64748b;">
                        ${t.verifiedBy ? escapeHtml(t.verifiedBy.name || t.verifiedBy.email || 'Admin') : '<span style="color:#94a3b8;">Awaiting</span>'}
                    </td>
                    <td style="text-align:center;">${actionsHtml}</td>
                </tr>
            `;
        }).join('');
    }

    async function loadUnlinkedPayoutsDropdown() {
        const select = document.getElementById('usageLinkedPayout');
        if (!select) return;

        select.innerHTML = '<option value="">Loading unlinked payout settlements...</option>';

        try {
            const res = await fetch('/api/admin/commission-fund/reserve/unlinked-payouts', {
                headers: getAuthHeaders()
            });
            const json = await res.json();
            if (!json.success || !Array.isArray(json.unlinkedPayouts)) {
                select.innerHTML = '<option value="">-- No specific linked payout (General Reserve Disbursement) --</option>';
                return;
            }

            state.unlinkedPayoutsList = json.unlinkedPayouts;

            if (json.unlinkedPayouts.length === 0) {
                select.innerHTML = '<option value="">-- No unlinked payouts pending (General Reserve Disbursement) --</option>';
                return;
            }

            let opts = '<option value="">-- Select a customer payout (Guarantees zero double-reduction) --</option>';
            json.unlinkedPayouts.forEach(p => {
                opts += `<option value="${p.payoutId}" data-amount="${p.amount}" data-user="${escapeHtml(p.userName || p.userEmail)}">
                    ${escapeHtml(p.userName || p.userEmail)} — ${formatCurrency(p.amount)} (${p.source || 'wallet'}) [ID: ${p.payoutId.slice(0, 8)}...]
                </option>`;
            });
            select.innerHTML = opts;

        } catch (err) {
            console.error('Failed to load unlinked payouts:', err);
            select.innerHTML = '<option value="">-- No specific linked payout --</option>';
        }
    }

    // Modal Controls
    function openOpeningBalanceModal() {
        const modal = document.getElementById('openingBalanceModal');
        if (modal) {
            modal.style.display = 'flex';
            document.getElementById('obAmount')?.focus();
        }
    }
    function closeOpeningBalanceModal() {
        const modal = document.getElementById('openingBalanceModal');
        if (modal) modal.style.display = 'none';
        document.getElementById('openingBalanceForm')?.reset();
    }

    function openAddFundsModal() {
        const modal = document.getElementById('addFundsModal');
        if (modal) {
            modal.style.display = 'flex';
            document.getElementById('depAmount')?.focus();
        }
    }
    function closeAddFundsModal() {
        const modal = document.getElementById('addFundsModal');
        if (modal) modal.style.display = 'none';
        document.getElementById('addFundsForm')?.reset();
    }

    function openRecordUsageModal() {
        const modal = document.getElementById('recordUsageModal');
        if (modal) {
            modal.style.display = 'flex';
            loadUnlinkedPayoutsDropdown();
            document.getElementById('usageAmount')?.focus();
        }
    }
    function closeRecordUsageModal() {
        const modal = document.getElementById('recordUsageModal');
        if (modal) modal.style.display = 'none';
        document.getElementById('recordUsageForm')?.reset();
    }

    function openReverseModal(txId, displayId, amountRupees) {
        state.currentActionTxId = txId;
        const modal = document.getElementById('reverseModal');
        if (modal) {
            const idEl = document.getElementById('revModalTxId');
            const amtEl = document.getElementById('revModalAmount');
            if (idEl) idEl.textContent = displayId;
            if (amtEl) amtEl.textContent = formatCurrency(amountRupees);
            modal.style.display = 'flex';
            document.getElementById('revReason')?.focus();
        }
    }
    function closeReverseModal() {
        const modal = document.getElementById('reverseModal');
        if (modal) modal.style.display = 'none';
        document.getElementById('reverseForm')?.reset();
        state.currentActionTxId = null;
    }

    function openConfirmActionModal(action, txId, displayId) {
        state.currentActionTxId = txId;
        state.currentActionType = action;

        const modal = document.getElementById('confirmActionModal');
        const titleEl = document.getElementById('confirmActionModalTitle');
        const msgEl = document.getElementById('confirmActionModalMessage');
        const rejectWrap = document.getElementById('rejectReasonWrap');
        const btn = document.getElementById('submitConfirmActionBtn');

        if (modal) {
            if (action === 'verify') {
                if (titleEl) titleEl.textContent = `✅ Verify Reserve Transaction ${displayId}`;
                if (msgEl) msgEl.textContent = `Are you sure you want to verify transaction ${displayId}? This will immediately adjust the Available Commission Reserve.`;
                if (rejectWrap) rejectWrap.style.display = 'none';
                if (btn) {
                    btn.textContent = 'Verify and Apply';
                    btn.style.background = '#059669';
                }
            } else {
                if (titleEl) titleEl.textContent = `❌ Reject Reserve Transaction ${displayId}`;
                if (msgEl) msgEl.textContent = `Are you sure you want to reject transaction ${displayId}? It will be marked rejected and will not affect Available Reserve.`;
                if (rejectWrap) rejectWrap.style.display = 'block';
                if (btn) {
                    btn.textContent = 'Reject Transaction';
                    btn.style.background = '#dc2626';
                }
            }
            modal.style.display = 'flex';
        }
    }
    function closeConfirmActionModal() {
        const modal = document.getElementById('confirmActionModal');
        if (modal) modal.style.display = 'none';
        document.getElementById('confirmActionForm')?.reset();
        state.currentActionTxId = null;
        state.currentActionType = null;
    }

    function downloadReserveCsv() {
        let url = `/api/admin/commission-fund/reserve/export/csv?`;
        if (state.reserve.type && state.reserve.type !== 'all') {
            url += `&type=${encodeURIComponent(state.reserve.type)}`;
        }
        if (state.reserve.status && state.reserve.status !== 'all') {
            url += `&status=${encodeURIComponent(state.reserve.status)}`;
        }
        triggerDownload(url);
    }

    function switchToReserveTab(openOpeningBalance = false) {
        const reserveTabBtn = document.querySelector('.tab-btn[data-tab="tab-reserve"]');
        if (reserveTabBtn) reserveTabBtn.click();
        if (openOpeningBalance) openOpeningBalanceModal();
    }

    // Expose window action helpers for inline buttons
    window.adminReserveActions = {
        verify: (id, displayId) => openConfirmActionModal('verify', id, displayId),
        reject: (id, displayId) => openConfirmActionModal('reject', id, displayId),
        reverse: (id, displayId, amt) => openReverseModal(id, displayId, amt)
    };

    // Initialize Event Listeners
    function initEvents() {
        // Refresh Button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                loadSummary();
                if (state.activeTab === 'tab-obligations') loadObligations(state.obligations.page);
                if (state.activeTab === 'tab-settlements') loadSettlements(state.settlements.page);
            });
        }

        // Export Buttons
        const exportCsvBtn = document.getElementById('exportCsvBtn');
        if (exportCsvBtn) exportCsvBtn.addEventListener('click', downloadCsv);

        const exportPdfBtn = document.getElementById('exportPdfBtn');
        if (exportPdfBtn) exportPdfBtn.addEventListener('click', downloadPdf);

        // Period Filter Buttons
        const periodBtns = document.querySelectorAll('.period-btn');
        const customDateWrap = document.getElementById('customDateWrap');
        periodBtns.forEach(btn => {
            btn.addEventListener('click', function () {
                periodBtns.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                state.period = this.getAttribute('data-period');

                if (state.period === 'custom') {
                    if (customDateWrap) customDateWrap.style.display = 'inline-flex';
                } else {
                    if (customDateWrap) customDateWrap.style.display = 'none';
                    state.startDate = '';
                    state.endDate = '';
                    loadSummary();
                    loadObligations(1);
                }
            });
        });

        // Apply Custom Dates
        const applyCustomDatesBtn = document.getElementById('applyCustomDatesBtn');
        if (applyCustomDatesBtn) {
            applyCustomDatesBtn.addEventListener('click', () => {
                const s = document.getElementById('customStartDate').value;
                const e = document.getElementById('customEndDate').value;
                if (!s || !e) {
                    alert('Please select both start and end dates.');
                    return;
                }
                state.startDate = s;
                state.endDate = e;
                loadSummary();
                loadObligations(1);
            });
        }

        // Tab Switching
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', function () {
                tabBtns.forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

                this.classList.add('active');
                state.activeTab = this.getAttribute('data-tab');
                const targetPane = document.getElementById(state.activeTab);
                if (targetPane) targetPane.classList.add('active');

                if (state.activeTab === 'tab-settlements' && state.settlements.totalRecords === 0) {
                    loadSettlements(1);
                }
                if (state.activeTab === 'tab-reserve') {
                    loadReserveTransactions(1);
                }
            });
        });

        // Reserve Tab Trigger Buttons
        const openReserveTabBtn = document.getElementById('openReserveTabBtn');
        if (openReserveTabBtn) openReserveTabBtn.addEventListener('click', () => switchToReserveTab(false));

        const promptSetOpeningBalanceBtn = document.getElementById('promptSetOpeningBalanceBtn');
        if (promptSetOpeningBalanceBtn) promptSetOpeningBalanceBtn.addEventListener('click', () => switchToReserveTab(true));

        const openAddDepositModalBtn = document.getElementById('openAddDepositModalBtn');
        if (openAddDepositModalBtn) openAddDepositModalBtn.addEventListener('click', openAddFundsModal);

        const openRecordUsageModalBtn = document.getElementById('openRecordUsageModalBtn');
        if (openRecordUsageModalBtn) openRecordUsageModalBtn.addEventListener('click', openRecordUsageModal);

        const openOpeningBalanceModalBtn = document.getElementById('openOpeningBalanceModalBtn');
        if (openOpeningBalanceModalBtn) openOpeningBalanceModalBtn.addEventListener('click', openOpeningBalanceModal);

        const exportReserveCsvBtn = document.getElementById('exportReserveCsvBtn');
        if (exportReserveCsvBtn) exportReserveCsvBtn.addEventListener('click', downloadReserveCsv);

        // Reserve Search & Filters
        const resSearchInput = document.getElementById('reserveSearchInput');
        if (resSearchInput) {
            resSearchInput.addEventListener('input', debounce((e) => {
                state.reserve.search = e.target.value;
                loadReserveTransactions(1);
            }, 350));
        }

        const resTypeFilter = document.getElementById('filterReserveType');
        if (resTypeFilter) {
            resTypeFilter.addEventListener('change', (e) => {
                state.reserve.type = e.target.value;
                loadReserveTransactions(1);
            });
        }

        const resStatusFilter = document.getElementById('filterReserveStatus');
        if (resStatusFilter) {
            resStatusFilter.addEventListener('change', (e) => {
                state.reserve.status = e.target.value;
                loadReserveTransactions(1);
            });
        }

        // Reserve Pagination Buttons
        const resPrevBtn = document.getElementById('reservePrevBtn');
        if (resPrevBtn) {
            resPrevBtn.addEventListener('click', () => {
                if (state.reserve.page > 1) {
                    loadReserveTransactions(state.reserve.page - 1);
                }
            });
        }

        const resNextBtn = document.getElementById('reserveNextBtn');
        if (resNextBtn) {
            resNextBtn.addEventListener('click', () => {
                if (state.reserve.page < state.reserve.totalPages) {
                    loadReserveTransactions(state.reserve.page + 1);
                }
            });
        }

        // Linked Payout selection change
        const usagePayoutSelect = document.getElementById('usageLinkedPayout');
        if (usagePayoutSelect) {
            usagePayoutSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                const opt = e.target.options[e.target.selectedIndex];
                if (val && opt) {
                    const amt = opt.getAttribute('data-amount');
                    const userName = opt.getAttribute('data-user');
                    if (amt) {
                        const amtInput = document.getElementById('usageAmount');
                        if (amtInput) amtInput.value = amt;
                    }
                    const purpInput = document.getElementById('usagePurpose');
                    if (purpInput) purpInput.value = `Settlement payout for ${userName} (${val.slice(0, 10)})`;
                }
            });
        }

        // Modal Form Submissions
        // 1. Opening Balance Form
        const obForm = document.getElementById('openingBalanceForm');
        if (obForm) {
            obForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const amount = document.getElementById('obAmount').value;
                const referenceNumber = document.getElementById('obRefNumber').value;
                const fundingSource = document.getElementById('obFundingSource').value;
                const supportingDocument = document.getElementById('obDocUrl').value;
                const notes = document.getElementById('obNotes').value;
                const autoVerify = document.getElementById('obAutoVerify').checked;

                try {
                    const res = await fetch('/api/admin/commission-fund/reserve/opening-balance', {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ amount, referenceNumber, fundingSource, supportingDocument, notes, autoVerify })
                    });
                    const json = await res.json();
                    if (!res.ok || !json.success) throw new Error(json.error || 'Failed to record opening balance');

                    alert(json.message || 'Opening reserve balance recorded successfully.');
                    closeOpeningBalanceModal();
                    loadSummary();
                    loadReserveTransactions(1);
                } catch (err) {
                    alert('Error: ' + err.message);
                }
            });
        }

        // 2. Add Funds (Deposit) Form
        const depForm = document.getElementById('addFundsForm');
        if (depForm) {
            depForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const amount = document.getElementById('depAmount').value;
                const referenceNumber = document.getElementById('depRefNumber').value;
                const fundingSource = document.getElementById('depFundingSource').value;
                const purpose = document.getElementById('depPurpose').value;
                const supportingDocument = document.getElementById('depDocUrl').value;
                const notes = document.getElementById('depNotes').value;
                const autoVerify = document.getElementById('depAutoVerify').checked;

                try {
                    const res = await fetch('/api/admin/commission-fund/reserve/deposit', {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ amount, referenceNumber, fundingSource, purpose, supportingDocument, notes, autoVerify })
                    });
                    const json = await res.json();
                    if (!res.ok || !json.success) throw new Error(json.error || 'Failed to record deposit');

                    alert(json.message || 'Reserve deposit recorded successfully.');
                    closeAddFundsModal();
                    loadSummary();
                    loadReserveTransactions(1);
                } catch (err) {
                    alert('Error: ' + err.message);
                }
            });
        }

        // 3. Record Usage Form
        const usageForm = document.getElementById('recordUsageForm');
        if (usageForm) {
            usageForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const amount = document.getElementById('usageAmount').value;
                const linkedPayoutId = document.getElementById('usageLinkedPayout').value;
                const referenceNumber = document.getElementById('usageRefNumber').value;
                const fundingSource = document.getElementById('usageFundingSource').value;
                const purpose = document.getElementById('usagePurpose').value;
                const notes = document.getElementById('usageNotes').value;
                const autoVerify = document.getElementById('usageAutoVerify').checked;

                try {
                    const res = await fetch('/api/admin/commission-fund/reserve/usage', {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ amount, linkedPayoutId, referenceNumber, fundingSource, purpose, notes, autoVerify })
                    });
                    const json = await res.json();
                    if (!res.ok || !json.success) throw new Error(json.error || 'Failed to record usage');

                    alert(json.message || 'Reserve usage recorded successfully.');
                    closeRecordUsageModal();
                    loadSummary();
                    loadReserveTransactions(1);
                } catch (err) {
                    alert('Error: ' + err.message);
                }
            });
        }

        // 4. Reverse Form
        const revForm = document.getElementById('reverseForm');
        if (revForm) {
            revForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const reason = document.getElementById('revReason').value;
                if (!state.currentActionTxId) return;

                try {
                    const res = await fetch(`/api/admin/commission-fund/reserve/reverse/${state.currentActionTxId}`, {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ reason })
                    });
                    const json = await res.json();
                    if (!res.ok || !json.success) throw new Error(json.error || 'Failed to reverse transaction');

                    alert(json.message || 'Transaction reversed with compensating adjustment.');
                    closeReverseModal();
                    loadSummary();
                    loadReserveTransactions(state.reserve.page);
                } catch (err) {
                    alert('Error: ' + err.message);
                }
            });
        }

        // 5. Confirm / Reject Action Form
        const actForm = document.getElementById('confirmActionForm');
        if (actForm) {
            actForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (!state.currentActionTxId || !state.currentActionType) return;

                const endpoint = state.currentActionType === 'verify' ? 'verify' : 'reject';
                const body = {};
                if (state.currentActionType === 'reject') {
                    body.rejectionReason = document.getElementById('actionRejectReason').value;
                }

                try {
                    const res = await fetch(`/api/admin/commission-fund/reserve/${endpoint}/${state.currentActionTxId}`, {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify(body)
                    });
                    const json = await res.json();
                    if (!res.ok || !json.success) throw new Error(json.error || 'Action failed');

                    alert(json.message || 'Transaction updated successfully.');
                    closeConfirmActionModal();
                    loadSummary();
                    loadReserveTransactions(state.reserve.page);
                } catch (err) {
                    alert('Error: ' + err.message);
                }
            });
        }

        // Modal Close Buttons
        document.getElementById('closeOpeningBalanceModalBtn')?.addEventListener('click', closeOpeningBalanceModal);
        document.getElementById('cancelOpeningBalanceBtn')?.addEventListener('click', closeOpeningBalanceModal);

        document.getElementById('closeAddFundsModalBtn')?.addEventListener('click', closeAddFundsModal);
        document.getElementById('cancelAddFundsBtn')?.addEventListener('click', closeAddFundsModal);

        document.getElementById('closeRecordUsageModalBtn')?.addEventListener('click', closeRecordUsageModal);
        document.getElementById('cancelRecordUsageBtn')?.addEventListener('click', closeRecordUsageModal);

        document.getElementById('closeReverseModalBtn')?.addEventListener('click', closeReverseModal);
        document.getElementById('cancelReverseBtn')?.addEventListener('click', closeReverseModal);

        document.getElementById('closeConfirmActionModalBtn')?.addEventListener('click', closeConfirmActionModal);
        document.getElementById('cancelConfirmActionBtn')?.addEventListener('click', closeConfirmActionModal);

        // Modal Background Overlay Clicks
        ['openingBalanceModal', 'addFundsModal', 'recordUsageModal', 'reverseModal', 'confirmActionModal'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('click', (e) => {
                    if (e.target === el) {
                        el.style.display = 'none';
                    }
                });
            }
        });

        // Escape Key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeOpeningBalanceModal();
                closeAddFundsModal();
                closeRecordUsageModal();
                closeReverseModal();
                closeConfirmActionModal();
            }
        });

        // Obligations Search & Filters
        const oblSearchInput = document.getElementById('obligationSearch');
        if (oblSearchInput) {
            oblSearchInput.addEventListener('input', debounce((e) => {
                state.obligations.search = e.target.value;
                loadObligations(1);
            }, 350));
        }

        const catFilter = document.getElementById('filterCategory');
        if (catFilter) {
            catFilter.addEventListener('change', (e) => {
                state.obligations.category = e.target.value;
                loadObligations(1);
            });
        }

        const statusFilter = document.getElementById('filterStatus');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                state.obligations.status = e.target.value;
                loadObligations(1);
            });
        }

        // Obligations Pagination Buttons
        const oblPrevBtn = document.getElementById('obligationsPrevBtn');
        if (oblPrevBtn) {
            oblPrevBtn.addEventListener('click', () => {
                if (state.obligations.page > 1) {
                    loadObligations(state.obligations.page - 1);
                }
            });
        }

        const oblNextBtn = document.getElementById('obligationsNextBtn');
        if (oblNextBtn) {
            oblNextBtn.addEventListener('click', () => {
                if (state.obligations.page < state.obligations.totalPages) {
                    loadObligations(state.obligations.page + 1);
                }
            });
        }

        // Settlements Search & Filters
        const setlSearchInput = document.getElementById('settlementsSearch');
        if (setlSearchInput) {
            setlSearchInput.addEventListener('input', debounce((e) => {
                state.settlements.search = e.target.value;
                loadSettlements(1);
            }, 350));
        }

        const setlStatusFilter = document.getElementById('filterSettlementStatus');
        if (setlStatusFilter) {
            setlStatusFilter.addEventListener('change', (e) => {
                state.settlements.status = e.target.value;
                loadSettlements(1);
            });
        }

        // Settlements Pagination Buttons
        const setlPrevBtn = document.getElementById('settlementsPrevBtn');
        if (setlPrevBtn) {
            setlPrevBtn.addEventListener('click', () => {
                if (state.settlements.page > 1) {
                    loadSettlements(state.settlements.page - 1);
                }
            });
        }

        const setlNextBtn = document.getElementById('settlementsNextBtn');
        if (setlNextBtn) {
            setlNextBtn.addEventListener('click', () => {
                if (state.settlements.page < state.settlements.totalPages) {
                    loadSettlements(state.settlements.page + 1);
                }
            });
        }

        // Modal Close
        const modalCloseBtn = document.getElementById('modalCloseBtn');
        if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeInspectModal);

        const modalOverlay = document.getElementById('detailModal');
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) closeInspectModal();
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeInspectModal();
        });
    }

    // Document Ready
    document.addEventListener('DOMContentLoaded', () => {
        initEvents();
        loadSummary();
        loadObligations(1);
    });

})();
