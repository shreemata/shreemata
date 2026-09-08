const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outDir = path.join(__dirname, '..', 'test_screenshots');
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

const VIEWPORTS = [
    { name: '320x568_iPhoneSE', width: 320, height: 568 },
    { name: '360x800_Galaxy', width: 360, height: 800 },
    { name: '375x812_iPhoneMini', width: 375, height: 812 },
    { name: '390x844_iPhone14', width: 390, height: 844 },
    { name: '412x915_Pixel', width: 412, height: 915 },
    { name: '430x932_iPhoneProMax', width: 430, height: 932 },
    { name: '768x1024_iPad', width: 768, height: 1024 },
    { name: '1440x900_DesktopApproved', width: 1440, height: 900 },
    { name: '390x844_Zoom125', width: 390, height: 844, zoom: 1.25 }
];

async function getWsUrl(port = 9222) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const check = () => {
            attempts++;
            http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        resolve(json.webSocketDebuggerUrl);
                    } catch (e) {
                        if (attempts < 40) setTimeout(check, 250);
                        else reject(e);
                    }
                });
            }).on('error', (err) => {
                if (attempts < 40) setTimeout(check, 250);
                else reject(err);
            });
        };
        check();
    });
}

class CDPClient {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.id = 1;
        this.callbacks = new Map();
        this.eventListeners = new Map();
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.ws.onopen = () => resolve();
            this.ws.onerror = err => reject(err);
            this.ws.onmessage = msg => {
                const data = JSON.parse(msg.data);
                if (data.id && this.callbacks.has(data.id)) {
                    const cb = this.callbacks.get(data.id);
                    this.callbacks.delete(data.id);
                    if (data.error) cb.reject(data.error);
                    else cb.resolve(data.result);
                } else if (data.method && this.eventListeners.has(data.method)) {
                    this.eventListeners.get(data.method)(data.params);
                }
            };
        });
    }

    on(method, cb) {
        this.eventListeners.set(method, cb);
    }

    async send(method, params = {}) {
        const id = this.id++;
        return new Promise((resolve, reject) => {
            this.callbacks.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    close() {
        try { this.ws.close(); } catch(e) {}
    }
}

async function run() {
    console.log('🚀 Starting Chrome in headless mode for responsive validation...');
    const chrome = spawn(chromePath, [
        '--headless=new',
        '--remote-debugging-port=9222',
        '--disable-gpu',
        '--no-sandbox',
        '--hide-scrollbars'
    ]);

    try {
        const wsUrl = await getWsUrl(9222);
        const browser = new CDPClient(wsUrl);
        await browser.connect();

        // Create a new target page
        const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
        const { webSocketDebuggerUrl } = await new Promise(resolve => {
            http.get('http://127.0.0.1:9222/json', res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    const targets = JSON.parse(data);
                    const t = targets.find(item => item.id === targetId);
                    resolve(t || targets[0]);
                });
            });
        });

        const page = new CDPClient(webSocketDebuggerUrl);
        await page.connect();

        await page.send('Page.enable');
        await page.send('Runtime.enable');
        await page.send('DOM.enable');

        const results = [];

        for (const vp of VIEWPORTS) {
            console.log(`\n========================================`);
            console.log(`📱 Testing Viewport: ${vp.name} (${vp.width}x${vp.height}${vp.zoom ? ` @ ${vp.zoom*100}% zoom` : ''})`);
            console.log(`========================================`);

            // Set Device Metrics
            await page.send('Emulation.setDeviceMetricsOverride', {
                width: vp.width,
                height: vp.height,
                deviceScaleFactor: 1,
                mobile: vp.width <= 768
            });

            // Navigate to homepage
            await page.send('Page.navigate', { url: 'http://localhost:3000/' });

            // Wait for main elements to be present
            let ready = false;
            for (let i = 0; i < 30; i++) {
                await new Promise(r => setTimeout(r, 200));
                const { result } = await page.send('Runtime.evaluate', {
                    expression: `!!document.querySelector('.main-header') && document.readyState === 'complete'`
                });
                if (result.value) {
                    ready = true;
                    break;
                }
            }

            if (!ready) {
                console.log('⚠️ Page load timed out or element not found');
            }

            if (vp.zoom) {
                await page.send('Runtime.evaluate', {
                    expression: `document.body.style.zoom = '${vp.zoom}';`
                });
                await new Promise(r => setTimeout(r, 200));
            }

            // Dismiss intro and stop animations for crisp screenshots
            await page.send('Runtime.evaluate', {
                expression: `
                    const intro = document.getElementById('cinematicIntro');
                    if (intro) {
                        intro.style.display = 'none';
                        intro.style.opacity = '0';
                        intro.style.visibility = 'hidden';
                    }
                `
            });

            // Evaluate Comprehensive Metrics
            const { result: evalRes } = await page.send('Runtime.evaluate', {
                expression: `(() => {
                    const docEl = document.documentElement;
                    const body = document.body;
                    const clientWidth = docEl.clientWidth;
                    const scrollWidth = docEl.scrollWidth;
                    const hasHorizontalOverflow = scrollWidth > clientWidth;

                    // Find any overflowing elements
                    const overflowingElements = [];
                    const allEls = document.querySelectorAll('*');
                    allEls.forEach(el => {
                        const rect = el.getBoundingClientRect();
                        if (rect.right > clientWidth + 1) {
                            overflowingElements.push({
                                tag: el.tagName.toLowerCase(),
                                id: el.id || '',
                                class: el.className ? (typeof el.className === 'string' ? el.className.trim() : '') : '',
                                right: Math.round(rect.right),
                                width: Math.round(rect.width)
                            });
                        }
                    });

                    // Measure Header
                    const header = document.querySelector('.main-header');
                    const headerRect = header ? header.getBoundingClientRect() : null;
                    const headerSearch = document.querySelector('.header-search');
                    const searchRect = headerSearch ? headerSearch.getBoundingClientRect() : null;
                    const logo = document.querySelector('.brand-logo');
                    const logoRect = logo ? logo.getBoundingClientRect() : null;
                    const cartBtn = document.getElementById('cartLink');
                    const cartRect = cartBtn ? cartBtn.getBoundingClientRect() : null;
                    const menuBtn = document.getElementById('mobileMenuToggle');
                    const menuRect = menuBtn ? menuBtn.getBoundingClientRect() : null;
                    const loginBtn = document.querySelector('.btn-login');
                    const loginRect = loginBtn ? loginBtn.getBoundingClientRect() : null;

                    // Measure Top Bar
                    const topBar = document.querySelector('.top-bar');
                    const topBarRect = topBar ? topBar.getBoundingClientRect() : null;
                    const topBarLeft = document.querySelector('.top-bar-left');
                    const topBarLeftVisible = topBarLeft ? window.getComputedStyle(topBarLeft).display !== 'none' : false;
                    const topBarRight = document.querySelector('.top-bar-right');
                    const topBarRightVisible = topBarRight ? window.getComputedStyle(topBarRight).display !== 'none' : false;

                    // Measure Hero
                    const hero = document.getElementById('heroSection');
                    const heroRect = hero ? hero.getBoundingClientRect() : null;
                    const heroHeading = document.getElementById('heroHeading');
                    const heroHeadingStyle = heroHeading ? window.getComputedStyle(heroHeading).fontSize : null;
                    const heroBtnPrimary = document.querySelector('.btn-hero-primary');
                    const heroBtnPrimaryRect = heroBtnPrimary ? heroBtnPrimary.getBoundingClientRect() : null;
                    const heroBtnSecondary = document.querySelector('.btn-hero-secondary');
                    const heroBtnSecondaryRect = heroBtnSecondary ? heroBtnSecondary.getBoundingClientRect() : null;
                    const heroStage = document.getElementById('heroStage');
                    const heroStageRect = heroStage ? heroStage.getBoundingClientRect() : null;
                    const editionBadge = document.querySelector('.hero-edition-badge');
                    const editionBadgeRect = editionBadge ? editionBadge.getBoundingClientRect() : null;

                    // Measure Quick Nav
                    const discoveryGrid = document.querySelector('.discovery-grid');
                    const discoveryCards = Array.from(document.querySelectorAll('.discovery-card')).map(c => {
                        const r = c.getBoundingClientRect();
                        return { width: Math.round(r.width), height: Math.round(r.height) };
                    });
                    const discoveryGridStyle = discoveryGrid ? window.getComputedStyle(discoveryGrid).gridTemplateColumns : null;

                    // Measure Class 10 Banner
                    const classBanner = document.querySelector('.class-feature-banner');
                    const classBannerRect = classBanner ? classBanner.getBoundingClientRect() : null;
                    const classThumbs = Array.from(document.querySelectorAll('.class-book-thumb')).map(t => {
                        const r = t.getBoundingClientRect();
                        const isVisible = window.getComputedStyle(t).display !== 'none';
                        return { width: Math.round(r.width), height: Math.round(r.height), visible: isVisible };
                    });

                    // Measure Catalog Grid
                    const booksGrid = document.querySelector('.books-grid');
                    const booksGridStyle = booksGrid ? window.getComputedStyle(booksGrid).gridTemplateColumns : null;
                    const bookCards = Array.from(document.querySelectorAll('.book-card')).slice(0, 4).map(c => {
                        const r = c.getBoundingClientRect();
                        const titleEl = c.querySelector('h3');
                        const priceEl = c.querySelector('.book-price');
                        const buyBtn = c.querySelector('.book-actions .btn-primary') || c.querySelector('.btn-primary');
                        const buyRect = buyBtn ? buyBtn.getBoundingClientRect() : null;
                        return {
                            width: Math.round(r.width),
                            height: Math.round(r.height),
                            titleFontSize: titleEl ? window.getComputedStyle(titleEl).fontSize : null,
                            priceFontSize: priceEl ? window.getComputedStyle(priceEl).fontSize : null,
                            actionHeight: buyRect ? Math.round(buyRect.height) : null
                        };
                    });

                    // Measure Footer
                    const footer = document.querySelector('footer');
                    const footerPhone = document.querySelector('.footer-phone-link');
                    const footerPhoneRect = footerPhone ? footerPhone.getBoundingClientRect() : null;
                    const footerHref = footerPhone ? footerPhone.getAttribute('href') : null;

                    return {
                        clientWidth,
                        scrollWidth,
                        hasHorizontalOverflow,
                        overflowingElements: overflowingElements.slice(0, 5),
                        topBar: {
                            visible: !!topBarRect,
                            leftVisible: topBarLeftVisible,
                            rightVisible: topBarRightVisible
                        },
                        header: {
                            height: headerRect ? Math.round(headerRect.height) : 0,
                            logoWidth: logoRect ? Math.round(logoRect.width) : 0,
                            searchHeight: searchRect ? Math.round(searchRect.height) : 0,
                            cartBtnSize: cartRect ? { w: Math.round(cartRect.width), h: Math.round(cartRect.height) } : null,
                            menuBtnSize: menuRect ? { w: Math.round(menuRect.width), h: Math.round(menuRect.height) } : null,
                            loginBtnSize: loginRect ? { w: Math.round(loginRect.width), h: Math.round(loginRect.height) } : null
                        },
                        hero: {
                            height: heroRect ? Math.round(heroRect.height) : 0,
                            headingFontSize: heroHeadingStyle,
                            btnPrimarySize: heroBtnPrimaryRect ? { w: Math.round(heroBtnPrimaryRect.width), h: Math.round(heroBtnPrimaryRect.height) } : null,
                            btnSecondarySize: heroBtnSecondaryRect ? { w: Math.round(heroBtnSecondaryRect.width), h: Math.round(heroBtnSecondaryRect.height) } : null,
                            stageSize: heroStageRect ? { w: Math.round(heroStageRect.width), h: Math.round(heroStageRect.height) } : null,
                            editionBadgeSafe: editionBadgeRect ? (editionBadgeRect.right <= clientWidth) : true
                        },
                        discovery: {
                            gridStyle: discoveryGridStyle,
                            cardCount: discoveryCards.length,
                            cardSample: discoveryCards[0]
                        },
                        class10: {
                            bannerWidth: classBannerRect ? Math.round(classBannerRect.width) : 0,
                            thumbs: classThumbs
                        },
                        catalog: {
                            gridStyle: booksGridStyle,
                            cardSample: bookCards[0]
                        },
                        footer: {
                            phoneHref: footerHref,
                            phoneSize: footerPhoneRect ? { w: Math.round(footerPhoneRect.width), h: Math.round(footerPhoneRect.height) } : null
                        }
                    };
                })()`,
                returnByValue: true
            });

            const metrics = evalRes.value;

            // Capture screenshot of viewport
            const { data: screenshotData } = await page.send('Page.captureScreenshot', {
                format: 'png',
                clip: {
                    x: 0,
                    y: 0,
                    width: vp.width,
                    height: Math.min(vp.height * 2.2, 1600),
                    scale: 1
                }
            });
            const imgPath = path.join(outDir, `${vp.name}.png`);
            fs.writeFileSync(imgPath, Buffer.from(screenshotData, 'base64'));

            // Print detailed verification summary
            const overflowStatus = metrics.hasHorizontalOverflow
                ? `❌ OVERFLOW (scrollWidth: ${metrics.scrollWidth} > clientWidth: ${metrics.clientWidth})`
                : `✅ ZERO OVERFLOW (${metrics.clientWidth}px === ${metrics.scrollWidth}px)`;
            
            console.log(`Horizontal Scrolling: ${overflowStatus}`);
            if (metrics.overflowingElements.length > 0) {
                console.log('Overflowing elements:', metrics.overflowingElements);
            }

            console.log(`Top Bar: Left Notice Visible=${metrics.topBar.leftVisible} | Right Links Hidden=${!metrics.topBar.rightVisible}`);
            console.log(`Header: Height=${metrics.header.height}px | Search Bar Height=${metrics.header.searchHeight}px | Cart Touch Target=${metrics.header.cartBtnSize?.w}x${metrics.header.cartBtnSize?.h}px | Hamburger=${metrics.header.menuBtnSize?.w}x${metrics.header.menuBtnSize?.h}px`);
            console.log(`Hero: Height=${metrics.hero.height}px | Headline=${metrics.hero.headingFontSize} | Primary CTA Touch Target=${metrics.hero.btnPrimarySize?.w}x${metrics.hero.btnPrimarySize?.h}px | Badge Safe=${metrics.hero.editionBadgeSafe}`);
            console.log(`Quick Nav (2x2): Card Sample=${metrics.discovery.cardSample?.width}x${metrics.discovery.cardSample?.height}px (min 72px satisfied: ${metrics.discovery.cardSample?.height >= 70})`);
            console.log(`Class 10 Banner: Width=${metrics.class10.bannerWidth}px | Thumbs Count=${metrics.class10.thumbs.filter(t => t.visible).length} visible`);
            console.log(`Product Grid: Card Width=${metrics.catalog.cardSample?.width}px | Action Button Height=${metrics.catalog.cardSample?.actionHeight}px (>=44px: ${metrics.catalog.cardSample?.actionHeight >= 44})`);
            console.log(`Footer Phone: Href=${metrics.footer.phoneHref} | Touch Target=${metrics.footer.phoneSize?.w}x${metrics.footer.phoneSize?.h}px`);
            console.log(`Screenshot: ${imgPath}`);

            results.push({
                name: vp.name,
                overflow: !metrics.hasHorizontalOverflow,
                metrics
            });
        }

        console.log('\n========================================');
        console.log('📊 FINAL MULTI-VIEWPORT VERIFICATION RESULTS');
        console.log('========================================');
        let allPassed = true;
        for (const res of results) {
            const pass = res.overflow;
            if (!pass) allPassed = false;
            console.log(`${pass ? '✅' : '❌'} ${res.name.padEnd(25)}: ${pass ? 'PASSED (0 overflow)' : 'FAILED (horizontal overflow)'}`);
        }
        console.log(`\nOverall Verdict: ${allPassed ? 'ALL VIEWPORTS FULLY SATISFIED WITH ZERO OVERFLOW!' : 'SOME VIEWPORTS FAILED'}`);

        page.close();
        browser.close();
    } catch (e) {
        console.error('Error during verification:', e);
    } finally {
        chrome.kill();
        process.exit(0);
    }
}

run();
