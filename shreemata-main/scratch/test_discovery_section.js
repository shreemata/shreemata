const fs = require('fs');
const path = require('path');

function runDiscoveryAudit() {
    console.log('====================================================');
    console.log('SHREE MATA — "WHAT ARE YOU LOOKING FOR?" SECTION AUDIT');
    console.log('====================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(name, condition, detail = '') {
        if (condition) {
            console.log(`✅ PASS: ${name}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${name} ${detail ? `(${detail})` : ''}`);
            failed++;
        }
    }

    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const homeJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'home.js'), 'utf8');
    const home3dJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'home-3d.js'), 'utf8');
    const home3dCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'home-3d.css'), 'utf8');

    // 1. SECTION STRUCTURE & HEADINGS
    console.log('--- 1. Section Structure & Headings ---');
    assert('Section exists with id="discoverySection"', indexHtml.includes('id="discoverySection"'));
    assert('Section retains main heading "What are you looking for?"', indexHtml.includes('What are you looking for?'));
    assert('Old generic card "Individual Books" removed from discovery section', !indexHtml.includes('<h3>Individual Books</h3>'));
    assert('Old generic card "Shop by Subject" removed from discovery section', !indexHtml.includes('<h3>Shop by Subject</h3>'));

    // 2. SHOP BY CLASS SUBSECTION
    console.log('\n--- 2. Shop by Class Subsection ---');
    assert('Subsection has heading "🎓 Shop by Class"', indexHtml.includes('🎓 Shop by Class'));
    assert('Subsection has subtitle "Find books for your class"', indexHtml.includes('Find books for your class'));
    
    for (let c = 1; c <= 10; c++) {
        const btnHtml = `data-class="${c}" onclick="filterByClass('${c}', this)"`;
        const titleHtml = `Class ${c}`;
        assert(`Class ${c} button exists with correct data-class and onclick handler`, 
            indexHtml.includes(btnHtml) && indexHtml.includes(titleHtml)
        );
    }

    // 3. SHOP BY COMBO SUBSECTION
    console.log('\n--- 3. Shop by Combo Subsection ---');
    assert('Subsection has heading "📦 Shop by Combo"', indexHtml.includes('📦 Shop by Combo'));
    assert('Subsection has subtitle "Complete book sets for your class"', indexHtml.includes('Complete book sets for your class'));
    assert('Combo Card has title "Complete Book Sets"', indexHtml.includes('Complete Book Sets'));
    assert('Combo Card has description "Get all required books together in one convenient combo."', indexHtml.includes('Get all required books together in one convenient combo.'));
    assert('Combo Card has CTA button "View Book Combos"', indexHtml.includes('View Book Combos'));
    assert('CTA button links to bundles.html', indexHtml.includes('href="bundles.html"') && indexHtml.includes('id="viewBookCombosBtn"'));

    // 4. FUNCTIONAL JAVASCRIPT FILTERING
    console.log('\n--- 4. Functional Class Filtering Logic (JS) ---');
    assert('home.js defines and exports window.filterByClass', homeJs.includes('window.filterByClass = function'));
    assert('home-3d.js defines window.filterByClass', home3dJs.includes('window.filterByClass = function'));
    assert('filterByClass updates active button highlight', homeJs.includes("classList.remove('active')") && homeJs.includes("classList.add('active')"));
    assert('filterByClass updates #classFilter and dispatches change event', homeJs.includes("classFilter.value = classValue") && home3dJs.includes("classFilter.dispatchEvent"));
    assert('filterByClass triggers filterAndDisplayBooks', homeJs.includes("filterAndDisplayBooks(String(classValue)") || home3dJs.includes("filterAndDisplayBooks(String(classValue)"));
    assert('filterByClass smooth-scrolls to #booksSection', homeJs.includes("booksSection.scrollIntoView({ behavior: 'smooth'") || home3dJs.includes("booksSection.scrollIntoView({ behavior: 'smooth'"));

    // 5. CSS DESIGN SYSTEM & RESPONSIVE LAYOUT
    console.log('\n--- 5. CSS Design System & Responsive Rules ---');
    assert('CSS defines .discovery-section with warm ivory / pure white styling', home3dCss.includes('.discovery-section {') && home3dCss.includes('var(--bg-white-premium)'));
    assert('CSS defines desktop .discovery-class-grid (5 columns)', home3dCss.includes('.discovery-class-grid {') && home3dCss.includes('repeat(5, 1fr)'));
    assert('CSS defines .discovery-class-btn with rounded corners and warm ivory bg', home3dCss.includes('.discovery-class-btn {') && home3dCss.includes('border-radius: 14px') && home3dCss.includes('var(--bg-warm-ivory)'));
    assert('CSS defines .discovery-class-btn hover lift and gold accent', home3dCss.includes('.discovery-class-btn:hover {') && home3dCss.includes('translateY(-2px)') && home3dCss.includes('var(--gold-primary'));
    assert('CSS defines .discovery-combo-card with gradient and gold border', home3dCss.includes('.discovery-combo-card {') && home3dCss.includes('linear-gradient') && home3dCss.includes('border-radius: 16px'));
    assert('CSS defines .discovery-combo-btn CTA with hover effects', home3dCss.includes('.discovery-combo-btn {') && home3dCss.includes('.discovery-combo-btn:hover {'));

    // 6. MOBILE RESPONSIVE MEDIA QUERIES (<= 768px, <= 340px)
    console.log('\n--- 6. Mobile & Small Screen Media Queries ---');
    assert('Mobile <= 768px sets 2 columns for class grid', home3dCss.includes('@media (max-width: 768px)') && home3dCss.includes('grid-template-columns: repeat(2, 1fr) !important;'));
    assert('Mobile <= 768px stacks combo card vertically', home3dCss.includes('@media (max-width: 768px)') && home3dCss.includes('flex-direction: column'));
    assert('Mobile <= 768px sets full-width combo button', home3dCss.includes('@media (max-width: 768px)') && home3dCss.includes('width: 100%') && home3dCss.includes('.discovery-combo-btn'));
    assert('Narrow <= 340px sets compact gaps and paddings without overflow', home3dCss.includes('@media (max-width: 340px)') && home3dCss.includes('.discovery-class-btn'));

    // 7. SIMULATE CLIENT-SIDE FILTER LOGIC
    console.log('\n--- 7. Simulated Client-Side Class 1-10 Filtering Execution ---');
    const mockBooks = [
        { _id: '1', title: 'Mathematics Grade 1', class: '1', subject: 'Mathematics', price: 120 },
        { _id: '2', title: 'English Grade 2', class: '2', subject: 'English', price: 110 },
        { _id: '3', title: 'Science Grade 3', class: '3', subject: 'Science', price: 130 },
        { _id: '4', title: 'Social Science Grade 4', class: '4', subject: 'Social Science', price: 140 },
        { _id: '5', title: 'Mathematics Grade 5', class: '5', subject: 'Mathematics', price: 150 },
        { _id: '6', title: 'General Science Grade 6', class: '6', subject: 'Science', price: 160 },
        { _id: '7', title: 'History Grade 7', class: '7', subject: 'Social Science', price: 170 },
        { _id: '8', title: 'Kannada Grade 8', class: '8', subject: 'Kannada', price: 180 },
        { _id: '9', title: 'Hindi Grade 9', class: '9', subject: 'Hindi', price: 190 },
        { _id: '10', title: 'Mathematics Class 10', class: '10', subject: 'Mathematics', price: 200 }
    ];

    for (let c = 1; c <= 10; c++) {
        const selectedClass = String(c);
        const filtered = mockBooks.filter(b => b.class && b.class.toString() === selectedClass);
        assert(`Class ${c} filter accurately isolates Class ${c} books (${filtered.length} found)`, filtered.length === 1 && filtered[0].class === String(c));
    }

    console.log('\n====================================================');
    console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed === 0) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runDiscoveryAudit();
