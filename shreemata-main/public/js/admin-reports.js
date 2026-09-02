/**
 * Centralized Reports & Exports Admin Script
 * Handles Date Filtering, Data Fetching, Dynamic Table Preview, and CSV Exports
 */

const API_BASE = window.API_URL || '/api';
let currentLoadedData = [];
let currentReportType = '';
let currentReportTitle = '';

document.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth();
    initializeDefaultDates();
    attachReportEvents();
});

// Admin Authentication Check
function checkAdminAuth() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || 'null');

    if (!token || !user || user.role !== 'admin') {
        alert('Admin access required');
        window.location.href = '/login.html';
        return;
    }

    const userNameEl = document.getElementById('userName');
    if (userNameEl) {
        userNameEl.textContent = `Hello, ${user.name || 'Admin'}`;
    }
}

// Set default start and end dates (This Month by default)
function initializeDefaultDates() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayStr = firstDay.toISOString().split('T')[0];
    const todayStr = now.toISOString().split('T')[0];

    // Set all card date inputs
    document.querySelectorAll('.report-start-date').forEach(input => {
        input.value = firstDayStr;
    });
    document.querySelectorAll('.report-end-date').forEach(input => {
        input.value = todayStr;
    });

    const globalFrom = document.getElementById('globalFromDate');
    const globalTo = document.getElementById('globalToDate');
    if (globalFrom && globalTo) {
        globalFrom.value = firstDayStr;
        globalTo.value = todayStr;
    }
}

// Global Quick Preset Selector
function applyGlobalPreset(period) {
    const now = new Date();
    let fromDate, toDate;
    let label = '';

    document.querySelectorAll('.preset-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.period === period);
    });

    switch (period) {
        case 'today':
            fromDate = new Date(now);
            toDate = new Date(now);
            label = 'Today';
            break;
        case 'yesterday':
            fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            toDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            label = 'Yesterday';
            break;
        case 'last7days':
            fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            toDate = new Date(now);
            label = 'Last 7 Days';
            break;
        case 'thismonth':
            fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
            toDate = new Date(now);
            label = 'This Month';
            break;
        case 'lastmonth':
            fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            toDate = new Date(now.getFullYear(), now.getMonth(), 0);
            label = 'Last Month';
            break;
        case 'last30days':
            fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            toDate = new Date(now);
            label = 'Last 30 Days';
            break;
        case 'thisyear':
            fromDate = new Date(now.getFullYear(), 0, 1);
            toDate = new Date(now);
            label = 'This Year';
            break;
        case 'all':
            document.querySelectorAll('.report-start-date').forEach(i => i.value = '');
            document.querySelectorAll('.report-end-date').forEach(i => i.value = '');
            const gF = document.getElementById('globalFromDate');
            const gT = document.getElementById('globalToDate');
            if (gF) gF.value = '';
            if (gT) gT.value = '';
            updateRangeBadge('All Time');
            return;
    }

    const fromStr = fromDate.toISOString().split('T')[0];
    const toStr = toDate.toISOString().split('T')[0];

    document.querySelectorAll('.report-start-date').forEach(input => input.value = fromStr);
    document.querySelectorAll('.report-end-date').forEach(input => input.value = toStr);

    const gF = document.getElementById('globalFromDate');
    const gT = document.getElementById('globalToDate');
    if (gF) gF.value = fromStr;
    if (gT) gT.value = toStr;

    updateRangeBadge(`${label} (${fromStr} to ${toStr})`);
}

function updateRangeBadge(text) {
    const badge = document.getElementById('rangeIndicator');
    if (badge) {
        badge.textContent = `Selected: ${text}`;
    }
}

function syncGlobalDatesToCards() {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    const from = document.getElementById('globalFromDate').value;
    const to = document.getElementById('globalToDate').value;

    document.querySelectorAll('.report-start-date').forEach(i => i.value = from);
    document.querySelectorAll('.report-end-date').forEach(i => i.value = to);

    updateRangeBadge(from || to ? `${from || 'Start'} to ${to || 'Present'}` : 'All Time');
}

// Attach Event Listeners
function attachReportEvents() {
    // 1. Preview Buttons
    document.querySelectorAll('.btn-preview-report').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const card = e.target.closest('.report-card');
            const reportKey = card.dataset.report;
            const reportTitle = card.dataset.title;
            await triggerReportPreview(card, reportKey, reportTitle);
        });
    });

    // 2. Export CSV Buttons
    document.querySelectorAll('.btn-export-csv').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const card = e.target.closest('.report-card');
            const reportKey = card.dataset.report;
            const reportTitle = card.dataset.title;
            await triggerReportExport(card, reportKey, reportTitle);
        });
    });
}

