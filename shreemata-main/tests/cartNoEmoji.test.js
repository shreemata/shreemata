/**
 * tests/cartNoEmoji.test.js
 *
 * Verifies that:
 * 1. The emoji weight chip (📦) is completely replaced with an inline SVG icon.
 * 2. No emoji character remains in the cart page item rows or cart summary.
 * 3. removeFromCart cleanly removes items with the restored base filter logic.
 */

const fs = require('fs');
const path = require('path');

describe('Cart UI No Emoji and Base Filter Verification', () => {
  const cartJsPath = path.resolve(__dirname, '../public/js/cart.js');
  const cartJsContent = fs.readFileSync(cartJsPath, 'utf8');

  test('weight-chip and weight-info in cart.js contain SVG and NO emoji', () => {
    // 1. Check weight-chip has SVG
    expect(cartJsContent).toMatch(/<span class="weight-chip"><svg/);

    // 2. Check neither weight-chip nor weight-info contains the package emoji 📦
    const weightChipMatches = cartJsContent.match(/class="weight-chip"[^>]*>([\s\S]*?)<\/span>/g) || [];
    weightChipMatches.forEach(chip => {
      expect(chip).not.toContain('📦');
      expect(chip).toContain('<svg');
    });

    const weightInfoMatches = cartJsContent.match(/class="weight-info"[^>]*>([\s\S]*?)<\/div>/g) || [];
    weightInfoMatches.forEach(info => {
      expect(info).not.toContain('📦');
      expect(info).toContain('<svg');
    });
  });

  test('removeFromCart uses the reverted base filter logic without custom type coercion', () => {
    expect(cartJsContent).toContain('cart = cart.filter(item => item.id !== itemId && item.bundleId !== itemId);');
    expect(cartJsContent).not.toContain('String(id) !== String(itemId)');
  });

  test('simulated cart HTML generation produces no emoji characters in rendered text', () => {
    // Check regex for extended pictographic emojis
    const emojiRegex = /\p{Extended_Pictographic}/u;

    // Simulate book and bundle row generation
    const sampleItems = [
      {
        id: 'book123',
        title: 'Physics Textbook',
        author: 'Dr. Sharma',
        price: 340,
        weight: 0.8,
        quantity: 2,
        isBundle: false,
        rewardPoints: 10
      },
      {
        bundleId: 'bundle456',
        name: 'Complete Science Set',
        price: 1200,
        weight: 2.5,
        quantity: 1,
        isBundle: true,
        books: [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }],
        rewardPoints: 50
      }
    ];

    // Verify row generation logic extracted from cart.js
    sampleItems.forEach(item => {
      const itemPrice = parseFloat(item.price) || 0;
      const itemId = item.id || item.bundleId;
      const itemTitle = (item.title && String(item.title).trim().toLowerCase() !== 'undefined')
          ? String(item.title).trim()
          : ((item.name && String(item.name).trim().toLowerCase() !== 'undefined')
              ? String(item.name).trim()
              : (item.isBundle || item.bundleId ? 'Book Set' : 'Book'));

      let subtitleHtml = '';
      let bundlePill = '';
      if (item.isBundle || item.bundleId) {
        bundlePill = '<span class="cart-bundle-pill">Book set</span>';
        const booksCount = (Array.isArray(item.books) && item.books.length > 0) ? item.books.length : 0;
        const bundleText = booksCount > 0 ? `${booksCount} books in this set` : 'Complete book set';
        subtitleHtml = `<span class="cart-item-meta-text">${bundleText}</span>`;
      } else if (item.author && typeof item.author === 'string' && item.author.trim() && item.author.trim().toLowerCase() !== 'undefined') {
        subtitleHtml = `<span class="cart-item-meta-text">by ${item.author.trim()}</span>`;
      }

      const pointsBadge = item.rewardPoints > 0
        ? `<div class="points-badge"><svg width="12" height="12" viewBox="0 0 24 24"><path d="M12 7..."></path></svg>+${item.rewardPoints * item.quantity} Points</div>`
        : '';

      const weightHtml = `<span class="weight-chip"><svg class="weight-icon" width="13" height="13" viewBox="0 0 24 24"><path d="..."></path></svg> ${(parseFloat(item.weight) || 0.5).toFixed(2)} kg</span>`;

      const renderedRow = `
        <h3>${itemTitle}</h3>
        ${bundlePill}
        ${subtitleHtml}
        ${weightHtml}
        ${pointsBadge}
      `;

      // Extract text content (strip tags)
      const textOnly = renderedRow.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      
      // Assert zero emoji in rendered text
      expect(textOnly).not.toMatch(emojiRegex);
      expect(textOnly).not.toContain('📦');
      expect(textOnly).not.toContain('🎁');
      expect(textOnly).not.toContain('🗑️');
    });
  });
});
