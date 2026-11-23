/**
 * tests/vipAccountPublicLimits.test.js
 *
 * Verifies public/js/account.js VIP limits and milestone step alignment:
 * 1. Default VIP withdrawal minimum is 100 (not 500) and mandatory reserve is 100 (not 50).
 * 2. VIP milestone step is 10 (VIP_MILESTONE_STEP = 10) for calculations.
 * 3. Dynamic initialization from API settings (window.vipSettings).
 * 4. Input attributes (min="100", placeholder) and preview validation messages.
 * 5. submitVipWithdrawal enforces minAmount (100) and minReserve (100).
 * 6. Quick preset 'max' leaves exactly mandatory reserve (100).
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('VIP Account Public Limits and Milestone Step Alignment', () => {
  const accountJsPath = path.resolve(__dirname, '../public/js/account.js');
  const code = fs.readFileSync(accountJsPath, 'utf8');

  test('source code does not contain hardcoded 500 or 50 for VIP withdrawal limits or 100 for milestone step in account.js', () => {
    // Check that currentVipWithdrawState defaults to 100, 100
    expect(code).toMatch(/currentVipWithdrawState\s*=\s*\{[\s\S]*?minAmount:\s*100/);
    expect(code).toMatch(/currentVipWithdrawState\s*=\s*\{[\s\S]*?minReserve:\s*100/);

    // Check that VIP_MILESTONE_STEP = 10 is defined and used
    expect(code).toMatch(/const\s+VIP_MILESTONE_STEP\s*=\s*10;/);

    // Verify no remaining hardcoded 500 or 50 in VIP withdraw functions
    expect(code).not.toMatch(/currentVipWithdrawState\.minAmount\s*=\s*500/);
    expect(code).not.toMatch(/currentVipWithdrawState\.minReserve\s*=\s*50/);
    expect(code).not.toMatch(/val\s*<\s*500/);
    expect(code).not.toMatch(/amount\s*<\s*500/);
    expect(code).not.toMatch(/remaining\s*<\s*50/);
    expect(code).not.toMatch(/\(available\s*-\s*amount\)\s*<\s*50/);
  });

  test('DOM simulation: openVipWithdrawModal, preview validation, and presets with limits = 100', () => {
    // Setup minimal DOM environment in jsdom / vm
    const domState = {
      elements: {},
      alerts: [],
      localStorageData: {
        token: 'mock-token',
        user: JSON.stringify({ name: 'Test User', wallet: 250 })
      }
    };

    // Helper to mock DOM element
    function createMockElement(id, tag = 'div') {
      const el = {
        id,
        tagName: tag.toUpperCase(),
        textContent: '',
        value: '',
        style: {},
        innerHTML: '',
        min: '',
        placeholder: '',
        children: [],
        querySelector: () => null,
        querySelectorAll: () => []
      };
      domState.elements[id] = el;
      return el;
    }

    createMockElement('walletBalance');
    domState.elements['walletBalance'].textContent = '₹250.00';
    createMockElement('vipWithdrawModal');
    createMockElement('vipModalCardInfo');
    createMockElement('vipModalAvailableBalance');
    createMockElement('vipModalMaxWithdrawable');
    createMockElement('vipWithdrawAmountInput', 'input');
    createMockElement('vipWithdrawPreviewBox');
    createMockElement('vipPreviewRequested');
    createMockElement('vipPreviewRemaining');
    createMockElement('vipPreviewValidationMsg');
    createMockElement('vipSubmitWithdrawBtn', 'button');

    // Create a sandbox
    const sandbox = {
      window: {
        vipSettings: { minWithdrawal: 100, mandatoryReserve: 100 }
      },
      document: {
        getElementById: (id) => domState.elements[id] || null,
        querySelector: () => null,
        querySelectorAll: () => []
      },
      localStorage: {
        getItem: (k) => domState.localStorageData[k] || null,
        setItem: (k, v) => { domState.localStorageData[k] = v; }
      },
      alert: (msg) => { domState.alerts.push(msg); },
      removeVipScannerFile: () => {},
      escapeHtml: (s) => s,
      parseFloat: parseFloat,
      Number: Number,
      Math: Math,
      String: String,
      isNaN: isNaN
    };

    vm.createContext(sandbox);

    // Extract and run the VIP withdraw modal code
    let extracted = `
      ${code.slice(code.indexOf('let currentVipWithdrawState = {'), code.indexOf('async function submitVipWithdrawal()'))}
      ${code.slice(code.indexOf('async function submitVipWithdrawal()'), code.indexOf('const payload = {'))}
      }
    `;
    // Convert top-level let to var so it attaches to sandbox object
    extracted = extracted.replace('let currentVipWithdrawState = {', 'var currentVipWithdrawState = {');

    vm.runInContext(extracted, sandbox);

    // 1. Verify initial state
    expect(sandbox.currentVipWithdrawState.minAmount).toBe(100);
    expect(sandbox.currentVipWithdrawState.minReserve).toBe(100);

    // 2. Open modal with card 'VIP 0000 0001', tier 1
    sandbox.openVipWithdrawModal('VIP 0000 0001', 1);

    expect(sandbox.currentVipWithdrawState.availableBalance).toBe(250);
    expect(sandbox.currentVipWithdrawState.minAmount).toBe(100);
    expect(sandbox.currentVipWithdrawState.minReserve).toBe(100);

    // Max withdrawable for balance 250 with reserve 100 is 150
    expect(domState.elements['vipModalMaxWithdrawable'].textContent).toBe('₹150.00');
    expect(domState.elements['vipWithdrawAmountInput'].min).toBe('100');
    expect(domState.elements['vipWithdrawAmountInput'].placeholder).toBe('Enter amount (min 100)');

    // 3. Test Preview Validation: Amount < 100
    domState.elements['vipWithdrawAmountInput'].value = '99';
    sandbox.updateVipWithdrawPreview();
    expect(domState.elements['vipPreviewValidationMsg'].innerHTML).toContain('Minimum withdrawal amount allowed is ₹100');

    // 4. Test Preview Validation: Amount 160 leaves 90 (< 100 reserve)
    domState.elements['vipWithdrawAmountInput'].value = '160';
    sandbox.updateVipWithdrawPreview();
    expect(domState.elements['vipPreviewValidationMsg'].innerHTML).toContain('mandatory minimum balance of ₹100 must remain');

    // 5. Test Preview Validation: Amount 100 leaves 150 (valid)
    domState.elements['vipWithdrawAmountInput'].value = '100';
    sandbox.updateVipWithdrawPreview();
    expect(domState.elements['vipPreviewValidationMsg'].innerHTML).toContain('Valid withdrawal request. ₹150.00 reserve balance will remain');

    // 6. Test Preset 'max': should set input to exactly 150
    sandbox.setVipWithdrawPreset('max');
    expect(domState.elements['vipWithdrawAmountInput'].value).toBe(150);

    // 7. Test Submit Validation: Amount < 100 alerts
    domState.elements['vipWithdrawAmountInput'].value = '90';
    sandbox.submitVipWithdrawal();
    expect(domState.alerts.pop()).toContain('Minimum withdrawal amount allowed for VIP Master Card is ₹100.');

    // 8. Test Submit Validation: Amount 151 leaves 99 (< 100 reserve) alerts
    domState.elements['vipWithdrawAmountInput'].value = '151';
    sandbox.submitVipWithdrawal();
    expect(domState.alerts.pop()).toContain('mandatory minimum balance of ₹100 must remain');
  });
});
