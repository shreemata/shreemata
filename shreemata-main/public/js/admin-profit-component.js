// public/js/admin-profit-component.js
// Shared component for Books and Bundles (Sets) Profit & Commission Configuration

(function() {
    let cachedCommissionSettings = null;

    function getApiUrl(path) {
        const base = (window.API_URL || '/api').replace(/\/+$/, '');
        const cleanPath = path.replace(/^\/+/, '');
        if (base.endsWith('/api') && cleanPath.startsWith('api/')) {
            return base + '/' + cleanPath.slice(4);
        }
        return base + '/' + cleanPath;
    }

    async function fetchCommissionSettings() {
        if (cachedCommissionSettings) return cachedCommissionSettings;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(getApiUrl('/admin/commission-settings'), {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            if (res.ok) {
                const data = await res.json();
                cachedCommissionSettings = data.settings || null;
            }
        } catch (e) {
            console.warn('⚠️ Could not fetch commission settings for profit preview, using defaults:', e.message);
        }
        if (!cachedCommissionSettings) {
            cachedCommissionSettings = {
                directCommissionPercent: 30,
                referralCommissionPercent: 20,
                treeCommissionPoolPercent: 40,
                trustFundPercent: 10,
                adminCommissionPercent: 0
            };
        }
        return cachedCommissionSettings;
    }

    function generateProfitSectionHTML(prefix = 'admin', itemTypeLabel = 'Book') {
        const isAdmin = prefix === 'admin';
        const profitTypeId = `${prefix}ProfitType`;
        const profitValueId = `${prefix}ProfitValue`;
        const profitValueLabelId = `${prefix}ProfitValueLabel`;
        const rewardPointsId = isAdmin ? 'rewardPoints' : `${prefix}RewardPoints`;
        const zeroCommissionId = `${prefix}ZeroCommission`;
        const zeroBadgeId = `${prefix}ProfitZeroBadge`;
        const saveBlockNoticeId = `${prefix}SaveBlockNotice`;
        const cashbackAmountId = isAdmin ? 'cashbackAmount' : `${prefix}CashbackAmount`;
        const cashbackPercentageId = isAdmin ? 'cashbackPercentage' : `${prefix}CashbackPercentage`;
        const previewBoxId = `${prefix}ProfitPreviewBox`;
        const previewHeaderId = `${prefix}PreviewHeader`;

        const previewBaseId = isAdmin ? 'previewProfitBase' : `${prefix}PreviewProfitBase`;
        const previewBuyerLabelId = isAdmin ? 'previewBuyerLabel' : `${prefix}PreviewBuyerLabel`;
        const previewBuyerPercentId = isAdmin ? 'previewBuyerPercent' : `${prefix}PreviewBuyerPercent`;
        const previewBuyerCashbackId = isAdmin ? 'previewBuyerCashback' : `${prefix}PreviewBuyerCashback`;
        const previewReferralPercentId = isAdmin ? 'previewReferralPercent' : `${prefix}PreviewReferralPercent`;
        const previewDirectReferralId = isAdmin ? 'previewDirectReferral' : `${prefix}PreviewDirectReferral`;
        const previewTreePercentId = isAdmin ? 'previewTreePercent' : `${prefix}PreviewTreePercent`;
        const previewTreePoolId = isAdmin ? 'previewTreePool' : `${prefix}PreviewTreePool`;
        const previewTrustPercentId = isAdmin ? 'previewTrustPercent' : `${prefix}PreviewTrustPercent`;
        const previewTrustFundId = isAdmin ? 'previewTrustFund' : `${prefix}PreviewTrustFund`;
        const previewAdminPercentId = isAdmin ? 'previewAdminPercent' : `${prefix}PreviewAdminPercent`;
        const previewAdminShareId = isAdmin ? 'previewAdminShare' : `${prefix}PreviewAdminShare`;
        const previewTotalDistId = isAdmin ? 'previewTotalDistribution' : `${prefix}PreviewTotalDistribution`;
        const previewRemainingId = isAdmin ? 'previewRemainingProfit' : `${prefix}PreviewRemainingProfit`;
        const previewStatusNoteId = isAdmin ? 'previewStatusNote' : `${prefix}PreviewStatusNote`;

        return `
        <div class="form-section profit-commission-section" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
            <h3 style="margin-top: 0; color: #1e293b; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                <span>💰 INTERNAL PROFIT & COMMISSION</span>
            </h3>
            <small style="display: block; margin-bottom: 12px; color: #64748b;">
                Private internal amount used as the base for commissions and rewards. Customers cannot see this value.
            </small>

            <div class="form-row" style="display: flex; gap: 15px; flex-wrap: wrap;">
                <div class="form-group" style="flex: 1; min-width: 160px;">
                    <label for="${profitTypeId}" style="font-weight: 600; font-size: 0.9rem; color: #334155;">Profit Method</label>
                    <select id="${profitTypeId}" name="profitType" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px;">
                        <option value="fixed">Fixed Amount (₹)</option>
                        <option value="percentage">Percentage (%)</option>
                    </select>
                </div>
                <div class="form-group" style="flex: 1; min-width: 160px;">
                    <label id="${profitValueLabelId}" for="${profitValueId}" style="font-weight: 600; font-size: 0.9rem; color: #334155;">${itemTypeLabel} Profit (₹)</label>
                    <input type="number" id="${profitValueId}" name="profitValue" step="0.01" min="0" value="0" placeholder="0.00" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px;">
                </div>
                <div class="form-group" style="flex: 1; min-width: 160px;">
                    <label for="${rewardPointsId}" style="font-weight: 600; font-size: 0.9rem; color: #334155;">Reward Points</label>
                    <input type="number" id="${rewardPointsId}" name="rewardPoints" min="0" value="0" placeholder="0" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px;">
                    <small style="color: #64748b; font-size: 0.78rem;">Points awarded to buyer on purchase</small>
                </div>
            </div>

            <!-- Zero commission checkbox & warning badge -->
            <div style="margin-top: 10px; margin-bottom: 12px;">
                <label class="checkbox-container" style="display: inline-flex; align-items: center; gap: 8px; font-weight: 500; font-size: 0.88rem; cursor: pointer; color: #334155;">
                    <input type="checkbox" id="${zeroCommissionId}" name="zeroCommission" style="width: 16px; height: 16px; cursor: pointer;">
                    <span>Sell without commission (profit ₹0)</span>
                </label>
                <div id="${zeroBadgeId}" class="profit-zero-badge" style="display: none; background: #fee2e2; color: #b91c1c; border: 1px solid #f87171; padding: 6px 12px; border-radius: 6px; font-weight: 600; font-size: 0.84rem; margin-top: 8px;">
                    ⚠️ Profit not set: no commission will be paid
                </div>
                <div id="${saveBlockNoticeId}" style="display: none; color: #dc2626; font-size: 0.84rem; font-weight: 600; margin-top: 6px; background: #fef2f2; border: 1px dashed #f87171; padding: 6px 10px; border-radius: 4px;">
                    ⚠️ Profit is required to create a new ${itemTypeLabel.toLowerCase()}. Enter a profit value or check "Sell without commission".
                </div>
            </div>

            <!-- Optional Cashback Section -->
            <div style="margin-top: 12px; margin-bottom: 12px; padding: 12px; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 6px;">
                <div style="font-weight: 600; font-size: 0.85rem; color: #475569; margin-bottom: 8px;">OPTIONAL CASHBACK</div>
                <div class="form-row" style="display: flex; gap: 15px; flex-wrap: wrap;">
                    <div class="form-group" style="flex: 1; min-width: 200px;">
                        <label for="${cashbackAmountId}" style="font-weight: 500; font-size: 0.85rem; color: #334155;">Cashback Amount (₹) <span style="font-size: 0.8em; color: #64748b; font-weight: normal;">— Optional</span></label>
                        <input type="number" id="${cashbackAmountId}" name="cashbackAmount" step="0.01" min="0" value="0" placeholder="0" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px;">
                        <small style="color: #64748b; display: block; margin-top: 4px; font-size: 0.78rem;">Optional manual buyer cashback. Leave at 0 to use automatic profit-based cashback.</small>
                    </div>
                    <div class="form-group" style="flex: 1; min-width: 200px;">
                        <label for="${cashbackPercentageId}" style="font-weight: 500; font-size: 0.85rem; color: #334155;">Cashback Percentage (%) <span style="font-size: 0.8em; color: #64748b; font-weight: normal;">— Optional</span></label>
                        <input type="number" id="${cashbackPercentageId}" name="cashbackPercentage" step="0.01" min="0" max="100" value="0" placeholder="0" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px;">
                        <small style="color: #64748b; display: block; margin-top: 4px; font-size: 0.78rem;">Optional manual buyer cashback percentage. Leave at 0 to use automatic profit-based cashback.</small>
                    </div>
                </div>
            </div>

            <!-- Live Preview Box -->
            <div id="${previewBoxId}" style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px; margin-top: 10px;">
                <div id="${previewHeaderId}" style="font-weight: 700; color: #0f172a; margin-bottom: 6px; font-size: 0.95em;">
                    Profit ₹0.00 per unit sold splits into: buyer cashback, referrer, tree pool, trust fund
                </div>
                <div style="font-size: 1.1em; color: #16a34a; font-weight: bold; margin-bottom: 8px;">
                    Base Profit: <span id="${previewBaseId}">₹0.00</span>
                </div>
                <div style="font-size: 0.85em; color: #475569; line-height: 1.6;">
                    <div>• <span id="${previewBuyerLabelId}">Buyer Cashback (<span id="${previewBuyerPercentId}">30</span>% Automatic):</span> <span id="${previewBuyerCashbackId}">₹0.00</span></div>
                    <div>• Direct Referral (<span id="${previewReferralPercentId}">20</span>%): <span id="${previewDirectReferralId}">₹0.00</span></div>
                    <div>• Tree Pool (<span id="${previewTreePercentId}">40</span>%): <span id="${previewTreePoolId}">₹0.00</span></div>
                    <div>• Trust Fund (<span id="${previewTrustPercentId}">10</span>%): <span id="${previewTrustFundId}">₹0.00</span></div>
                    <div>• Admin Share (<span id="${previewAdminPercentId}">0</span>%): <span id="${previewAdminShareId}">₹0.00</span></div>
                    <div style="border-top: 1px dashed #cbd5e1; margin-top: 6px; padding-top: 6px; font-weight: 600; color: #1e293b;">
                        Estimated Distribution: <span id="${previewTotalDistId}">₹0.00</span> | Remaining Profit: <span id="${previewRemainingId}">₹0.00</span>
                    </div>
                </div>
                <div id="${previewStatusNoteId}" style="font-size: 0.82em; color: #d97706; margin-top: 6px; font-weight: 500; display: none;"></div>
            </div>
        </div>`;
    }

    function initProfitSection(config) {
        const {
            prefix = 'admin',
            itemTypeLabel = 'Book',
            priceInputId = 'price',
            submitBtnId = 'submitBtn',
            isNewItem = () => true
        } = config;

        const isAdmin = prefix === 'admin';
        const priceEl = document.getElementById(priceInputId);
        const profitTypeEl = document.getElementById(`${prefix}ProfitType`);
        const profitValueEl = document.getElementById(`${prefix}ProfitValue`);
        const labelEl = document.getElementById(`${prefix}ProfitValueLabel`);
        const zeroCommissionEl = document.getElementById(`${prefix}ZeroCommission`);
        const zeroBadgeEl = document.getElementById(`${prefix}ProfitZeroBadge`);
        const blockNoticeEl = document.getElementById(`${prefix}SaveBlockNotice`);
        const submitBtn = document.getElementById(submitBtnId);
        const cashbackAmountEl = document.getElementById(isAdmin ? 'cashbackAmount' : `${prefix}CashbackAmount`);
        const cashbackPercentageEl = document.getElementById(isAdmin ? 'cashbackPercentage' : `${prefix}CashbackPercentage`);
        const rewardPointsEl = document.getElementById(isAdmin ? 'rewardPoints' : `${prefix}RewardPoints`);

        const headerEl = document.getElementById(isAdmin ? `${prefix}PreviewHeader` : `${prefix}PreviewHeader`);
        const baseEl = document.getElementById(isAdmin ? 'previewProfitBase' : `${prefix}PreviewProfitBase`);
        const buyerPercentEl = document.getElementById(isAdmin ? 'previewBuyerPercent' : `${prefix}PreviewBuyerPercent`);
        const buyerEl = document.getElementById(isAdmin ? 'previewBuyerCashback' : `${prefix}PreviewBuyerCashback`);
        const referralPercentEl = document.getElementById(isAdmin ? 'previewReferralPercent' : `${prefix}PreviewReferralPercent`);
        const directEl = document.getElementById(isAdmin ? 'previewDirectReferral' : `${prefix}PreviewDirectReferral`);
        const treePercentEl = document.getElementById(isAdmin ? 'previewTreePercent' : `${prefix}PreviewTreePercent`);
        const treeEl = document.getElementById(isAdmin ? 'previewTreePool' : `${prefix}PreviewTreePool`);
        const trustPercentEl = document.getElementById(isAdmin ? 'previewTrustPercent' : `${prefix}PreviewTrustPercent`);
        const trustEl = document.getElementById(isAdmin ? 'previewTrustFund' : `${prefix}PreviewTrustFund`);
        const adminPercentEl = document.getElementById(isAdmin ? 'previewAdminPercent' : `${prefix}PreviewAdminPercent`);
        const adminEl = document.getElementById(isAdmin ? 'previewAdminShare' : `${prefix}PreviewAdminShare`);
        const totalEl = document.getElementById(isAdmin ? 'previewTotalDistribution' : `${prefix}PreviewTotalDistribution`);
        const remEl = document.getElementById(isAdmin ? 'previewRemainingProfit' : `${prefix}PreviewRemainingProfit`);
        const noteEl = document.getElementById(isAdmin ? 'previewStatusNote' : `${prefix}PreviewStatusNote`);

        async function updateUI() {
            const settings = await fetchCommissionSettings();
            const price = Math.max(0, parseFloat(priceEl?.value) || 0);
            const profitType = profitTypeEl?.value || 'fixed';
            const rawVal = Math.max(0, parseFloat(profitValueEl?.value) || 0);
            const zeroCommChecked = zeroCommissionEl?.checked === true;
            const isNew = typeof isNewItem === 'function' ? isNewItem() : true;

            if (labelEl) {
                labelEl.textContent = profitType === 'percentage' 
                    ? 'Profit Percentage (%)' 
                    : `${itemTypeLabel} Profit (₹)`;
            }

            // Enforce Save Button and Zero Badge state
            if (isNew) {
                // New item: Profit required unless zero commission checked
                if (rawVal <= 0 && !zeroCommChecked) {
                    if (submitBtn) {
                        submitBtn.disabled = true;
                        submitBtn.style.opacity = '0.5';
                        submitBtn.style.cursor = 'not-allowed';
                        submitBtn.title = `Profit is required for new items. Enter profit or check "Sell without commission".`;
                    }
                    if (blockNoticeEl) blockNoticeEl.style.display = 'block';
                    if (zeroBadgeEl) zeroBadgeEl.style.display = 'none';
                } else {
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.style.opacity = '1';
                        submitBtn.style.cursor = 'pointer';
                        submitBtn.title = '';
                    }
                    if (blockNoticeEl) blockNoticeEl.style.display = 'none';
                    if (zeroBadgeEl) zeroBadgeEl.style.display = 'none';
                }
            } else {
                // Editing existing item: allow save, show badge if profit is 0
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.style.opacity = '1';
                    submitBtn.style.cursor = 'pointer';
                    submitBtn.title = '';
                }
                if (blockNoticeEl) blockNoticeEl.style.display = 'none';
                if (rawVal <= 0 && !zeroCommChecked) {
                    if (zeroBadgeEl) zeroBadgeEl.style.display = 'block';
                } else {
                    if (zeroBadgeEl) zeroBadgeEl.style.display = 'none';
                }
            }

            // Calculate profit base
            let unitProfit = 0;
            let statusMessage = '';

            if (profitType === 'fixed') {
                if (price > 0) {
                    unitProfit = Math.min(rawVal, price);
                    if (rawVal > price) {
                        statusMessage = `${itemTypeLabel} Profit capped at price (₹${price.toFixed(2)})`;
                    }
                } else {
                    unitProfit = rawVal;
                    if (rawVal > 0) {
                        statusMessage = `Enter selling price to validate profit.`;
                    }
                }
            } else {
                if (rawVal > 100) {
                    statusMessage = `⚠️ Profit percentage cannot exceed 100%.`;
                }
                if (price > 0) {
                    unitProfit = (price * rawVal) / 100;
                    if (unitProfit > price) unitProfit = price;
                } else {
                    unitProfit = 0;
                    if (rawVal > 0) {
                        statusMessage = `Enter selling price to calculate profit.`;
                    }
                }
            }

            // Rates from settings
            const buyerPercent = settings?.directCommissionPercent ?? 30;
            const referralPercent = settings?.referralCommissionPercent ?? 20;
            const treePercent = settings?.treeCommissionPoolPercent ?? 40;
            const trustPercent = settings?.trustFundPercent ?? 10;
            const adminPercent = settings?.adminCommissionPercent ?? 0;

            const cbAmount = Math.max(0, parseFloat(cashbackAmountEl?.value) || 0);
            const cbPercent = Math.max(0, parseFloat(cashbackPercentageEl?.value) || 0);

            let buyerCashback = 0;
            let buyerLabelText = '';

            if (cbAmount > 0) {
                buyerCashback = cbAmount;
                buyerLabelText = `Buyer Cashback (Manual Override):`;
            } else if (cbPercent > 0) {
                buyerCashback = (price * cbPercent) / 100;
                buyerLabelText = `Buyer Cashback (${cbPercent}% Manual Override):`;
            } else {
                buyerCashback = unitProfit * (buyerPercent / 100);
                buyerLabelText = `Buyer Cashback (${buyerPercent}% Automatic):`;
            }

            const directReferral = unitProfit * (referralPercent / 100);
            const treePool = unitProfit * (treePercent / 100);
            const trustFund = unitProfit * (trustPercent / 100);
            const adminShare = unitProfit * (adminPercent / 100);

            const totalDist = buyerCashback + directReferral + treePool + trustFund + adminShare;
            const remaining = Math.max(0, unitProfit - totalDist);

            if (totalDist > unitProfit && unitProfit > 0) {
                statusMessage = `⚠️ Total distribution (₹${totalDist.toFixed(2)}) exceeds base profit (₹${unitProfit.toFixed(2)}).`;
            }

            // Update live preview elements
            if (headerEl) {
                if (profitType === 'percentage' && price > 0 && rawVal > 0) {
                    headerEl.textContent = `Profit ₹${unitProfit.toFixed(2)} per unit sold (${rawVal}% of ₹${price.toFixed(2)}) splits into: buyer cashback, referrer, tree pool, trust fund`;
                } else {
                    headerEl.textContent = `Profit ₹${unitProfit.toFixed(2)} per unit sold splits into: buyer cashback, referrer, tree pool, trust fund`;
                }
            }

            if (baseEl) {
                baseEl.textContent = profitType === 'percentage' && price > 0 && rawVal > 0
                    ? `₹${unitProfit.toFixed(2)} (${rawVal}% of ₹${price.toFixed(2)})`
                    : `₹${unitProfit.toFixed(2)}`;
            }

            const buyerLabelEl = document.getElementById(isAdmin ? 'previewBuyerLabel' : `${prefix}PreviewBuyerLabel`);
            if (buyerLabelEl) buyerLabelEl.textContent = buyerLabelText;

            if (buyerPercentEl) buyerPercentEl.textContent = buyerPercent;
            if (buyerEl) buyerEl.textContent = `₹${buyerCashback.toFixed(2)}`;
            if (referralPercentEl) referralPercentEl.textContent = referralPercent;
            if (directEl) directEl.textContent = `₹${directReferral.toFixed(2)}`;
            if (treePercentEl) treePercentEl.textContent = treePercent;
            if (treeEl) treeEl.textContent = `₹${treePool.toFixed(2)}`;
            if (trustPercentEl) trustPercentEl.textContent = trustPercent;
            if (trustEl) trustEl.textContent = `₹${trustFund.toFixed(2)}`;
            if (adminPercentEl) adminPercentEl.textContent = adminPercent;
            if (adminEl) adminEl.textContent = `₹${adminShare.toFixed(2)}`;
            if (totalEl) totalEl.textContent = `₹${totalDist.toFixed(2)}`;
            if (remEl) remEl.textContent = `₹${remaining.toFixed(2)}`;

            if (noteEl) {
                if (statusMessage) {
                    noteEl.textContent = statusMessage;
                    noteEl.style.display = 'block';
                } else {
                    noteEl.style.display = 'none';
                }
            }
        }

        // Attach event listeners
        ['input', 'change', 'keyup', 'paste'].forEach(evt => {
            if (priceEl) priceEl.addEventListener(evt, updateUI);
            if (profitTypeEl) profitTypeEl.addEventListener(evt, updateUI);
            if (profitValueEl) profitValueEl.addEventListener(evt, updateUI);
            if (zeroCommissionEl) zeroCommissionEl.addEventListener(evt, updateUI);
            if (cashbackAmountEl) cashbackAmountEl.addEventListener(evt, updateUI);
            if (cashbackPercentageEl) cashbackPercentageEl.addEventListener(evt, updateUI);
        });

        if (zeroCommissionEl) {
            zeroCommissionEl.addEventListener('change', () => {
                if (zeroCommissionEl.checked && profitValueEl) {
                    profitValueEl.value = '0';
                }
                updateUI();
            });
        }

        if (profitValueEl) {
            profitValueEl.addEventListener('input', () => {
                const v = parseFloat(profitValueEl.value) || 0;
                if (v > 0 && zeroCommissionEl) {
                    zeroCommissionEl.checked = false;
                }
                updateUI();
            });
        }

        updateUI();

        return {
            updateUI,
            getProfitData: () => {
                const profitType = profitTypeEl?.value || 'fixed';
                const profitValue = Math.max(0, parseFloat(profitValueEl?.value) || 0);
                const zeroComm = zeroCommissionEl?.checked === true;
                return {
                    profitType,
                    profitValue,
                    zeroCommission: zeroComm,
                    profitConfigured: profitValue > 0 || zeroComm
                };
            },
            populateData: (item = {}) => {
                if (profitTypeEl) profitTypeEl.value = item.profitType || 'fixed';
                if (profitValueEl) profitValueEl.value = item.profitValue !== undefined ? item.profitValue : 0;
                if (zeroCommissionEl) zeroCommissionEl.checked = (item.profitConfigured && Number(item.profitValue) === 0);
                if (cashbackAmountEl && item.cashbackAmount !== undefined) cashbackAmountEl.value = item.cashbackAmount;
                if (cashbackPercentageEl && item.cashbackPercentage !== undefined) cashbackPercentageEl.value = item.cashbackPercentage;
                if (rewardPointsEl && item.rewardPoints !== undefined) rewardPointsEl.value = item.rewardPoints;
                updateUI();
            }
        };
    }

    // Modal for Quick "Set profit" Action
    function injectQuickProfitModal() {
        if (document.getElementById('quickProfitModal')) return;

        const modalDiv = document.createElement('div');
        modalDiv.id = 'quickProfitModal';
        modalDiv.className = 'modal';
        modalDiv.style.cssText = 'display: none; position: fixed; z-index: 9999; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.5);';

        modalDiv.innerHTML = `
        <div class="modal-content" style="background-color: #fefefe; margin: 5% auto; padding: 25px; border: 1px solid #cbd5e1; border-radius: 8px; width: 90%; max-width: 650px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 15px;">
                <h2 style="margin: 0; color: #1e293b; font-size: 1.3rem;">💰 Set Profit — <span id="quickProfitItemTitle">Item</span></h2>
                <button type="button" id="closeQuickProfitBtn" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #94a3b8;">&times;</button>
            </div>

            <div style="background: #f1f5f9; padding: 10px 14px; border-radius: 6px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.9rem; color: #475569;">Item Price: <strong id="quickProfitItemPrice" style="color: #0f172a;">₹0.00</strong></span>
                <span id="quickProfitCurrentStatus" style="font-size: 0.85rem; font-weight: 600;"></span>
            </div>

            <form id="quickProfitForm">
                <input type="hidden" id="quickProfitItemId">
                <input type="hidden" id="quickProfitItemType">
                <input type="hidden" id="quickProfitHiddenPrice">

                <div class="form-row" style="display: flex; gap: 15px; margin-bottom: 15px;">
                    <div class="form-group" style="flex: 1;">
                        <label for="quickProfitType" style="font-weight: 600; font-size: 0.9rem; color: #334155;">Profit Method</label>
                        <select id="quickProfitType" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px;">
                            <option value="fixed">Fixed Amount (₹)</option>
                            <option value="percentage">Percentage (%)</option>
                        </select>
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label id="quickProfitValueLabel" for="quickProfitValue" style="font-weight: 600; font-size: 0.9rem; color: #334155;">Profit Value (₹)</label>
                        <input type="number" id="quickProfitValue" step="0.01" min="0" required style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px;">
                    </div>
                </div>

                <!-- Live Preview Box -->
                <div id="quickProfitPreviewBox" style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; margin-bottom: 15px;">
                    <div id="quickPreviewHeader" style="font-weight: 700; color: #0f172a; margin-bottom: 6px; font-size: 0.9em;">
                        Profit ₹0.00 per unit sold splits into: buyer cashback, referrer, tree pool, trust fund
                    </div>
                    <div style="font-size: 1.05em; color: #16a34a; font-weight: bold; margin-bottom: 6px;">
                        Base Profit: <span id="quickPreviewProfitBase">₹0.00</span>
                    </div>
                    <div style="font-size: 0.82em; color: #475569; line-height: 1.5;">
                        <div>• Buyer Cashback (<span id="quickPreviewBuyerPercent">30</span>%): <span id="quickPreviewBuyerCashback">₹0.00</span></div>
                        <div>• Direct Referral (<span id="quickPreviewReferralPercent">20</span>%): <span id="quickPreviewDirectReferral">₹0.00</span></div>
                        <div>• Tree Pool (<span id="quickPreviewTreePercent">40</span>%): <span id="quickPreviewTreePool">₹0.00</span></div>
                        <div>• Trust Fund (<span id="quickPreviewTrustPercent">10</span>%): <span id="quickPreviewTrustFund">₹0.00</span></div>
                        <div style="border-top: 1px dashed #cbd5e1; margin-top: 4px; padding-top: 4px; font-weight: 600; color: #1e293b;">
                            Distribution: <span id="quickPreviewTotalDistribution">₹0.00</span> | Remaining: <span id="quickPreviewRemainingProfit">₹0.00</span>
                        </div>
                    </div>
                    <div id="quickPreviewStatusNote" style="font-size: 0.8em; color: #d97706; margin-top: 4px; display: none;"></div>
                </div>

                <!-- Audit Log History -->
                <div style="margin-bottom: 15px;">
                    <h4 style="margin: 0 0 8px 0; color: #475569; font-size: 0.9rem;">📜 Profit Change History</h4>
                    <div id="quickProfitHistoryList" style="max-height: 120px; overflow-y: auto; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; font-size: 0.82rem; color: #64748b;">
                        <em>Loading history...</em>
                    </div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
                    <button type="button" id="cancelQuickProfitBtn" style="padding: 8px 16px; background: #94a3b8; color: white; border: none; border-radius: 6px; cursor: pointer;">Cancel</button>
                    <button type="submit" id="saveQuickProfitBtn" style="padding: 8px 18px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Save Profit</button>
                </div>
            </form>
        </div>`;

        document.body.appendChild(modalDiv);

        document.getElementById('closeQuickProfitBtn')?.addEventListener('click', closeQuickProfitModal);
        document.getElementById('cancelQuickProfitBtn')?.addEventListener('click', closeQuickProfitModal);
    }

    function closeQuickProfitModal() {
        const modal = document.getElementById('quickProfitModal');
        if (modal) modal.style.display = 'none';
    }

    async function openSetProfitModal(options) {
        const item = options.item || {};
        const itemType = options.itemType || (item.name !== undefined ? 'bundle' : 'book');
        const itemId = options.itemId || item._id;
        const itemTitle = options.itemTitle || item.title || item.name || 'Item';
        const currentPrice = options.currentPrice !== undefined 
            ? options.currentPrice 
            : (item.bundlePrice !== undefined ? item.bundlePrice : (item.sellingPrice || item.price || 0));
        const currentProfitType = options.currentProfitType || item.profitType || 'fixed';
        const currentProfitValue = options.currentProfitValue !== undefined ? options.currentProfitValue : (item.profitValue !== undefined ? item.profitValue : 0);
        const onSaveSuccess = options.onSaveSuccess;

        injectQuickProfitModal();

        const modal = document.getElementById('quickProfitModal');
        document.getElementById('quickProfitItemTitle').textContent = itemTitle;
        document.getElementById('quickProfitItemPrice').textContent = `₹${parseFloat(currentPrice).toFixed(2)}`;
        document.getElementById('quickProfitItemId').value = itemId;
        document.getElementById('quickProfitItemType').value = itemType;
        document.getElementById('quickProfitHiddenPrice').value = currentPrice;

        const typeEl = document.getElementById('quickProfitType');
        const valEl = document.getElementById('quickProfitValue');
        const labelEl = document.getElementById('quickProfitValueLabel');
        const statusEl = document.getElementById('quickProfitCurrentStatus');

        typeEl.value = currentProfitType || 'fixed';
        valEl.value = currentProfitValue !== undefined ? currentProfitValue : 0;

        if (Number(currentProfitValue) > 0) {
            statusEl.innerHTML = `<span style="color: #16a34a;">Current: ₹${parseFloat(currentProfitValue).toFixed(2)} (${currentProfitType})</span>`;
        } else {
            statusEl.innerHTML = `<span style="color: #dc2626; background: #fee2e2; padding: 2px 8px; border-radius: 4px;">⚠️ Profit Not Set</span>`;
        }

        async function updateQuickPreview() {
            const settings = await fetchCommissionSettings();
            const price = Math.max(0, parseFloat(currentPrice) || 0);
            const profitType = typeEl.value || 'fixed';
            const rawVal = Math.max(0, parseFloat(valEl.value) || 0);

            if (labelEl) {
                labelEl.textContent = profitType === 'percentage' ? 'Profit Percentage (%)' : 'Profit Value (₹)';
            }

            let unitProfit = 0;
            let statusMessage = '';

            if (profitType === 'fixed') {
                if (price > 0) {
                    unitProfit = Math.min(rawVal, price);
                    if (rawVal > price) statusMessage = `Profit cannot exceed the selling price (₹${price.toFixed(2)})`;
                } else {
                    unitProfit = rawVal;
                }
            } else {
                if (rawVal > 100) statusMessage = '⚠️ Percentage cannot exceed 100%';
                unitProfit = (price * rawVal) / 100;
            }

            const buyerPercent = settings?.directCommissionPercent ?? 30;
            const referralPercent = settings?.referralCommissionPercent ?? 20;
            const treePercent = settings?.treeCommissionPoolPercent ?? 40;
            const trustPercent = settings?.trustFundPercent ?? 10;

            const buyer = unitProfit * (buyerPercent / 100);
            const referral = unitProfit * (referralPercent / 100);
            const tree = unitProfit * (treePercent / 100);
            const trust = unitProfit * (trustPercent / 100);
            const total = buyer + referral + tree + trust;
            const rem = Math.max(0, unitProfit - total);

            const qHeader = document.getElementById('quickPreviewHeader');
            if (qHeader) {
                if (profitType === 'percentage' && price > 0 && rawVal > 0) {
                    qHeader.textContent = `Profit ₹${unitProfit.toFixed(2)} per unit sold (${rawVal}% of ₹${price.toFixed(2)}) splits into: buyer cashback, referrer, tree pool, trust fund`;
                } else {
                    qHeader.textContent = `Profit ₹${unitProfit.toFixed(2)} per unit sold splits into: buyer cashback, referrer, tree pool, trust fund`;
                }
            }

            document.getElementById('quickPreviewProfitBase').textContent = `₹${unitProfit.toFixed(2)}`;
            document.getElementById('quickPreviewBuyerPercent').textContent = buyerPercent;
            document.getElementById('quickPreviewBuyerCashback').textContent = `₹${buyer.toFixed(2)}`;
            document.getElementById('quickPreviewReferralPercent').textContent = referralPercent;
            document.getElementById('quickPreviewDirectReferral').textContent = `₹${referral.toFixed(2)}`;
            document.getElementById('quickPreviewTreePercent').textContent = treePercent;
            document.getElementById('quickPreviewTreePool').textContent = `₹${tree.toFixed(2)}`;
            document.getElementById('quickPreviewTrustPercent').textContent = trustPercent;
            document.getElementById('quickPreviewTrustFund').textContent = `₹${trust.toFixed(2)}`;
            document.getElementById('quickPreviewTotalDistribution').textContent = `₹${total.toFixed(2)}`;
            document.getElementById('quickPreviewRemainingProfit').textContent = `₹${rem.toFixed(2)}`;

            const note = document.getElementById('quickPreviewStatusNote');
            if (note) {
                if (statusMessage) {
                    note.textContent = statusMessage;
                    note.style.display = 'block';
                } else {
                    note.style.display = 'none';
                }
            }
        }

        ['input', 'change'].forEach(evt => {
            typeEl.onchange = updateQuickPreview;
            valEl.oninput = updateQuickPreview;
        });

        updateQuickPreview();

        // Fetch History
        const historyList = document.getElementById('quickProfitHistoryList');
        historyList.innerHTML = '<em>Loading history...</em>';
        try {
            const token = localStorage.getItem('token');
            const ep = itemType === 'bundle'
                ? getApiUrl(`/bundles/admin/${itemId}/profit-history`)
                : getApiUrl(`/books/admin/${itemId}/profit-history`);
            const hRes = await fetch(ep, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (hRes.ok) {
                const hData = await hRes.json();
                if (hData.history && hData.history.length > 0) {
                    historyList.innerHTML = hData.history.map(h => `
                        <div style="border-bottom: 1px solid #e2e8f0; padding: 4px 0;">
                            <strong>${new Date(h.timestamp || h.createdAt).toLocaleString()}</strong> by <em>${h.adminEmail || h.adminName || 'Admin'}</em>:
                            ₹${h.oldProfitValue} (${h.oldProfitType}) ➔ <strong style="color: #16a34a;">₹${h.newProfitValue} (${h.newProfitType})</strong>
                        </div>
                    `).join('');
                } else {
                    historyList.innerHTML = '<span style="color: #94a3b8;">No profit modifications logged yet.</span>';
                }
            } else {
                historyList.innerHTML = '<span style="color: #94a3b8;">No history available.</span>';
            }
        } catch (e) {
            historyList.innerHTML = '<span style="color: #94a3b8;">Unable to load history.</span>';
        }

        // Handle Submit
        const form = document.getElementById('quickProfitForm');
        form.onsubmit = async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('saveQuickProfitBtn');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';

            try {
                const token = localStorage.getItem('token');
                const ep = itemType === 'bundle'
                    ? getApiUrl(`/bundles/admin/${itemId}/profit`)
                    : getApiUrl(`/books/admin/${itemId}/profit`);

                const res = await fetch(ep, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        profitType: typeEl.value,
                        profitValue: parseFloat(valEl.value) || 0,
                        changeReason: 'Admin Quick Set Action'
                    })
                });

                const data = await res.json();
                if (res.ok) {
                    alert('Profit updated successfully!');
                    closeQuickProfitModal();
                    if (typeof onSaveSuccess === 'function') onSaveSuccess(data);
                } else {
                    alert('Error: ' + (data.error || 'Failed to update profit'));
                }
            } catch (err) {
                alert('Network error: ' + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Profit';
            }
        };

        modal.style.display = 'block';
    }

    // Expose API
    window.AdminProfitComponent = {
        fetchCommissionSettings,
        generateProfitSectionHTML,
        initProfitSection,
        openSetProfitModal
    };
})();
