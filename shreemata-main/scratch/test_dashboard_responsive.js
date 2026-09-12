const fs = require('fs');
const path = require('path');

function runResponsiveAudit() {
  console.log('📱 STARTING OPERATIONS DASHBOARD RESPONSIVE & LAYOUT AUDIT...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  const htmlPath = path.join(__dirname, '../public/admin-dashboard.html');
  const cssPath = path.join(__dirname, '../public/css/admin-dashboard.css');
  const jsPath = path.join(__dirname, '../public/js/admin-dashboard.js');

  const html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');

  // 1. Meta viewport check
  assert(html.includes('name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"'), 'Viewport meta tag configured for responsive mobile rendering');

  // 2. All 12 KPI element IDs present in HTML & JS
  const kpiIds = [
    'kpiOrdersToday', 'kpiRevenueToday', 'kpiPaidOrders', 'kpiPendingPayments',
    'kpiOrdersToProcess', 'kpiReadyToDispatch', 'kpiReadyForPickup', 'kpiDeliveredToday',
    'kpiCancelledToday', 'kpiNewMembers', 'kpiPendingWithdrawals', 'kpiLowStock'
  ];
  kpiIds.forEach(id => {
    assert(html.includes(`id="${id}"`), `HTML contains KPI element #${id}`);
    assert(js.includes(id), `JS updates KPI element #${id}`);
  });

  // 3. Action Required & Pipelines containers
  assert(html.includes('id="actionRequiredContainer"'), 'HTML contains #actionRequiredContainer');
  assert(html.includes('id="recentOrdersTableBody"'), 'HTML contains #recentOrdersTableBody');
  assert(html.includes('id="inventoryAlertsList"'), 'HTML contains #inventoryAlertsList');
  assert(html.includes('id="sevenDaysChartContainer"'), 'HTML contains #sevenDaysChartContainer');

  // 4. CSS Media Queries Check
  assert(css.includes('@media (max-width: 1200px)'), 'CSS includes 1200px breakpoint for wide screens');
  assert(css.includes('@media (max-width: 900px)'), 'CSS includes 900px breakpoint for tablets');
  assert(css.includes('@media (max-width: 768px)'), 'CSS includes 768px breakpoint for mobile phones');
  assert(css.includes('grid-template-columns: 1fr;'), 'Cards stack to 1-column on narrow mobile screens (320px - 430px)');
  assert(css.includes('overflow-x: auto'), 'Tables and quick action bars have responsive horizontal scroll protection');

  // 5. No hardcoded fixed px widths on major containers (rigid width without max-)
  const hasRigidFixedWidth = /(?<!max-)width:\s*(?:1200|1400|1440)px/i.test(css);
  assert(!hasRigidFixedWidth, 'No fixed rigid container widths causing mobile overflow');

  console.log(`\n========================================`);
  console.log(`RESPONSIVE AUDIT: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runResponsiveAudit();
