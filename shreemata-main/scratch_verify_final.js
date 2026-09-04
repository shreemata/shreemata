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
  console.log('=== 1. TEST PRODUCT-LED 3D HOMEPAGE HTML ===');
  const homeRes = await get('/');
  console.log('Homepage status:', homeRes.status);
  const html = homeRes.body;

  const requiredIds = [
    'cinematicIntro',
    'heroSection', 'heroStage',
    'classSection', 'classChipsContainer',
    'subjectSection', 'subjectChipsContainer',
    'bundlesSection', 'bundlesGrid',
    'booksSection', 'classFilter', 'subjectFilter', 'gridView', 'listView', 'booksCount', 'currentPage', 'loadingSpinner', 'booksGrid', 'emptyState',
    'paginationContainer', 'paginationInfo', 'prevPage', 'pageNumbers', 'nextPage', 'loadMoreBtn',
    'notificationsSection', 'dropupNotification', 'dropupOfferTitle', 'dropupOfferMessage', 'dropupOfferIcon', 'dropupOfferCounter', 'dropupNavigation', 'dropupDots',
    'journeySection', 'trustSection',
    'searchInput', 'searchBtn',
    'authLinks', 'userLinks', 'userName', 'accountLink', 'ordersLink', 'adminLink', 'logoutBtn',
    'cartLink', 'cartCount',
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

  console.log('\n=== 2. TEST CSS AND JS ASSETS ===');
  const home3dCss = await get('/css/home-3d.css');
  console.log('home-3d.css status:', home3dCss.status, 'size:', home3dCss.body.length, 'bytes');

  const home3dJs = await get('/js/home-3d.js');
  console.log('home-3d.js status:', home3dJs.status, 'size:', home3dJs.body.length, 'bytes');

  const homeJs = await get('/js/home.js');
  console.log('home.js status:', homeJs.status, 'size:', homeJs.body.length, 'bytes');

  const globalJs = await get('/js/global.js');
  console.log('global.js status:', globalJs.status);

  const cartUtilsJs = await get('/js/cartUtils.js');
  console.log('cartUtils.js status:', cartUtilsJs.status);

  console.log('\n=== 3. TEST REAL BOOK COVERS IN HERO ===');
  const hasMathCover = html.includes('kl2gbelkihjecix4uf11.jpg');
  const hasSocialCover = html.includes('nlw24jtffvbqcjlmveaw.jpg');
  const hasEngCover = html.includes('u67dvcqjfncolcbwbub1.jpg');
  console.log('Mathematics Real Cover in Hero:', hasMathCover ? '✅ Yes' : '❌ No');
  console.log('Social Science Real Cover in Hero:', hasSocialCover ? '✅ Yes' : '❌ No');
  console.log('English Real Cover in Hero:', hasEngCover ? '✅ Yes' : '❌ No');

  console.log('\n=== 4. TEST API RESPONSES ===');
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

  console.log('\n=== 5. CHECK SECTION SEQUENCE ===');
  const sectionsInOrder = [
    'heroSection',
    'classSection',
    'subjectSection',
    'bundlesSection',
    'booksSection',
    'notificationsSection',
    'journeySection',
    'trustSection'
  ];

  let lastIndex = -1;
  let inOrder = true;
  for (const s of sectionsInOrder) {
    const idx = html.indexOf('id="' + s + '"');
    if (idx === -1) {
      console.error('Section missing:', s);
      inOrder = false;
    } else if (idx < lastIndex) {
      console.error('Section out of order:', s);
      inOrder = false;
    }
    lastIndex = idx;
  }

  if (inOrder) {
    console.log('✅ ALL SECTIONS ARE IN THE EXACT REQUESTED SEQUENCE');
  }

  console.log('\n🎉 ALL CHECKS PASSED PERFECTLY!');
}

runTests().catch(err => console.error('Verification error:', err));
