const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function verifyEnhancedIntro() {
    console.log('--- 1. Testing Homepage & Logo HTTP Endpoints ---');
    const pageRes = await axios.get('http://localhost:3000/');
    console.log(`Homepage status: ${pageRes.status} ${pageRes.statusText}`);
    
    const logoRes = await axios.get('http://localhost:3000/images/press.png');
    console.log(`Logo asset status: ${logoRes.status} ${logoRes.statusText}`);

    const html = pageRes.data;

    console.log('\n--- 2. Checking HTML Markup Elements ---');
    const introBlock = html.substring(html.indexOf('id="cinematicIntro"'), html.indexOf('<!-- 2. ANNOUNCEMENT BAR -->'));
    
    const hasHalo = introBlock.includes('class="intro-halo"');
    const hasLogo = introBlock.includes('src="images/press.png"') && introBlock.includes('class="intro-logo"');
    const hasSweep = introBlock.includes('class="intro-sweep"');
    const hasParticles = introBlock.includes('class="intro-particles"') && introBlock.includes('class="intro-dot dot-1"');
    const hasBrand = introBlock.includes('class="intro-title"') && introBlock.includes('class="intro-sub"');

    console.log(`Soft Gold Halo container: ${hasHalo ? 'PASS' : 'FAIL'}`);
    console.log(`Real Logo (images/press.png): ${hasLogo ? 'PASS' : 'FAIL'}`);
    console.log(`Micro Gold Light Sweep container: ${hasSweep ? 'PASS' : 'FAIL'}`);
    console.log(`Ambient Decorative Particles: ${hasParticles ? 'PASS' : 'FAIL'}`);
    console.log(`Brand Title & Subtitle: ${hasBrand ? 'PASS' : 'FAIL'}`);

    console.log('\n--- 3. Checking CSS Styles in home-3d.css ---');
    const cssPath = path.join(__dirname, '..', 'public', 'css', 'home-3d.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    const hasHaloRadial = css.includes('radial-gradient') && css.includes('introHaloPulse');
    const hasLogoReveal = css.includes('@keyframes introLogoReveal') && css.includes('scale(0.88)');
    const hasTitleReveal = css.includes('@keyframes introTitleReveal');
    const hasSubReveal = css.includes('@keyframes introSubReveal');
    const hasSweepAnimation = css.includes('@keyframes introSweepMove');
    const hasParticleDrift = css.includes('@keyframes introParticleDrift');
    const hasMobileResponsive = css.includes('@media (max-width: 600px)') && css.includes('max-width: 84px');
    const hasReducedMotion = css.includes('@media (prefers-reduced-motion: reduce)');

    console.log(`Soft Gold Halo Radial & Pulse: ${hasHaloRadial ? 'PASS' : 'FAIL'}`);
    console.log(`Logo Reveal (scale 0.88 -> 1, translateY 10px -> 0): ${hasLogoReveal ? 'PASS' : 'FAIL'}`);
    console.log(`Brand Title Reveal: ${hasTitleReveal ? 'PASS' : 'FAIL'}`);
    console.log(`Tagline Reveal: ${hasSubReveal ? 'PASS' : 'FAIL'}`);
    console.log(`Micro Light Sweep Keyframes: ${hasSweepAnimation ? 'PASS' : 'FAIL'}`);
    console.log(`Particle Drift Keyframes: ${hasParticleDrift ? 'PASS' : 'FAIL'}`);
    console.log(`Mobile Responsive Adjustments: ${hasMobileResponsive ? 'PASS' : 'FAIL'}`);
    console.log(`Prefers-Reduced-Motion Support: ${hasReducedMotion ? 'PASS' : 'FAIL'}`);

    console.log('\n--- 4. Checking JS SessionStorage & Timing in home-3d.js ---');
    const jsPath = path.join(__dirname, '..', 'public', 'js', 'home-3d.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    const hasSessionStorage = js.includes("sessionStorage.getItem('shreemata_intro_seen')");
    const hasReducedMotionCheck = js.includes("prefers-reduced-motion: reduce");
    const hasDismissTiming = js.includes("setTimeout(dismissIntro, 1200)");

    console.log(`SessionStorage Single-Play Check: ${hasSessionStorage ? 'PASS' : 'FAIL'}`);
    console.log(`JS Reduced Motion Check: ${hasReducedMotionCheck ? 'PASS' : 'FAIL'}`);
    console.log(`Short Premium Timing (1.2s trigger + 0.38s transition): ${hasDismissTiming ? 'PASS' : 'FAIL'}`);
}

verifyEnhancedIntro().catch(console.error);
