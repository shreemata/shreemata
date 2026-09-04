const http = require('http');

function fetch(path) {
  return new Promise((resolve) => {
    http.get('http://localhost:3000' + path, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          resolve({ error: e.message, raw: d });
        }
      });
    }).on('error', e => resolve({ error: e.message }));
  });
}

async function inspect() {
  const booksData = await fetch('/api/books');
  const bundlesData = await fetch('/api/bundles');
  console.log('=== REAL BOOKS IN DATABASE ===');
  if (booksData.books) {
    booksData.books.forEach((b, i) => {
      console.log(`[${i}] Title: "${b.title}", Class: "${b.class}", Subject: "${b.subject}", Price: ₹${b.price}, Cover: "${b.cover_image}"`);
    });
  } else {
    console.log('No books or error:', booksData);
  }

  console.log('\n=== REAL BUNDLES IN DATABASE ===');
  if (bundlesData.bundles) {
    bundlesData.bundles.forEach((b, i) => {
      console.log(`[${i}] Name: "${b.name}", Price: ₹${b.bundlePrice}, Orig: ₹${b.originalPrice}, Image: "${b.image}", Books count: ${b.books ? b.books.length : 0}`);
    });
  } else {
    console.log('No bundles or error:', bundlesData);
  }
}

inspect();
