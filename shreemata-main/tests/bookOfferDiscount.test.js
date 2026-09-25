const { setupTestDB, teardownTestDB, clearTestDB } = require('./setup');
const Book = require('../models/Book');
const { getBookDisplayPricing } = require('../utils/pricingHelper');

describe('Book Offer & Discount Management Suite', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  test('1. Exact Test Case: Flat Discount (₹125 MRP, Flat ₹25 Discount -> ₹100 Selling Price, 20% OFF)', async () => {
    const bookData = {
      title: 'Test Book Flat Offer',
      author: 'Offer Test Author',
      price: 100, // Selling price
      physicalPrice: 125, // MRP
      discountEnabled: true,
      discountType: 'flat',
      discountValue: 25,
      sellingPrice: 100
    };

    const book = await Book.create(bookData);
    expect(book.physicalPrice).toBe(125);
    expect(book.discountEnabled).toBe(true);
    expect(book.discountType).toBe('flat');
    expect(book.discountValue).toBe(25);
    expect(book.sellingPrice).toBe(100);
    expect(book.price).toBe(100);

    // Calculate discount amount & percentage
    const discountAmount = book.physicalPrice - book.sellingPrice;
    const discountPercentage = Math.round((discountAmount / book.physicalPrice) * 100);
    expect(discountAmount).toBe(25);
    expect(discountPercentage).toBe(20);
  });

  test('2. Exact Test Case: Offer Disabled (₹125 MRP, Offer OFF -> ₹125 Selling Price, No Discount)', async () => {
    const bookData = {
      title: 'Test Book Offer Disabled',
      author: 'Offer Test Author',
      price: 125,
      physicalPrice: 125,
      discountEnabled: false,
      discountType: 'flat',
      discountValue: 0,
      sellingPrice: 125
    };

    const book = await Book.create(bookData);
    expect(book.physicalPrice).toBe(125);
    expect(book.discountEnabled).toBe(false);
    expect(book.sellingPrice).toBe(125);
    expect(book.price).toBe(125);
  });

  test('3. Percentage Discount (₹500 MRP, 10% Discount -> ₹450 Selling Price)', async () => {
    const physicalPrice = 500;
    const discountPct = 10;
    const discountAmount = (physicalPrice * discountPct) / 100;
    const sellingPrice = physicalPrice - discountAmount;

    const bookData = {
      title: 'Test Book Percentage Offer',
      author: 'Offer Test Author',
      price: sellingPrice,
      physicalPrice,
      discountEnabled: true,
      discountType: 'percentage',
      discountValue: discountPct,
      sellingPrice
    };

    const book = await Book.create(bookData);
    expect(book.physicalPrice).toBe(500);
    expect(book.discountEnabled).toBe(true);
    expect(book.discountType).toBe('percentage');
    expect(book.discountValue).toBe(10);
    expect(book.sellingPrice).toBe(450);
  });

  test('4. Backward Compatibility: Old Book without explicit offer fields', async () => {
    const legacyBook = new Book({
      title: 'Legacy Book Without Offer Fields',
      author: 'Offer Test Author',
      price: 250
    });

    await legacyBook.save();

    const fetched = await Book.findById(legacyBook._id);
    expect(fetched.discountEnabled).toBe(false);
    expect(fetched.price).toBe(250);
  });

  test('5. PUT: Enable offer on existing book (OFF -> ON, MRP 125, Flat 25 -> Selling 100)', async () => {
    const initialBook = await Book.create({
      title: 'Existing Book Offer OFF',
      author: 'Test Author',
      price: 125,
      physicalPrice: 125,
      discountEnabled: false,
      sellingPrice: 125
    });

    initialBook.discountEnabled = true;
    initialBook.discountType = 'flat';
    initialBook.discountValue = 25;
    initialBook.physicalPrice = 125;
    initialBook.sellingPrice = 100;
    initialBook.price = 100;
    await initialBook.save();

    const updated = await Book.findById(initialBook._id);
    expect(updated.discountEnabled).toBe(true);
    expect(updated.physicalPrice).toBe(125);
    expect(updated.sellingPrice).toBe(100);
    expect(updated.price).toBe(100);
  });

  test('6. PUT: Disable offer on existing book (ON -> OFF, MRP 125, Flat 25 -> Selling 125)', async () => {
    const initialBook = await Book.create({
      title: 'Existing Book Offer ON',
      author: 'Test Author',
      price: 100,
      physicalPrice: 125,
      discountEnabled: true,
      discountType: 'flat',
      discountValue: 25,
      sellingPrice: 100
    });

    initialBook.discountEnabled = false;
    initialBook.discountValue = 0;
    initialBook.sellingPrice = 125;
    initialBook.price = 125;
    await initialBook.save();

    const updated = await Book.findById(initialBook._id);
    expect(updated.discountEnabled).toBe(false);
    expect(updated.sellingPrice).toBe(125);
    expect(updated.price).toBe(125);
  });

  test('7. Internal profit fields & cover image remain intact during offer update', async () => {
    const book = await Book.create({
      title: 'Profit & Image Test Book',
      author: 'Test Author',
      price: 125,
      physicalPrice: 125,
      discountEnabled: false,
      profitType: 'fixed',
      profitValue: 20,
      profitConfigured: true,
      cover_image: 'https://example.com/cover.jpg',
      preview_images: ['https://example.com/p1.jpg']
    });

    book.discountEnabled = true;
    book.discountType = 'flat';
    book.discountValue = 25;
    book.sellingPrice = 100;
    book.price = 100;
    await book.save();

    const refetched = await Book.findById(book._id);
    expect(refetched.profitType).toBe('fixed');
    expect(refetched.profitValue).toBe(20);
    expect(refetched.profitConfigured).toBe(true);
    expect(refetched.cover_image).toBe('https://example.com/cover.jpg');
    expect(refetched.preview_images).toEqual(['https://example.com/p1.jpg']);
  });
});

