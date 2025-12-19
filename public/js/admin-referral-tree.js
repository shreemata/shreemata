const API = window.API_URL;

let currentPage = 1;
let currentViewMode = 'complete';
let currentFilters = {};
let treeData = null;
let statsData = null;
let charts = {};

document.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth();
    setupEventListeners();
    loadTreeData();
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

/* EVENT LISTENERS */
function setupEventListeners() {
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('applyFilters').addEventListener('click', applyFilters);
    document.getElementById('refreshData').addEventListener('click', () => loadTreeData());
    
    document.getElementById('viewMode').addEventListener('change', (e) => {
        currentViewMode = e.target.value;
        toggleViewModeControls();
        loadTreeData();
    });

    document.getElementById('exportStatsBtn').addEventListener('click', exportStatistics);
    document.getElementById('refreshStatsBtn').addEventListener('click', () => {
        currentViewMode = 'stats';
        document.getElementById('viewMode').value = 'stats';
        loadTreeData();
    });

    // Close modal when clicking outside or on close button
    const modal = document.getElementById('userDetailModal');
    const closeBtn = modal.querySelector('.close');
    
    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
}

/* LOGOUT */
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
}

/* TOGGLE VIEW MODE CONTROLS */
function toggleViewModeControls() {
    const levelInput = document.getElementById('levelInput');
    const maxDepthInput = document.getElementById('maxDepthInput');
    
    if (currentViewMode === 'level') {
        levelInput.style.display = 'inline-block';
        maxDepthInput.style.display = 'none';
    } else if (currentViewMode === 'complete') {
        levelInput.style.display = 'none';
        maxDepthInput.style.display = 'inline-block';
    } else {
        levelInput.style.display = 'none';
        maxDepthInput.style.display = 'none';
    }
}

/* APPLY FILTERS */
function applyFilters() {
    currentFilters = {
        referralStatus: document.getElementById('referralFilter').value,
        joinDate: document.getElementById('joinDateFilter').value,
        level: document.getElementById('levelInput').value,
        maxDepth: document.getElementById('maxDepthInput').value
    };
    
    currentPage = 1;
    loadTreeData();
}

