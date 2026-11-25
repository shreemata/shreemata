/**
 * tests/customerPagesPhoneNumberBrowser.test.js
 * 
 * Real-browser tests verifying customer contact phone number update:
 * - New contact number: 08362006278
 * - Displayed text: "08362 006278"
 * - Tel link href: "tel:+918362006278"
 * - Verified across all 8 modified customer pages:
 *   1. public/book.html
 *   2. public/bundle.html
 *   3. public/bundles.html
 *   4. public/cart.html
 *   5. public/commission-history.html
 *   6. public/login.html
 *   7. public/orders.html
 *   8. public/signup.html
 * 
 * Asserts:
 * - New number "08362 006278" appears in footer/contact
 * - Tel href equals "tel:+918362006278"
 * - No old number (9845163604, 98451 63604, 9886086278, 98860 86278) remains on any of these pages
 */

const path = require('path');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { chromium } = require('C:/Users/KRISHNA TAMBUR/browser-test/node_modules/playwright-core');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPO_DIR = path.resolve(__dirname, '..');

const Book = require('../models/Book');
const Bundle = require('../models/Bundle');

let mongod;
let server;
let baseUrl;
let browser;
let testBook;
let testBundle;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  testBook = await Book.create({
    title: 'Phone Test Book',
    author: 'Author Test',
    price: 100,
    mrp: 120,
    weight: 0.5,
    trackStock: false
  });

  testBundle = await Bundle.create({
    name: 'Phone Test Bundle',
    bundlePrice: 200,
    originalPrice: 250,
    weight: 1.0,
    books: [testBook._id],
    isDigital: false
  });

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(REPO_DIR, 'public')));
  app.use('/api/books', require('../routes/books'));
  app.use('/api/bundles', require('../routes/bundles'));

  server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH
  });
}, 60000);

afterAll(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe('Customer Pages Contact Phone Number Verification', () => {
  const pagesToTest = [
    { name: 'book.html', path: () => `/book.html?id=${testBook._id}`, type: 'standard-footer' },
    { name: 'bundle.html', path: () => `/bundle.html?id=${testBundle._id}`, type: 'standard-footer' },
    { name: 'bundles.html', path: () => `/bundles.html`, type: 'standard-footer' },
    { name: 'cart.html', path: () => `/cart.html`, type: 'standard-footer' },
    { name: 'commission-history.html', path: () => `/commission-history.html`, type: 'compact-footer' },
    { name: 'login.html', path: () => `/login.html`, type: 'compact-footer' },
    { name: 'orders.html', path: () => `/orders.html`, type: 'compact-footer' },
    { name: 'signup.html', path: () => `/signup.html`, type: 'compact-footer' }
  ];

  pagesToTest.forEach(({ name, path: getPath, type }) => {
    test(`Page ${name} shows new phone 08362 006278, tel:+918362006278, and has no old numbers`, async () => {
      const page = await browser.newPage();
      try {
        const url = `${baseUrl}${getPath()}`;
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        expect(response.status()).toBe(200);

        // Wait for footer to be present
        await page.waitForSelector('footer', { timeout: 5000 });

        // Retrieve full page content
        const pageContent = await page.content();

        // 1. Assert NO old phone numbers appear anywhere on the rendered page
        expect(pageContent).not.toMatch(/98451\s*63604/);
        expect(pageContent).not.toMatch(/98860\s*86278/);
        expect(pageContent).not.toContain('tel:+919845163604');
        expect(pageContent).not.toContain('tel:+919886086278');
        expect(pageContent).not.toContain('tel:9886086278');

        // 2. Assert new phone number appears in the footer
        const footerText = await page.$eval('footer', el => el.innerText);
        expect(footerText).toContain('08362 006278');

        // 3. Assert tel links have href="tel:+918362006278"
        const telLinks = await page.$$eval('footer a[href^="tel:"]', links =>
          links.map(a => ({ href: a.getAttribute('href'), text: a.innerText.trim() }))
        );

        expect(telLinks.length).toBeGreaterThanOrEqual(1);

        telLinks.forEach(link => {
          expect(link.href).toBe('tel:+918362006278');
          expect(link.text).toContain('08362 006278');
        });

        if (type === 'standard-footer') {
          // Standard footer has both .footer-phone-link and .footer-care-phone
          const brandLinkHref = await page.$eval('footer a.footer-phone-link', el => el.getAttribute('href'));
          const brandLinkText = await page.$eval('footer a.footer-phone-link', el => el.innerText.trim());
          expect(brandLinkHref).toBe('tel:+918362006278');
          expect(brandLinkText).toContain('08362 006278');

          const careLinkHref = await page.$eval('footer a.footer-care-phone', el => el.getAttribute('href'));
          const careLinkText = await page.$eval('footer a.footer-care-phone', el => el.innerText.trim());
          expect(careLinkHref).toBe('tel:+918362006278');
          expect(careLinkText).toContain('08362 006278');
        }
      } finally {
        await page.close();
      }
    });
  });
});