describe('Customer Display Pricing Helper Suite', () => {
  test('1. ₹125 MRP with Flat ₹25 Discount -> Selling ₹100, 20% OFF, Save ₹25', () => {
    const book = {
      physicalPrice: 125,
      discountEnabled: true,
      discountType: 'flat',
      discountValue: 25,
      sellingPrice: 100,
      price: 100
    };

    const res = getBookDisplayPricing(book);
    expect(res.hasOffer).toBe(true);
    expect(res.mrp).toBe(125);
    expect(res.sellingPrice).toBe(100);
    expect(res.discountAmount).toBe(25);
    expect(res.discountPercentage).toBe(20);
  });

  test('2. Offer Disabled -> Only normal price displays (hasOffer = false)', () => {
    const book = {
      physicalPrice: 125,
      discountEnabled: false,
      discountType: 'flat',
      discountValue: 0,
      sellingPrice: 125,
      price: 125
    };

    const res = getBookDisplayPricing(book);
    expect(res.hasOffer).toBe(false);
    expect(res.mrp).toBe(125);
    expect(res.sellingPrice).toBe(125);
    expect(res.discountAmount).toBe(0);
    expect(res.discountPercentage).toBe(0);
  });

  test('3. Legacy book (no offer fields) -> Only book.price displays', () => {
    const book = {
      price: 250
    };

    const res = getBookDisplayPricing(book);
    expect(res.hasOffer).toBe(false);
    expect(res.mrp).toBe(250);
    expect(res.sellingPrice).toBe(250);
    expect(res.discountAmount).toBe(0);
    expect(res.discountPercentage).toBe(0);
  });

  test('4. Percentage Discount: MRP ₹500, 10% OFF -> Selling ₹450, Save ₹50', () => {
    const book = {
      physicalPrice: 500,
      discountEnabled: true,
      discountType: 'percentage',
      discountValue: 10,
      sellingPrice: 450,
      price: 450
    };

    const res = getBookDisplayPricing(book);
    expect(res.hasOffer).toBe(true);
    expect(res.mrp).toBe(500);
    expect(res.sellingPrice).toBe(450);
    expect(res.discountAmount).toBe(50);
    expect(res.discountPercentage).toBe(10);
  });

  test('5. Malformed offer (mrp <= sellingPrice) -> Safely falls back to price', () => {
    const book = {
      physicalPrice: 100,
      discountEnabled: true,
      sellingPrice: 125,
      price: 125
    };

    const res = getBookDisplayPricing(book);
    expect(res.hasOffer).toBe(false);
    expect(res.sellingPrice).toBe(125);
    expect(res.mrp).toBe(125);
  });
});
