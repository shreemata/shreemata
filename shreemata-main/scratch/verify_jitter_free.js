const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function testJitterFreeIntro() {
    console.log('--- 1. Testing Homepage & Logo HTTP Endpoints ---');
    const pageRes = await axios.get('http://localhost:3000/');
    console.log(`Homepage status: ${pageRes.status} ${pageRes.statusText}`);

    const cssPath = path.join(__dirname, '..', 'public', 'css', 'home-3d.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    console.log('\n--- 2. Checking Jitter-Free CSS Rules ---');
    const hasIntroLogoIn = css.includes('@keyframes introLogoIn') && css.includes('transform: translate3d(0, 8px, 0) scale(0.96)');
    const hasNoWrapAnimation = !css.includes('.intro-logo-wrap {\n    animation:') && !css.includes('.intro-logo-wrap { animation:');
    const hasNoContinuousScalingOnLogo = !css.includes('@keyframes introHaloPulse') && css.includes('@keyframes haloFadeIn');
    const hasWillChange = css.includes('will-change: transform, opacity');
    const hasBackfaceHidden = css.includes('backface-visibility: hidden');
    const hasOneShotTitles = css.includes('@keyframes introTitleIn') && css.includes('@keyframes introSubIn');

    console.log(`Logo 1-shot translate3d keyframe (introLogoIn): ${hasIntroLogoIn ? 'PASS' : 'FAIL'}`);
    console.log(`No transform on parent .intro-logo-wrap: ${hasNoWrapAnimation ? 'PASS' : 'FAIL'}`);
    console.log(`No repeating scaling/pulse on logo elements: ${hasNoContinuousScalingOnLogo ? 'PASS' : 'FAIL'}`);
    console.log(`GPU acceleration (will-change: transform, opacity): ${hasWillChange ? 'PASS' : 'FAIL'}`);
    console.log(`Subpixel jitter prevention (backface-visibility: hidden): ${hasBackfaceHidden ? 'PASS' : 'FAIL'}`);
    console.log(`One-shot stable text reveals (introTitleIn, introSubIn): ${hasOneShotTitles ? 'PASS' : 'FAIL'}`);
}

testJitterFreeIntro().catch(console.error);