// Fetch report data from backend API
async function fetchReportData(reportKey, startDate, endDate, extraParams = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        throw new Error('Please login as admin');
    }

    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);

    for (const key in extraParams) {
        if (extraParams[key] && extraParams[key] !== 'all') {
            params.set(key, extraParams[key]);
        }
    }

    const endpoint = `${API_BASE}/admin/reports/${reportKey}?${params.toString()}`;
    const res = await fetch(endpoint, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to fetch report (Status ${res.status})`);
    }

    const json = await res.json();
    return json.data || [];
}

// -------------------------------------------------------------
// PREVIEW LOGIC
// -------------------------------------------------------------
async function triggerReportPreview(card, reportKey, reportTitle) {
    const previewContainer = document.getElementById('reportPreviewContainer');
    if (!previewContainer) return;

    const startDate = card.querySelector('.report-start-date')?.value || '';
    const endDate = card.querySelector('.report-end-date')?.value || '';
    
    // Gather extra filter inputs in card if any
    const extraParams = {};
    card.querySelectorAll('.report-extra-filter').forEach(select => {
        if (select.name) extraParams[select.name] = select.value;
    });

    const btn = card.querySelector('.btn-preview-report');
    const originalBtnHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Loading...';

    // Show loading state in container
    previewContainer.innerHTML = `
        <div class="preview-loading-box">
            <div class="spinner"></div>
            <div style="font-weight: 700; font-size: 15px; margin-top: 12px;">Fetching ${reportTitle}...</div>
            <div style="color: var(--text-muted); font-size: 13px;">Preparing live data table</div>
        </div>
    `;
    previewContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
        const data = await fetchReportData(reportKey, startDate, endDate, extraParams);
        currentLoadedData = data;
        currentReportType = reportKey;
        currentReportTitle = reportTitle;

        renderPreviewTable(reportTitle, data, startDate, endDate);
        showToast(`Loaded ${data.length} records for ${reportTitle}`, 'success');
    } catch (error) {
        console.error('Preview error:', error);
        previewContainer.innerHTML = `
            <div class="preview-empty-box">
                <div style="font-size: 36px; margin-bottom: 8px;">⚠️</div>
                <div style="font-weight: 700; font-size: 16px; color: var(--danger);">Failed to Load Report</div>
                <div style="color: var(--text-muted); font-size: 13.5px; margin-top: 4px;">${error.message}</div>
            </div>
        `;
        showToast(`Error: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalBtnHTML;
    }
}

// Render Table into Preview Area
function renderPreviewTable(title, data, startDate, endDate) {
    const container = document.getElementById('reportPreviewContainer');
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = `
            <div class="preview-wrapper">
                <div class="preview-header-bar">
                    <div class="preview-title-wrap">
                        <h3>📊 ${title}</h3>
                        <span class="preview-badge-empty">0 Records</span>
                    </div>
                </div>
                <div class="preview-empty-box">
                    <div style="font-size: 40px; margin-bottom: 8px;">📭</div>
                    <div style="font-weight: 700; font-size: 16px; color: var(--text-main);">No Records Found</div>
                    <div style="color: var(--text-muted); font-size: 13px; margin-top: 4px;">
                        No data matches the selected date range (${startDate || 'Start'} to ${endDate || 'Present'}).
                    </div>
                </div>
            </div>
        `;
        return;
    }

    const headers = Object.keys(data[0]);

    // Calculate Summary Metrics if applicable
    let totalSumText = '';
    const numericKeys = headers.filter(h => h.includes('(₹)') || h.includes('Amount') || h.includes('Total'));
    if (numericKeys.length > 0) {
        const firstNumKey = numericKeys[0];
        const sum = data.reduce((acc, row) => acc + (Number(row[firstNumKey]) || 0), 0);
        totalSumText = `<span class="preview-metric-badge">💰 Total: ₹${sum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;
    }

    const tableRowsHtml = data.map((row, rIdx) => {
        const cellsHtml = headers.map(h => {
            const val = row[h];
            let cellContent = val !== null && val !== undefined ? val : '-';

            // Status badges styling
            if (h === 'Payment Status' || h === 'Status' || h === 'Delivery Status' || h === 'Type') {
                const statusLower = String(val).toLowerCase();
                const badgeClass = statusLower.includes('completed') || statusLower.includes('delivered') || statusLower.includes('credit') || statusLower.includes('yes') || statusLower.includes('active')
                    ? 'badge-success'
                    : statusLower.includes('pending')
                    ? 'badge-warning'
                    : statusLower.includes('failed') || statusLower.includes('debit') || statusLower.includes('cancelled')
                    ? 'badge-danger'
                    : 'badge-info';
                cellContent = `<span class="table-badge ${badgeClass}">${val}</span>`;
            }

            return `<td>${cellContent}</td>`;
        }).join('');

        return `<tr data-row-index="${rIdx}">${cellsHtml}</tr>`;
    }).join('');

    container.innerHTML = `
        <div class="preview-wrapper">
            <!-- Top Controls Bar -->
            <div class="preview-header-bar">
                <div class="preview-title-wrap">
                    <h3>📊 ${title}</h3>
                    <span class="preview-badge-count" id="previewCountBadge">${data.length} Records</span>
                    ${totalSumText}
                </div>
                <div class="preview-actions-wrap">
                    <div class="preview-search-box">
                        <span>🔍</span>
                        <input type="text" id="previewTableSearch" placeholder="Filter in table..." onkeyup="filterPreviewTable(this.value)">
                    </div>
                    <button type="button" class="btn-preview-action btn-preview-export" onclick="exportCurrentPreviewToCSV()">
                        <span>⬇️</span> Export CSV
                    </button>
                    <button type="button" class="btn-preview-action btn-preview-print" onclick="window.print()">
                        <span>🖨️</span> Print
                    </button>
                    <button type="button" class="btn-preview-action btn-preview-close" onclick="clearPreviewTable()">
                        <span>❌</span> Close
                    </button>
                </div>
            </div>

            <!-- Responsive Table -->
            <div class="preview-table-responsive">
                <table class="preview-data-table" id="previewDataTable">
                    <thead>
                        <tr>
                            ${headers.map(h => `<th>${h}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody id="previewTableBody">
                        ${tableRowsHtml}
                    </tbody>
                </table>
            </div>

            <!-- Bottom Table Footer -->
            <div class="preview-footer-bar">
                <div>Showing dynamic data for <strong>${startDate || 'All Time'}</strong> to <strong>${endDate || 'Present'}</strong></div>
                <div style="font-size: 12px; color: var(--text-muted);">Centralized Reports & Exports System</div>
            </div>
        </div>
    `;
}

// Live Search Filter within Table
function filterPreviewTable(query) {
    query = (query || '').toLowerCase().trim();
    const rows = document.querySelectorAll('#previewTableBody tr');
    let visibleCount = 0;

    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        const matches = text.includes(query);
        row.style.display = matches ? '' : 'none';
        if (matches) visibleCount++;
    });

    const countBadge = document.getElementById('previewCountBadge');
    if (countBadge) {
        countBadge.textContent = `${visibleCount} of ${rows.length} Records`;
    }
}