/* LOAD TREE DATA */
async function loadTreeData() {
    try {
        showLoading();
        hideError();
        
        const token = localStorage.getItem('token');
        let endpoint = '';
        let queryParams = new URLSearchParams();
        
        // Add pagination
        queryParams.append('page', currentPage);
        queryParams.append('limit', '20');
        
        // Build endpoint based on view mode
        switch (currentViewMode) {
            case 'complete':
                endpoint = '/admin/referral-tree/complete';
                if (currentFilters.maxDepth) {
                    queryParams.append('maxDepth', currentFilters.maxDepth);
                }
                break;
            case 'level':
                const level = currentFilters.level || 0;
                endpoint = `/admin/referral-tree/level/${level}`;
                break;
            case 'stats':
                endpoint = '/admin/referral-tree/stats';
                break;
        }
        
        const url = `${API}${endpoint}?${queryParams.toString()}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                alert('Session expired. Please login again.');
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login.html';
                return;
            } else if (response.status === 403) {
                alert('Access denied. Admin privileges required.');
                window.location.href = '/admin.html';
                return;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (currentViewMode === 'stats') {
            statsData = data;
            displayStats(data);
            displayStatisticsDashboard(data);
            hideTreeView();
        } else {
            treeData = data;
            displayTreeData(data);
            displayStats(data.stats || {});
            hideStatisticsDashboard();
        }
        
        hideLoading();
        
    } catch (error) {
        console.error('Error loading tree data:', error);
        showError(`Failed to load tree data: ${error.message}`);
        hideLoading();
    }
}

/* DISPLAY STATISTICS */
function displayStats(stats) {
    const statsContainer = document.getElementById('treeStats');
    
    let statsHtml = '';
    
    if (currentViewMode === 'stats' && stats.overview) {
        // Full statistics view
        statsHtml = `
            <div class="stat-card">
                <h3>${stats.overview.totalUsers}</h3>
                <p>Total Users</p>
            </div>
            <div class="stat-card">
                <h3>${stats.overview.usersInTree}</h3>
                <p>Users in Tree</p>
            </div>
            <div class="stat-card">
                <h3>${stats.overview.deepestLevel}</h3>
                <p>Deepest Level</p>
            </div>
            <div class="stat-card">
                <h3>${stats.overview.usersWithoutReferrers}</h3>
                <p>No Referrer</p>
            </div>
            <div class="stat-card">
                <h3>${stats.fillRates.overall}%</h3>
                <p>Overall Fill Rate</p>
            </div>
            <div class="stat-card">
                <h3>₹${stats.commissionStatistics.totalCommissionsPaid.toFixed(2)}</h3>
                <p>Total Commissions</p>
            </div>
        `;
    } else if (stats.totalUsersInCurrentTree !== undefined) {
        // Tree view statistics
        statsHtml = `
            <div class="stat-card">
                <h3>${stats.totalUsersInCurrentTree}</h3>
                <p>Users in Current View</p>
            </div>
            <div class="stat-card">
                <h3>${stats.usersWithoutReferrers}</h3>
                <p>No Referrer</p>
            </div>
            <div class="stat-card">
                <h3>${stats.totalRootUsers}</h3>
                <p>Root Users</p>
            </div>
        `;
    } else if (stats.totalUsersAtLevel !== undefined) {
        // Level view statistics
        statsHtml = `
            <div class="stat-card">
                <h3>${stats.totalUsersAtLevel}</h3>
                <p>Users at Level</p>
            </div>
            <div class="stat-card">
                <h3>${stats.usersWithoutReferrers}</h3>
                <p>No Referrer</p>
            </div>
            <div class="stat-card">
                <h3>₹${stats.averageCommission}</h3>
                <p>Avg Commission</p>
            </div>
        `;
    }
    
    statsContainer.innerHTML = statsHtml;
}

/* DISPLAY TREE DATA */
function displayTreeData(data) {
    const container = document.getElementById('treeViewContainer');
    const content = document.getElementById('treeContent');
    
    if (currentViewMode === 'complete' && data.tree) {
        content.innerHTML = renderTreeNodes(data.tree);
        displayPagination(data.pagination);
    } else if (currentViewMode === 'level' && data.users) {
        content.innerHTML = renderLevelUsers(data.users, data.level);
        displayPagination(data.pagination);
    }
    
    container.style.display = 'block';
    
    // Add event listeners to tree nodes
    addTreeNodeEventListeners();
}

/* RENDER TREE NODES */
function renderTreeNodes(nodes, level = 0) {
    if (!nodes || nodes.length === 0) {
        return '<div class="empty-state"><p>No nodes at this level.</p></div>';
    }
    
    return nodes.map(node => {
        const referralStatusClass = node.referralStatus.joinedWithoutReferrer ? 'no-referrer' : 'has-referrer';
        const referralStatusText = node.referralStatus.joinedWithoutReferrer ? 'No Referrer' : 'Has Referrer';
        const referralStatusBadge = node.referralStatus.joinedWithoutReferrer ? 'no-referrer' : 'has-referrer';
        
        const childrenHtml = node.children && node.children.length > 0 
            ? `<div class="node-children">${renderTreeNodes(node.children, level + 1)}</div>`
            : '';
        
        return `
            <div class="tree-node ${referralStatusClass}" data-user-id="${node.id}">
                <div class="node-header">
                    <div class="node-info">
                        <div class="node-name">${node.name}</div>
                        <div class="node-details">
                            <span class="level-indicator">Level ${node.treeLevel}</span>
                            <span class="referral-status ${referralStatusBadge}">${referralStatusText}</span>
                            <span>Wallet: ₹${node.wallet.toFixed(2)}</span>
                            <span>Children: ${node.childrenCount}</span>
                            <span>Joined: ${new Date(node.joinDate).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div class="node-actions">
                        <button class="btn-info" onclick="showUserDetails('${node.id}')">Details</button>
                        ${node.childrenCount > 0 ? `<button class="btn-expand" onclick="toggleNodeChildren(this)">Expand</button>` : ''}
                    </div>
                </div>
                ${childrenHtml}
            </div>
        `;
    }).join('');
}

/* RENDER LEVEL USERS */
function renderLevelUsers(users, level) {
    if (!users || users.length === 0) {
        return '<div class="empty-state"><p>No users found at this level.</p></div>';
    }
    
    return `
        <div style="margin-bottom: 20px;">
            <h3>Level ${level} Users</h3>
        </div>
        ${users.map(user => {
            const referralStatusClass = user.referralStatus.joinedWithoutReferrer ? 'no-referrer' : 'has-referrer';
            const referralStatusText = user.referralStatus.joinedWithoutReferrer ? 'No Referrer' : 'Has Referrer';
            const referralStatusBadge = user.referralStatus.joinedWithoutReferrer ? 'no-referrer' : 'has-referrer';
            
            return `
                <div class="tree-node ${referralStatusClass}" data-user-id="${user.id}">
                    <div class="node-header">
                        <div class="node-info">
                            <div class="node-name">${user.name}</div>
                            <div class="node-details">
                                <span class="level-indicator">Level ${user.treeLevel}</span>
                                <span class="referral-status ${referralStatusBadge}">${referralStatusText}</span>
                                <span>Position: ${user.treePosition}</span>
                                <span>Wallet: ₹${user.wallet.toFixed(2)}</span>
                                <span>Children: ${user.relationships.treeChildrenCount}</span>
                                <span>Total Commission: ₹${user.commissions.total.toFixed(2)}</span>
                                <span>Joined: ${new Date(user.joinDate).toLocaleDateString()}</span>
                            </div>
                        </div>
                        <div class="node-actions">
                            <button class="btn-info" onclick="showUserDetails('${user.id}')">Details</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('')}
    `;
}

/* DISPLAY PAGINATION */
function displayPagination(pagination) {
    const container = document.getElementById('paginationContainer');
    
    if (!pagination || pagination.totalPages <= 1) {
        container.style.display = 'none';
        return;
    }
    
    let paginationHtml = '';
    
    // Previous button
    paginationHtml += `
        <button ${!pagination.hasPrevPage ? 'disabled' : ''} onclick="changePage(${pagination.currentPage - 1})">
            Previous
        </button>
    `;
    
    // Page numbers
    const startPage = Math.max(1, pagination.currentPage - 2);
    const endPage = Math.min(pagination.totalPages, pagination.currentPage + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        const isCurrentPage = i === pagination.currentPage;
        paginationHtml += `
            <button class="${isCurrentPage ? 'current-page' : ''}" onclick="changePage(${i})">
                ${i}
            </button>
        `;
    }
    
    // Next button
    paginationHtml += `
        <button ${!pagination.hasNextPage ? 'disabled' : ''} onclick="changePage(${pagination.currentPage + 1})">
            Next
        </button>
    `;
    
    container.innerHTML = paginationHtml;
    container.style.display = 'flex';
}

/* CHANGE PAGE */
function changePage(page) {
    currentPage = page;
    loadTreeData();
}

/* ADD TREE NODE EVENT LISTENERS */
function addTreeNodeEventListeners() {
    // Add click listeners for tree nodes
    document.querySelectorAll('.tree-node').forEach(node => {
        node.addEventListener('click', (e) => {
            // Only trigger if clicking on the node itself, not buttons
            if (e.target.tagName !== 'BUTTON') {
                const userId = node.dataset.userId;
                showUserDetails(userId);
            }
        });
    });
}

/* TOGGLE NODE CHILDREN */
function toggleNodeChildren(button) {
    const node = button.closest('.tree-node');
    const children = node.querySelector('.node-children');
    
    if (children) {
        if (children.style.display === 'none') {
            children.style.display = 'block';
            button.textContent = 'Collapse';
        } else {
            children.style.display = 'none';
            button.textContent = 'Expand';
        }
    }
}

/* SHOW USER DETAILS */
async function showUserDetails(userId) {
    try {
        const token = localStorage.getItem('token');
        
        // Find user data in current tree data
        let userData = null;
        
        if (currentViewMode === 'complete' && treeData && treeData.tree) {
            userData = findUserInTree(treeData.tree, userId);
        } else if (currentViewMode === 'level' && treeData && treeData.users) {
            userData = treeData.users.find(user => user.id === userId);
        }
        
        if (!userData) {
            // Fallback: fetch user details from API
            const response = await fetch(`${API}/admin/users/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                userData = data.user;
            } else if (response.status === 401) {
                alert('Session expired. Please login again.');
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login.html';
                return;
            } else if (response.status === 403) {
                alert('Access denied. Admin privileges required.');
                window.location.href = '/admin.html';
                return;
            }
        }
        
        if (userData) {
            displayUserDetailModal(userData);
        } else {
            alert('User details not found');
        }
        
    } catch (error) {
        console.error('Error loading user details:', error);
        alert('Failed to load user details');
    }
}

/* FIND USER IN TREE */
function findUserInTree(nodes, userId) {
    for (const node of nodes) {
        if (node.id === userId) {
            return node;
        }
        if (node.children && node.children.length > 0) {
            const found = findUserInTree(node.children, userId);
            if (found) return found;
        }
    }
    return null;
}

/* DISPLAY USER DETAIL MODAL */
async function displayUserDetailModal(userData) {
    const modal = document.getElementById('userDetailModal');
    const content = document.getElementById('userDetailContent');
    
    // Show loading state
    content.innerHTML = '<div class="loading">Loading user details...</div>';
    modal.style.display = 'block';
    
    try {
        // Fetch additional user details if needed
        const token = localStorage.getItem('token');
        let detailedUserData = userData;
        
        // If we don't have complete data, fetch from API
       if (!userData.relationships || !userData.commissions) {
    const response = await fetch(`${API}/admin/users/${userData.id}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    if (response.ok) {
        const apiData = await response.json();
        detailedUserData = { ...userData, ...apiData.user };
    } else if (response.status === 401) {
        alert('Session expired. Please login again.');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
        return;
    } else if (response.status === 403) {
        alert('Access denied. Admin privileges required.');
        window.location.href = '/admin.html';
        return;
    } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
}

        
        // Get referral path (trace up the tree)
        const referralPath = await buildReferralPath(detailedUserData.id);
        
        const referralStatusText = detailedUserData.referralStatus?.joinedWithoutReferrer ? 'Joined without referrer' : 'Joined with referrer';
        const joinDate = new Date(detailedUserData.joinDate);
        const daysSinceJoin = Math.floor((new Date() - joinDate) / (1000 * 60 * 60 * 24));
        
        content.innerHTML = `
            <h2>📊 User Details: ${detailedUserData.name}</h2>
            
            <!-- User Summary Cards -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0;">
                <div class="stat-card" style="border-left-color: #667eea;">
                    <h3>₹${(detailedUserData.wallet || 0).toFixed(2)}</h3>
                    <p>Current Wallet</p>
                </div>
                <div class="stat-card" style="border-left-color: #43e97b;">
                    <h3>₹${(detailedUserData.commissions?.total || 0).toFixed(2)}</h3>
                    <p>Total Earned</p>
                </div>
                <div class="stat-card" style="border-left-color: #f5576c;">
                    <h3>${detailedUserData.childrenCount || detailedUserData.relationships?.treeChildrenCount || 0}</h3>
                    <p>Direct Children</p>
                </div>
                <div class="stat-card" style="border-left-color: #764ba2;">
                    <h3>${daysSinceJoin}</h3>
                    <p>Days Since Join</p>
                </div>
            </div>
            
            <!-- Detailed Information Tabs -->
            <div class="user-detail-tabs">
                <div class="tab-buttons" style="display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 2px solid #e0e0e0;">
                    <button class="tab-btn active" onclick="showTab('basic')">Basic Info</button>
                    <button class="tab-btn" onclick="showTab('tree')">Tree Position</button>
                    <button class="tab-btn" onclick="showTab('commissions')">Commissions</button>
                    <button class="tab-btn" onclick="showTab('network')">Network</button>
                </div>
                
                <!-- Basic Information Tab -->
                <div id="basic-tab" class="tab-content">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
                        <div>
                            <h3>👤 Personal Information</h3>
                            <div class="info-item">
                                <strong>Full Name:</strong> ${detailedUserData.name}
                            </div>
                            <div class="info-item">
                                <strong>Email:</strong> ${detailedUserData.email || 'N/A'}
                            </div>
                            <div class="info-item">
                                <strong>Referral Code:</strong> 
                                <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 4px;">${detailedUserData.referralCode || 'N/A'}</code>
                            </div>
                            <div class="info-item">
                                <strong>Join Date:</strong> ${joinDate.toLocaleDateString()} (${daysSinceJoin} days ago)
                            </div>
                            <div class="info-item">
                                <strong>Referral Status:</strong> 
                                <span class="referral-status ${detailedUserData.referralStatus?.joinedWithoutReferrer ? 'no-referrer' : 'has-referrer'}">
                                    ${referralStatusText}
                                </span>
                            </div>
                        </div>
                        <div>
                            <h3>📈 Account Status</h3>
                            <div class="info-item">
                                <strong>Account Type:</strong> ${detailedUserData.role || 'User'}
                            </div>
                            <div class="info-item">
                                <strong>First Purchase:</strong> ${detailedUserData.firstPurchaseDone ? 'Yes' : 'No'}
                            </div>
                            <div class="info-item">
                                <strong>Total Referrals:</strong> ${detailedUserData.referrals || 0}
                            </div>
                            <div class="info-item">
                                <strong>Referred By:</strong> ${detailedUserData.referredBy || 'None (Direct signup)'}
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Tree Position Tab -->
                <div id="tree-tab" class="tab-content" style="display: none;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
                        <div>
                            <h3>🌳 Tree Position</h3>
                            <div class="info-item">
                                <strong>Tree Level:</strong> ${detailedUserData.treeLevel}
                            </div>
                            <div class="info-item">
                                <strong>Position in Level:</strong> ${detailedUserData.treePosition || 'N/A'}
                            </div>
                            <div class="info-item">
                                <strong>Tree Parent:</strong> 
                                ${detailedUserData.relationships?.treeParent 
                                    ? `${detailedUserData.relationships.treeParent.name} (${detailedUserData.relationships.treeParent.referralCode})`
                                    : 'Root user'
                                }
                            </div>
                            <div class="info-item">
                                <strong>Direct Children:</strong> ${detailedUserData.childrenCount || detailedUserData.relationships?.treeChildrenCount || 0}
                            </div>
                        </div>
                        <div>
                            <h3>🔗 Referral Path</h3>
                            <div class="referral-path">
                                ${referralPath.length > 0 ? referralPath.map((user, index) => `
                                    <div class="path-item" style="margin: 5px 0; padding: 8px; background: #f9f9f9; border-radius: 4px;">
                                        <strong>Level ${user.level}:</strong> ${user.name}
                                        ${index < referralPath.length - 1 ? '<div style="text-align: center; color: #666;">↓</div>' : ''}
                                    </div>
                                `).join('') : '<p>Root user - no path above</p>'}
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Commissions Tab -->
                <div id="commissions-tab" class="tab-content" style="display: none;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
                        <div>
                            <h3>💰 Commission Breakdown</h3>
                            <div class="commission-breakdown">
                                <div class="commission-item">
                                    <strong>Total Earned:</strong> ₹${(detailedUserData.commissions?.total || 0).toFixed(2)}
                                </div>
                                <div class="commission-item">
                                    <strong>Direct Commission:</strong> ₹${(detailedUserData.commissions?.direct || 0).toFixed(2)}
                                    <small style="display: block; color: #666;">From direct referrals</small>
                                </div>
                                <div class="commission-item">
                                    <strong>Tree Commission:</strong> ₹${(detailedUserData.commissions?.tree || 0).toFixed(2)}
                                    <small style="display: block; color: #666;">From tree structure</small>
                                </div>
                                <div class="commission-item">
                                    <strong>Current Wallet:</strong> ₹${(detailedUserData.wallet || 0).toFixed(2)}
                                    <small style="display: block; color: #666;">Available balance</small>
                                </div>
                            </div>
                        </div>
                        <div>
                            <h3>📊 Commission Analytics</h3>
                            <div class="commission-analytics">
                                <div class="info-item">
                                    <strong>Average per Day:</strong> 
                                    ₹${daysSinceJoin > 0 ? ((detailedUserData.commissions?.total || 0) / daysSinceJoin).toFixed(2) : '0.00'}
                                </div>
                                <div class="info-item">
                                    <strong>Commission Ratio:</strong>
                                    ${detailedUserData.commissions?.total > 0 
                                        ? `${((detailedUserData.commissions?.direct || 0) / detailedUserData.commissions.total * 100).toFixed(1)}% Direct, ${((detailedUserData.commissions?.tree || 0) / detailedUserData.commissions.total * 100).toFixed(1)}% Tree`
                                        : 'No commissions yet'
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Network Tab -->
                <div id="network-tab" class="tab-content" style="display: none;">
                    <div>
                        <h3>👥 Referral Network</h3>
                        ${detailedUserData.relationships?.treeChildren && detailedUserData.relationships.treeChildren.length > 0 ? `
                            <div class="network-children">
                                <h4>Direct Children (${detailedUserData.relationships.treeChildren.length}):</h4>
                                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px; margin-top: 15px;">
                                    ${detailedUserData.relationships.treeChildren.map(child => `
                                        <div class="child-card" style="padding: 15px; border: 1px solid #e0e0e0; border-radius: 8px; background: #f9f9f9;">
                                            <div style="font-weight: 600; margin-bottom: 5px;">${child.name}</div>
                                            <div style="font-size: 12px; color: #666;">Code: ${child.referralCode}</div>
                                            <div style="font-size: 12px; color: #666;">Email: ${child.email || 'N/A'}</div>
                                            <button onclick="showUserDetails('${child.id}')" style="margin-top: 8px; padding: 4px 8px; font-size: 11px;" class="btn-info">
                                                View Details
                                            </button>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : '<p>No direct children in the tree.</p>'}
                        
                        ${detailedUserData.relationships?.treeParent ? `
                            <div class="network-parent" style="margin-top: 30px;">
                                <h4>Tree Parent:</h4>
                                <div class="parent-card" style="padding: 15px; border: 1px solid #e0e0e0; border-radius: 8px; background: #f0f8ff; max-width: 300px;">
                                    <div style="font-weight: 600; margin-bottom: 5px;">${detailedUserData.relationships.treeParent.name}</div>
                                    <div style="font-size: 12px; color: #666;">Code: ${detailedUserData.relationships.treeParent.referralCode}</div>
                                    <div style="font-size: 12px; color: #666;">Email: ${detailedUserData.relationships.treeParent.email || 'N/A'}</div>
                                    <button onclick="showUserDetails('${detailedUserData.relationships.treeParent.id}')" style="margin-top: 8px; padding: 4px 8px; font-size: 11px;" class="btn-info">
                                        View Details
                                    </button>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        
    } catch (error) {
        console.error('Error loading detailed user data:', error);
        content.innerHTML = `
            <h2>Error Loading User Details</h2>
            <div class="error-message">
                Failed to load complete user details: ${error.message}
            </div>
            <div style="margin-top: 20px;">
                <h3>Basic Information Available:</h3>
                <p><strong>Name:</strong> ${userData.name}</p>
                <p><strong>Level:</strong> ${userData.treeLevel}</p>
                <p><strong>Wallet:</strong> ₹${(userData.wallet || 0).toFixed(2)}</p>
            </div>
        `;
    }
}

/* BUILD REFERRAL PATH */
async function buildReferralPath(userId) {
    try {
        const token = localStorage.getItem('token');
        const path = [];
        let currentUserId = userId;
        let depth = 0;
        const maxDepth = 10; // Prevent infinite loops
        
        while (currentUserId && depth < maxDepth) {
            // Find current user data
            let currentUser = null;
            
            // First try to find in current tree data
            if (treeData && treeData.tree) {
                currentUser = findUserInTree(treeData.tree, currentUserId);
            }
            
            // If not found, fetch from API
            if (!currentUser) {
                const response = await fetch(`${API}/admin/users/${currentUserId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    currentUser = data.user;
                } else if (response.status === 401) {
                    alert('Session expired. Please login again.');
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    window.location.href = '/login.html';
                    return [];
                } else if (response.status === 403) {
                    alert('Access denied. Admin privileges required.');
                    window.location.href = '/admin.html';
                    return [];
                }
            }
            
            if (!currentUser) break;
            
            path.unshift({
                id: currentUser.id || currentUser._id,
                name: currentUser.name,
                level: currentUser.treeLevel,
                referralCode: currentUser.referralCode
            });
            
            // Move to parent
            currentUserId = currentUser.treeParent || currentUser.relationships?.treeParent?.id;
            depth++;
        }
        
        return path;
        
    } catch (error) {
        console.error('Error building referral path:', error);
        return [];
    }
}



/* UTILITY FUNCTIONS */
function showLoading() {
    document.getElementById('loadingSpinner').style.display = 'block';
    document.getElementById('treeViewContainer').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
}

function hideLoading() {
    document.getElementById('loadingSpinner').style.display = 'none';
}

function showError(message) {
    const errorElement = document.getElementById('errorMessage');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
}

function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}

function hideTreeView() {
    document.getElementById('treeViewContainer').style.display = 'none';
}

function hideStatisticsDashboard() {
    document.getElementById('statisticsDashboard').style.display = 'none';
}

/* DISPLAY STATISTICS DASHBOARD */
function displayStatisticsDashboard(data) {
    const dashboard = document.getElementById('statisticsDashboard');
    dashboard.style.display = 'block';
    
    // Create charts
    createLevelDistributionChart(data.levelDistribution);
    createFillRatesChart(data.levelDistribution);
    createReferralStatusChart(data.overview);
    createCommissionChart(data.commissionStatistics);
    
    // Create detailed level statistics table
    createLevelStatsTable(data.levelDistribution);
}

/* CREATE LEVEL DISTRIBUTION CHART */
function createLevelDistributionChart(levelData) {
    const ctx = document.getElementById('levelDistributionChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (charts.levelDistribution) {
        charts.levelDistribution.destroy();
    }
    
    const labels = levelData.map(level => `Level ${level.level}`);
    const userCounts = levelData.map(level => level.userCount);
    
    charts.levelDistribution = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Number of Users',
                data: userCounts,
                backgroundColor: 'rgba(102, 126, 234, 0.6)',
                borderColor: 'rgba(102, 126, 234, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

/* CREATE FILL RATES CHART */
function createFillRatesChart(levelData) {
    const ctx = document.getElementById('fillRatesChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (charts.fillRates) {
        charts.fillRates.destroy();
    }
    
    const labels = levelData.map(level => `Level ${level.level}`);
    const fillRates = levelData.map(level => level.fillRate);
    
    charts.fillRates = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Fill Rate (%)',
                data: fillRates,
                backgroundColor: 'rgba(67, 233, 123, 0.2)',
                borderColor: 'rgba(67, 233, 123, 1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

/* CREATE REFERRAL STATUS CHART */
function createReferralStatusChart(overview) {
    const ctx = document.getElementById('referralStatusChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (charts.referralStatus) {
        charts.referralStatus.destroy();
    }
    
    const usersWithReferrers = overview.totalUsers - overview.usersWithoutReferrers;
    
    charts.referralStatus = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Has Referrer', 'No Referrer'],
            datasets: [{
                data: [usersWithReferrers, overview.usersWithoutReferrers],
                backgroundColor: [
                    'rgba(67, 233, 123, 0.8)',
                    'rgba(245, 87, 108, 0.8)'
                ],
                borderColor: [
                    'rgba(67, 233, 123, 1)',
                    'rgba(245, 87, 108, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

/* CREATE COMMISSION CHART */
function createCommissionChart(commissionStats) {
    const ctx = document.getElementById('commissionChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (charts.commission) {
        charts.commission.destroy();
    }
    
    charts.commission = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Direct Commissions', 'Tree Commissions'],
            datasets: [{
                data: [
                    commissionStats.totalDirectCommissions,
                    commissionStats.totalTreeCommissions
                ],
                backgroundColor: [
                    'rgba(102, 126, 234, 0.8)',
                    'rgba(118, 75, 162, 0.8)'
                ],
                borderColor: [
                    'rgba(102, 126, 234, 1)',
                    'rgba(118, 75, 162, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.label + ': ₹' + context.parsed.toFixed(2);
                        }
                    }
                }
            }
        }
    });
}

/* CREATE LEVEL STATS TABLE */
function createLevelStatsTable(levelData) {
    const tbody = document.querySelector('#levelStatsTable tbody');
    
    tbody.innerHTML = levelData.map(level => `
        <tr>
            <td>${level.level}</td>
            <td>${level.userCount}</td>
            <td>${level.theoreticalCapacity}</td>
            <td>${level.fillRate}%</td>
            <td>${level.usersWithoutReferrers}</td>
            <td>${level.usersWithReferrers}</td>
            <td>₹${level.averageCommission}</td>
            <td>₹${level.totalCommissions.toFixed(2)}</td>
        </tr>
    `).join('');
}

/* EXPORT STATISTICS */
function exportStatistics() {
    if (!statsData) {
        alert('No statistics data available to export');
        return;
    }
    
    try {
        // Create CSV content
        let csvContent = "Referral Tree Statistics Report\n";
        csvContent += `Generated on: ${new Date().toLocaleString()}\n\n`;
        
        // Overview statistics
        csvContent += "OVERVIEW STATISTICS\n";
        csvContent += `Total Users,${statsData.overview.totalUsers}\n`;
        csvContent += `Users in Tree,${statsData.overview.usersInTree}\n`;
        csvContent += `Root Users,${statsData.overview.rootUsers}\n`;
        csvContent += `Deepest Level,${statsData.overview.deepestLevel}\n`;
        csvContent += `Users Without Referrers,${statsData.overview.usersWithoutReferrers}\n`;
        csvContent += `Percentage Without Referrers,${statsData.overview.percentageWithoutReferrers}%\n\n`;
        
        // Level distribution
        csvContent += "LEVEL DISTRIBUTION\n";
        csvContent += "Level,Users,Capacity,Fill Rate (%),No Referrer,Has Referrer,Avg Commission,Total Commission\n";
        
        statsData.levelDistribution.forEach(level => {
            csvContent += `${level.level},${level.userCount},${level.theoreticalCapacity},${level.fillRate},${level.usersWithoutReferrers},${level.usersWithReferrers},${level.averageCommission},${level.totalCommissions}\n`;
        });
        
        csvContent += "\n";
        
        // Commission statistics
        csvContent += "COMMISSION STATISTICS\n";
        csvContent += `Total Commissions Paid,₹${statsData.commissionStatistics.totalCommissionsPaid}\n`;
        csvContent += `Total Direct Commissions,₹${statsData.commissionStatistics.totalDirectCommissions}\n`;
        csvContent += `Total Tree Commissions,₹${statsData.commissionStatistics.totalTreeCommissions}\n`;
        csvContent += `Users Earning Commissions,${statsData.commissionStatistics.usersEarningCommissions}\n`;
        csvContent += `Average Commission Per Earner,₹${statsData.commissionStatistics.averageCommissionPerEarner}\n\n`;
        
        // Growth metrics
        csvContent += "GROWTH METRICS (Last 30 Days)\n";
        csvContent += `Total New Users,${statsData.growthMetrics.last30Days.totalNewUsers}\n`;
        csvContent += `New Users Without Referrers,${statsData.growthMetrics.last30Days.newUsersWithoutReferrers}\n`;
        
        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `referral-tree-statistics-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        alert('Statistics report exported successfully!');
        
    } catch (error) {
        console.error('Error exporting statistics:', error);
        alert('Failed to export statistics report');
    }
}

/* SHOW TAB - Global function */
window.showTab = function(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.style.display = 'none';
    });
    
    // Remove active class from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(`${tabName}-tab`).style.display = 'block';
    
    // Add active class to clicked button
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.textContent.toLowerCase().includes(tabName) || 
            (tabName === 'basic' && btn.textContent.includes('Basic')) ||
            (tabName === 'tree' && btn.textContent.includes('Tree')) ||
            (tabName === 'commissions' && btn.textContent.includes('Commissions')) ||
            (tabName === 'network' && btn.textContent.includes('Network'))) {
            btn.classList.add('active');
        }
    });
};

// Initialize view mode controls
toggleViewModeControls();