const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outDir = 'C:\\Users\\SERVER\\.gemini\\antigravity-ide\\brain\\7119f7ea-2a9b-4597-afbe-5582ee4171df';

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
                }
            };
        });
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

        // Capture 390px sections
        await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
        await page.send('Page.navigate', { url: 'http://localhost:3000/' });
        await new Promise(r => setTimeout(r, 1500));

        await page.send('Runtime.evaluate', {
            expression: `
                const intro = document.getElementById('cinematicIntro');
                if (intro) intro.style.display = 'none';
            `
        });

        // 1. Discovery + Class 10 banner (scroll to discovery)
        await page.send('Runtime.evaluate', {
            expression: `document.querySelector('.discovery-section').scrollIntoView();`
        });
        await new Promise(r => setTimeout(r, 400));
        let shot = await page.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(outDir, '390x844_discovery_class10.png'), Buffer.from(shot.data, 'base64'));

        // 2. Catalog Products
        await page.send('Runtime.evaluate', {
            expression: `document.querySelector('.books-grid').scrollIntoView();`
        });
        await new Promise(r => setTimeout(r, 400));
        shot = await page.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(outDir, '390x844_catalog_grid.png'), Buffer.from(shot.data, 'base64'));

        // 3. Footer
        await page.send('Runtime.evaluate', {
            expression: `document.querySelector('footer').scrollIntoView();`
        });
        await new Promise(r => setTimeout(r, 400));
        shot = await page.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(outDir, '390x844_footer_mobile.png'), Buffer.from(shot.data, 'base64'));

        // 4. Capture 320px Products (1 column verification)
        await page.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 1, mobile: true });
        await page.send('Runtime.evaluate', {
            expression: `document.querySelector('.books-grid').scrollIntoView();`
        });
        await new Promise(r => setTimeout(r, 400));
        shot = await page.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(outDir, '320x568_products_1col.png'), Buffer.from(shot.data, 'base64'));

        // 5. Capture 320px Class 10 Banner (2 prominent books overlap verification)
        await page.send('Runtime.evaluate', {
            expression: `document.querySelector('.class-feature-banner').scrollIntoView();`
        });
        await new Promise(r => setTimeout(r, 400));
        shot = await page.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(outDir, '320x568_class10_overlap.png'), Buffer.from(shot.data, 'base64'));

        console.log('✅ Additional mobile section screenshots captured successfully!');
        page.close();
        browser.close();
    } catch(e) {
        console.error(e);
    } finally {
        chrome.kill();
        process.exit(0);
    }
}

run();
