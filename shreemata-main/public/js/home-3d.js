/**
 * SHREE MATA — PREMIUM EDITORIAL BOOKSTORE INTERACTION ENGINE (home-3d.js)
 * Calm, Photographic Parallax, Intersection Controls & View Transitions
 */

(function () {
    'use strict';

    // 1. SESSION-BASED EDITORIAL INTRO CONTROLLER
    function initCinematicIntro() {
        const intro = document.getElementById('cinematicIntro');
        if (!intro) return;

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const introSeen = sessionStorage.getItem('shreemata_intro_seen');

        if (introSeen || prefersReducedMotion) {
            intro.style.display = 'none';
            intro.remove();
            return;
        }

        sessionStorage.setItem('shreemata_intro_seen', 'true');

        function dismissIntro() {
            intro.classList.add('intro-hide');
            setTimeout(() => {
                if (intro.parentNode) intro.remove();
            }, 400);
        }

        const timer = setTimeout(dismissIntro, 1100);

        intro.addEventListener('click', () => {
            clearTimeout(timer);
            dismissIntro();
        });
    }

    // 2. ULTRA-CALM PHOTOGRAPHIC MOUSE PARALLAX (REAL 3D BOOKS STAGE)
    function initHeroParallax() {
        const stage = document.getElementById('heroStage');
        const heroSection = document.getElementById('heroSection');
        if (!stage || !heroSection) return;

        // Only enable on desktop pointer devices with fine hover
        const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!isFinePointer || prefersReducedMotion) return;

        let mouseX = 0;
        let mouseY = 0;
        let currentX = 0;
        let currentY = 0;
        let isHeroVisible = true;
        let rafId = null;

        // Visibility observer to pause RAF when hero is off-screen
        const heroObserver = new IntersectionObserver((entries) => {
            isHeroVisible = entries[0].isIntersecting;
            if (isHeroVisible && !rafId) {
                rafId = requestAnimationFrame(updateParallax);
            }
        }, { threshold: 0.05 });
        heroObserver.observe(heroSection);

        function onMouseMove(e) {
            const rect = heroSection.getBoundingClientRect();
            if (rect.top <= window.innerHeight && rect.bottom >= 0) {
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                mouseX = (e.clientX - centerX) / (rect.width / 2);
                mouseY = (e.clientY - centerY) / (rect.height / 2);
            }
        }

        window.addEventListener('mousemove', onMouseMove, { passive: true });

        function updateParallax() {
            if (!isHeroVisible) {
                rafId = null;
                return;
            }

            // High-damping smooth lerp for expensive photographic feel
            currentX += (mouseX - currentX) * 0.045;
            currentY += (mouseY - currentY) * 0.045;

            // Restrained limits: max rotateX ±1.8deg, rotateY ±2.5deg, translate ±4px
            const rotX = -currentY * 1.8;
            const rotY = currentX * 2.5;
            const transX = currentX * 4.0;
            const transY = currentY * 3.0;

            stage.style.transform = `rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) translate3d(${transX.toFixed(1)}px, ${transY.toFixed(1)}px, 0)`;

            rafId = requestAnimationFrame(updateParallax);
        }

        rafId = requestAnimationFrame(updateParallax);
    }

    // 3. MAIN HEADER SCROLL TRANSFORMATION
    function initHeaderScroll() {
        const header = document.querySelector('.main-header');
        if (!header) return;

        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    header.classList.toggle('scrolled', window.scrollY > 20);
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    }

    // 4. DYNAMIC CURRICULUM & DISCOVERY SELECTION HELPERS
    window.selectClassChip = function (el, classValue) {
        document.querySelectorAll('.class-chip-pill').forEach(c => c.classList.remove('active'));
        if (el && el.classList) el.classList.add('active');

        const classFilter = document.getElementById('classFilter');
        if (classFilter) {
            classFilter.value = classValue;
            classFilter.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const booksSection = document.getElementById('booksSection');
        if (booksSection) {
            booksSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    window.selectSubjectChip = function (subjectValue) {
        const subjectFilter = document.getElementById('subjectFilter');
        if (subjectFilter) {
            let matched = false;
            for (let i = 0; i < subjectFilter.options.length; i++) {
                if (subjectFilter.options[i].value.toLowerCase().includes(subjectValue.toLowerCase()) || 
                    subjectValue.toLowerCase().includes(subjectFilter.options[i].value.toLowerCase())) {
                    subjectFilter.selectedIndex = i;
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                subjectFilter.value = subjectValue;
            }
            subjectFilter.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const booksSection = document.getElementById('booksSection');
        if (booksSection) {
            booksSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // 5. ACETERNITY VORTEX PARTICLE BACKGROUND CANVAS
    function initVortexEffect() {
        const canvas = document.getElementById('vortexCanvas');
        if (!canvas || !canvas.parentElement) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) return;

        let width = canvas.width = canvas.parentElement.offsetWidth;
        let height = canvas.height = canvas.parentElement.offsetHeight;

        window.addEventListener('resize', () => {
            if (!canvas.parentElement) return;
            width = canvas.width = canvas.parentElement.offsetWidth;
            height = canvas.height = canvas.parentElement.offsetHeight;
        }, { passive: true });

        const particles = [];
        const particleCount = 70;
        let isHeroVisible = true;
        let rafId = null;

        const heroSection = document.getElementById('heroSection');
        if (heroSection) {
            const observer = new IntersectionObserver((entries) => {
                isHeroVisible = entries[0].isIntersecting;
                if (isHeroVisible && !rafId) {
                    rafId = requestAnimationFrame(animate);
                }
            }, { threshold: 0.05 });
            observer.observe(heroSection);
        }
        
        class VortexParticle {
            constructor() {
                this.reset();
            }
            reset() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.size = Math.random() * 2 + 1;
                this.speedX = (Math.random() - 0.5) * 1.2;
                this.speedY = (Math.random() - 0.5) * 1.2;
                this.color = Math.random() > 0.4 ? '#D4A72C' : '#244C6B'; // Gold & Navy
                this.life = Math.random() * 100 + 50;
            }
            update() {
                this.x += this.speedX;
                this.y += this.speedY;
                this.life--;
                if (this.life <= 0 || this.x < 0 || this.x > width || this.y < 0 || this.y > height) {
                    this.reset();
                }
            }
            draw() {
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        for (let i = 0; i < particleCount; i++) {
            particles.push(new VortexParticle());
        }

        function animate() {
            if (!isHeroVisible) {
                rafId = null;
                return;
            }

            ctx.clearRect(0, 0, width, height);
            
            // Connect nearby particles for a web/vortex feel
            for (let i = 0; i < particles.length; i++) {
                particles[i].update();
                particles[i].draw();

                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 100) {
                        ctx.strokeStyle = `rgba(212, 167, 44, ${0.15 * (1 - dist / 100)})`;
                        ctx.lineWidth = 0.8;
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }
            rafId = requestAnimationFrame(animate);
        }
        rafId = requestAnimationFrame(animate);
    }

    // 6. INITIALIZE ON DOM READY
    document.addEventListener('DOMContentLoaded', () => {
        initCinematicIntro();
        initHeroParallax();
        initHeaderScroll();
        initVortexEffect();
    });

})();
