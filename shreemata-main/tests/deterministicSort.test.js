const http = require('http');
const express = require('express');
const { setupTestDB, teardownTestDB, clearTestDB } = require('./setup');
const Book = require('../models/Book');
const booksRouter = require('../routes/books');

describe('Deterministic Sort Verification for Books Listing (GET /api/books)', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    await setupTestDB();

    const app = express();
    app.use(express.json());
    app.use('/api/books', booksRouter);

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await teardownTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  function fetchJson(url) {
    return new Promise((resolve, reject) => {
      http.get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(body) });
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
  }

  test('Walks all pages with limit=12 when books share identical createdAt: no duplicate, no omission', async () => {
    const identicalTime = new Date('2026-05-15T12:00:00.000Z');
    const TOTAL_BOOKS = 36;
    const booksToInsert = [];

    for (let i = 1; i <= TOTAL_BOOKS; i++) {
      booksToInsert.push({
        title: `Identical Timestamp Book ${String(i).padStart(2, '0')}`,
        author: `Author ${i}`,
        price: 100 + i,
        category: 'general',
        class: i <= 18 ? '10' : '5',
        subject: i % 2 === 0 ? 'Mathematics' : 'Science',
        createdAt: identicalTime,
        updatedAt: identicalTime
      });
    }

    const inserted = await Book.insertMany(booksToInsert);
    expect(inserted.length).toBe(TOTAL_BOOKS);

    const allSeededIds = new Set(inserted.map((b) => b._id.toString()));
    expect(allSeededIds.size).toBe(TOTAL_BOOKS);

    // Walk all pages at limit=12
    const collectedIds = [];
    const limit = 12;
    let page = 1;
    let totalPages = 1;

    do {
      const res = await fetchJson(`${baseUrl}/api/books?page=${page}&limit=${limit}`);
      expect(res.status).toBe(200);
      expect(res.body.success !== false).toBe(true);

      const books = res.body.books;
      expect(Array.isArray(books)).toBe(true);
      expect(books.length).toBe(limit);

      totalPages = res.body.totalPages;
      for (const b of books) {
        collectedIds.push(b._id);
      }
      page++;
    } while (page <= totalPages);

    expect(totalPages).toBe(3); // 36 / 12 = 3
    expect(collectedIds.length).toBe(TOTAL_BOOKS);

    // Assert: no repeats
    const uniqueCollectedIds = new Set(collectedIds);
    expect(uniqueCollectedIds.size).toBe(TOTAL_BOOKS);

    // Assert: set of IDs equals the full seeded set (no missing books)
    for (const id of allSeededIds) {
      expect(uniqueCollectedIds.has(id)).toBe(true);
    }
  });
});
