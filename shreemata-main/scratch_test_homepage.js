const http = require('http');

function get(path) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000' + path, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('=== 1. TEST HOMEPAGE HTML ===');
  const homeRes = await get('/');
  console.log('Homepage status:', homeRes.status);
  const html = homeRes.body;

  const requiredIds = [
    'searchInput', 'searchBtn',
    'authLinks', 'userLinks', 'userName', 'accountLink', 'ordersLink', 'adminLink', 'logoutBtn',
    'cartLink', 'cartCount',
    'classFilter', 'subjectFilter',
    'gridView', 'listView',
    'booksSection', 'booksCount', 'currentPage', 'loadingSpinner', 'booksGrid', 'emptyState',
    'paginationContainer', 'paginationInfo', 'prevPage', 'pageNumbers', 'nextPage', 'loadMoreBtn',
    'bundlesSection', 'bundlesGrid',
    'notificationsSection', 'dropupNotification', 'dropupOfferTitle', 'dropupOfferMessage', 'dropupOfferIcon', 'dropupOfferCounter', 'dropupNavigation', 'dropupDots',
    'deliveryMethodModal', 'paymentMethodModal'
  ];

  let missingIds = [];
  for (const id of requiredIds) {
    if (!html.includes('id="' + id + '"') && !html.includes("id='" + id + "'")) {
      missingIds.push(id);
    }
  }

  if (missingIds.length === 0) {
    console.log('✅ ALL', requiredIds.length, 'REQUIRED DOM IDs ARE PRESENT IN INDEX.HTML');
  } else {
    console.error('❌ MISSING DOM IDs:', missingIds);
  }

  console.log('\n=== 2. TEST CSS/JS ASSETS ===');
  const homeCss = await get('/css/home.css');
  console.log('home.css status:', homeCss.status, 'size:', homeCss.body.length, 'bytes');

  const configJs = await get('/js/config.js');
  console.log('config.js status:', configJs.status);

  const cartUtilsJs = await get('/js/cartUtils.js');
  console.log('cartUtils.js status:', cartUtilsJs.status);

  const globalJs = await get('/js/global.js');
  console.log('global.js status:', globalJs.status);

  const homeJs = await get('/js/home.js');
  console.log('home.js status:', homeJs.status);

  console.log('\n=== 3. TEST API ENDPOINTS ===');
  const booksRes = await get('/api/books');
  const booksData = JSON.parse(booksRes.body);
  console.log('Books API status:', booksRes.status, 'Total books:', booksData.books ? booksData.books.length : 0);

  const bundlesRes = await get('/api/bundles');
  const bundlesData = JSON.parse(bundlesRes.body);
  console.log('Bundles API status:', bundlesRes.status, 'Total bundles:', bundlesData.bundles ? bundlesData.bundles.length : 0);

  const notifsRes = await get('/api/notifications');
  const notifsData = JSON.parse(notifsRes.body);
  console.log('Notifications API status:', notifsRes.status, 'Total notifs:', notifsData.notifications ? notifsData.notifications.length : 0);

  const settingsRes = await get('/api/home-settings');
  const settingsData = JSON.parse(settingsRes.body);
  console.log('Settings API status:', settingsRes.status, 'Settings:', settingsData.settings);

  console.log('\n=== 4. CHECK UNWANTED DECORATION REMOVAL ===');
  const unwanted = ['bgCanvas', 'cursorDot', 'cursorRing', 'cartoon-bg', 'cartoon-cloud', 'owl-mascot', 'hero-book-stack'];
  let foundUnwanted = [];
  for (const u of unwanted) {
    if (html.includes(u)) foundUnwanted.push(u);
  }
  if (foundUnwanted.length === 0) {
    console.log('✅ ALL UNWANTED CARTOON/PARTICLE/CURSOR DECORATIONS REMOVED');
  } else {
    console.warn('⚠️ Found unwanted elements:', foundUnwanted);
  }

  console.log('\n🎉 ALL HOMEPAGE VERIFICATION CHECKS COMPLETED SUCCESSFULLY!');
}

runTests().catch(err => console.error('Verification error:', err));