// Clear Preview Table
function clearPreviewTable() {
    const container = document.getElementById('reportPreviewContainer');
    if (container) {
        container.innerHTML = '';
    }
    currentLoadedData = [];
    currentReportType = '';
    currentReportTitle = '';
}

// -------------------------------------------------------------
// EXPORT CSV LOGIC
// -------------------------------------------------------------
async function triggerReportExport(card, reportKey, reportTitle) {
    const startDate = card.querySelector('.report-start-date')?.value || '';
    const endDate = card.querySelector('.report-end-date')?.value || '';

    const extraParams = {};
    card.querySelectorAll('.report-extra-filter').forEach(select => {
        if (select.name) extraParams[select.name] = select.value;
    });

    const btn = card.querySelector('.btn-export-csv');
    const originalBtnHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Exporting...';

    try {
        showToast(`Preparing ${reportTitle} export...`, 'info');
        const data = await fetchReportData(reportKey, startDate, endDate, extraParams);

        if (!data || data.length === 0) {
            showToast('No records available to export for this date range', 'error');
            return;
        }

        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `${reportKey}_report_${dateStr}.csv`;
        downloadCSV(data, filename);

        showToast(`Successfully downloaded ${filename}!`, 'success');
    } catch (error) {
        console.error('Export error:', error);
        showToast(`Export failed: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalBtnHTML;
    }
}

function exportCurrentPreviewToCSV() {
    if (!currentLoadedData || currentLoadedData.length === 0) {
        showToast('No data loaded to export', 'error');
        return;
    }

    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `${currentReportType || 'custom'}_report_${dateStr}.csv`;
    downloadCSV(currentLoadedData, filename);
    showToast(`Successfully downloaded ${filename}!`, 'success');
}

// Convert JSON array to CSV Blob and download
function downloadCSV(dataArray, filename) {
    if (!dataArray || !dataArray.length) return;

    const headers = Object.keys(dataArray[0]);
    const csvRows = [];

    // Header row
    csvRows.push(headers.map(h => escapeCSVValue(h)).join(','));

    // Data rows
    dataArray.forEach(row => {
        const values = headers.map(h => escapeCSVValue(row[h]));
        csvRows.push(values.join(','));
    });

    const csvContent = '\uFEFF' + csvRows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Helper to escape values for CSV
function escapeCSVValue(val) {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
}

// Toast Notification Helper
function showToast(message, type = 'success') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'info' ? 'ℹ️' : '❌'}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
