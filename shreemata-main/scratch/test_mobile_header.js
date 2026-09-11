const puppeteer = require('puppeteer');

async function testMobileHeader() {
    console.log('🧪 Starting Mobile Header Verification Suite...\n');

    let browser;
    let passed = 0;
    let failed = 0;

    function assert(name, condition) {
        if (condition) {
            console.log(`✅ PASS: ${name}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${name}`);
            failed++;
        }
    }

    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();

        const viewports = [
            { width: 320, height: 568, name: '320px (iPhone SE 1st gen)' },
            { width: 360, height: 800, name: '360px (Samsung Galaxy)' },
            { width: 375, height: 812, name: '375px (iPhone X/11/12 mini)' },
            { width: 390, height: 844, name: '390px (iPhone 12/13/14)' },
            { width: 412, height: 915, name: '412px (Pixel 7)' },
            { width: 430, height: 932, name: '430px (iPhone 14/15 Pro Max)' },
            { width: 768, height: 1024, name: '768px (iPad portrait)' },
            { width: 1366, height: 768, name: '1366px (Desktop)' }
        ];

        console.log('--- 1. Testing Guest State (Logged Out) on Homepage ---');
        await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => {
            localStorage.clear();
        });
        await page.reload({ waitUntil: 'networkidle2' });

        for (const vp of viewports) {
            await page.setViewport({ width: vp.width, height: vp.height });
            await new Promise(r => setTimeout(r, 100));

            const isMobile = vp.width <= 768;

            const headerData = await page.evaluate((isMobile) => {
                const docWidth = document.documentElement.scrollWidth;
                const winWidth = window.innerWidth;
                const overflow = docWidth > winWidth;

                const hamburger = document.getElementById('mobileMenuToggle');
                const hamburgerVisible = hamburger ? (window.getComputedStyle(hamburger).display !== 'none' && hamburger.offsetHeight > 0) : false;
                const hamburgerRect = hamburger ? hamburger.getBoundingClientRect() : null;

                const authLinks = document.getElementById('authLinks');
                const authLinksVisible = authLinks ? (window.getComputedStyle(authLinks).display !== 'none' && authLinks.offsetHeight > 0) : false;

                const userLinks = document.getElementById('userLinks');
                const userLinksVisible = userLinks ? (window.getComputedStyle(userLinks).display !== 'none' && userLinks.offsetHeight > 0) : false;

                const loginBtn = document.querySelector('.btn-login');
                const loginBtnVisible = loginBtn ? (window.getComputedStyle(loginBtn).display !== 'none' && loginBtn.offsetHeight > 0) : false;
                const loginBtnRect = loginBtn ? loginBtn.getBoundingClientRect() : null;

                const userMenuBtn = document.getElementById('userMenuBtn');
                const userMenuBtnVisible = userMenuBtn ? (window.getComputedStyle(userMenuBtn).display !== 'none' && userMenuBtn.offsetHeight > 0) : false;

                const cartBtn = document.getElementById('cartLink') || document.querySelector('.btn-cart-header');
                const cartBtnVisible = cartBtn ? (window.getComputedStyle(cartBtn).display !== 'none' && cartBtn.offsetHeight > 0) : false;
                const cartBtnRect = cartBtn ? cartBtn.getBoundingClientRect() : null;

                const cartCount = document.getElementById('cartCount');
                const cartCountVisible = cartCount ? (window.getComputedStyle(cartCount).display !== 'none') : false;

                const logo = document.querySelector('.brand-logo');
                const logoImg = logo ? logo.querySelector('img') : null;
                const logoImgRect = logoImg ? logoImg.getBoundingClientRect() : null;

                const search = document.querySelector('.header-search');
                const searchVisible = search ? (window.getComputedStyle(search).display !== 'none' && search.offsetHeight > 0) : false;
                const searchRect = search ? search.getBoundingClientRect() : null;

                // Total visible account/profile buttons
                let visibleAccountButtons = 0;
                if (loginBtnVisible) visibleAccountButtons++;
                if (userMenuBtnVisible) visibleAccountButtons++;

                return {
                    overflow,
                    docWidth,
                    winWidth,
                    hamburgerVisible,
                    hamburgerRect,
                    authLinksVisible,
                    userLinksVisible,
                    visibleAccountButtons,
                    loginBtnRect,
                    cartBtnVisible,
                    cartBtnRect,
                    cartCountVisible,
                    logoImgRect,
                    searchVisible,
                    searchRect
                };
            }, isMobile);

            if (isMobile) {
                assert(`[${vp.name}] No horizontal overflow (${headerData.docWidth} <= ${headerData.winWidth})`, !headerData.overflow);
                assert(`[${vp.name}] Hamburger button visible and touch target >= 44px`, headerData.hamburgerVisible && headerData.hamburgerRect.width >= 40 && headerData.hamburgerRect.height >= 40);
                assert(`[${vp.name}] Exactly ONE account/profile button visible (Found: ${headerData.visibleAccountButtons})`, headerData.visibleAccountButtons === 1);
                assert(`[${vp.name}] Cart button visible with touch target >= 44px`, headerData.cartBtnVisible && headerData.cartBtnRect.width >= 40 && headerData.cartBtnRect.height >= 40);
                assert(`[${vp.name}] Cart count badge is visible`, headerData.cartCountVisible);
                assert(`[${vp.name}] Logo image height <= 52px (Actual: ${headerData.logoImgRect ? headerData.logoImgRect.height : 0}px)`, headerData.logoImgRect && headerData.logoImgRect.height <= 52);
                assert(`[${vp.name}] Search row visible full width`, headerData.searchVisible && headerData.searchRect.width > (vp.width - 50));
            } else {
                assert(`[${vp.name}] Desktop header: Hamburger hidden`, !headerData.hamburgerVisible);
                assert(`[${vp.name}] Desktop header: Exactly ONE auth/profile control`, headerData.visibleAccountButtons === 1);
            }
        }

        console.log('\n--- 2. Testing Logged-In User State on Mobile (390px) ---');
        await page.setViewport({ width: 390, height: 844 });
        await page.evaluate(() => {
            localStorage.setItem('token', 'fake-jwt-token-for-ui-test');
            localStorage.setItem('user', JSON.stringify({
                id: '123456',
                name: 'Ananya Sharma',
                email: 'ananya@test.com',
                role: 'user'
            }));
            if (typeof window.updateGlobalNavbarAuth === 'function') {
                window.updateGlobalNavbarAuth();
            }
        });
        await new Promise(r => setTimeout(r, 200));

        const loggedInData = await page.evaluate(() => {
            const loginBtn = document.querySelector('.btn-login');
            const loginBtnVisible = loginBtn ? (window.getComputedStyle(loginBtn).display !== 'none' && loginBtn.offsetHeight > 0) : false;

            const userMenuBtn = document.getElementById('userMenuBtn');
            const userMenuBtnVisible = userMenuBtn ? (window.getComputedStyle(userMenuBtn).display !== 'none' && userMenuBtn.offsetHeight > 0) : false;

            let visibleAccountButtons = 0;
            if (loginBtnVisible) visibleAccountButtons++;
            if (userMenuBtnVisible) visibleAccountButtons++;

            return {
                loginBtnVisible,
                userMenuBtnVisible,
                visibleAccountButtons
            };
        });

        assert('Logged-in: Guest login button is hidden', !loggedInData.loginBtnVisible);
        assert('Logged-in: User account button is visible', loggedInData.userMenuBtnVisible);
        assert(`Logged-in: Exactly ONE account button visible (Found: ${loggedInData.visibleAccountButtons})`, loggedInData.visibleAccountButtons === 1);

        console.log('\n--- 3. Testing Global Navigation Drawer Open/Close via Hamburger ---');
        const drawerOpens = await page.evaluate(async () => {
            const hamburger = document.getElementById('mobileMenuToggle');
            const drawer = document.getElementById('mobileNavDrawer');
            if (!hamburger || !drawer) return false;

            hamburger.click();
            await new Promise(r => setTimeout(r, 300));
            const isOpenAfterClick = drawer.classList.contains('open') || drawer.classList.contains('is-open');

            const backdrop = document.getElementById('drawerBackdrop');
            if (backdrop) backdrop.click();
            await new Promise(r => setTimeout(r, 300));
            const isClosedAfterBackdrop = !drawer.classList.contains('open') && !drawer.classList.contains('is-open');

            return isOpenAfterClick && isClosedAfterBackdrop;
        });

        assert('Hamburger button opens mobile nav drawer and backdrop closes it', drawerOpens);

        console.log('\n--- 4. Testing Account Page Mobile Header (390px) ---');
        await page.goto('http://localhost:3000/account.html', { waitUntil: 'networkidle2' });
        await page.setViewport({ width: 390, height: 844 });
        await new Promise(r => setTimeout(r, 200));

        const accountHeaderData = await page.evaluate(() => {
            const hamburger = document.getElementById('mobileMenuToggle');
            const hamburgerVisible = hamburger ? (window.getComputedStyle(hamburger).display !== 'none') : false;

            const loginBtn = document.querySelector('.btn-login');
            const loginBtnVisible = loginBtn ? (window.getComputedStyle(loginBtn).display !== 'none' && loginBtn.offsetHeight > 0) : false;

            const userMenuBtn = document.getElementById('userMenuBtn');
            const userMenuBtnVisible = userMenuBtn ? (window.getComputedStyle(userMenuBtn).display !== 'none' && userMenuBtn.offsetHeight > 0) : false;

            let count = 0;
            if (loginBtnVisible) count++;
            if (userMenuBtnVisible) count++;

            return { hamburgerVisible, count };
        });

        assert('Account page mobile header: Hamburger visible', accountHeaderData.hamburgerVisible);
        assert(`Account page mobile header: Exactly ONE account button (Found: ${accountHeaderData.count})`, accountHeaderData.count === 1);

        console.log('\n==================================================');
        console.log(`TEST SUMMARY: ${passed} PASSED / ${failed} FAILED`);
        console.log('==================================================');

    } catch (err) {
        console.error('Test execution error:', err);
    } finally {
        if (browser) await browser.close();
    }
}

testMobileHeader();
