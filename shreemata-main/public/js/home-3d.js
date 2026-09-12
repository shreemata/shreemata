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

        const timer = setTimeout(dismissIntro, 1200);

        intro.addEventListener('click', () => {
            clearTimeout(timer);
            dismissIntro();
        });
    }

    // 2. 3D HERO BOOK STAGE: INTERACTIVE DRAG-ROTATION, PARALLAX & IDLE FLOATING ENGINE
    function initHeroParallax() {
        const stage = document.getElementById('heroStage');
        const heroSection = document.getElementById('heroSection');
        if (!stage || !heroSection) return;

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // Pointer Drag State
        let isPointerDown = false;
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let lastX = 0;
        let lastY = 0;
        let velocityX = 0;
        let velocityY = 0;
        let targetManualRotX = 0;
        let targetManualRotY = 0;
        let currentManualRotX = 0;
        let currentManualRotY = 0;
        let lastInteractionTime = performance.now();
        let activePointerId = null;

        // Desktop Parallax State
        let mouseX = 0;
        let mouseY = 0;
        let currentParallaxX = 0;
        let currentParallaxY = 0;
        let isHeroVisible = true;
        let isTabActive = !document.hidden;
        let rafId = null;

        const hasFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

        // 1. POINTER DRAG LISTENERS (Desktop Mouse, Touch & Stylus)
        function onPointerDown(e) {
            // Only primary button for mouse
            if (e.pointerType === 'mouse' && e.button !== 0) return;

            isPointerDown = true;
            isDragging = false;
            activePointerId = e.pointerId;
            startX = e.clientX;
            startY = e.clientY;
            lastX = e.clientX;
            lastY = e.clientY;
            velocityX = 0;
            velocityY = 0;
            lastInteractionTime = performance.now();
        }

        function onPointerMove(e) {
            if (!isPointerDown) return;

            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            const totalDistX = Math.abs(e.clientX - startX);
            const totalDistY = Math.abs(e.clientY - startY);

            // Determine drag vs scroll
            if (!isDragging) {
                if (totalDistX > 5 || totalDistY > 5) {
                    // On touch, if movement is predominantly vertical, allow normal page scroll
                    if (e.pointerType === 'touch' && totalDistY > totalDistX * 1.6 && totalDistX < 8) {
                        isPointerDown = false;
                        return;
                    }

                    isDragging = true;
                    try {
                        stage.setPointerCapture(e.pointerId);
                    } catch (err) {
                        // Safe fallback if capture fails
                    }
                    stage.classList.add('is-dragging');
                    document.body.classList.add('hero-stage-dragging');
                }
            }

            if (isDragging) {
                if (e.cancelable) {
                    e.preventDefault();
                }

                const isMobile = window.innerWidth <= 768;
                // Sensitivity
                const sensX = isMobile ? 0.16 : 0.22;
                const sensY = isMobile ? 0.08 : 0.12;

                // Rotation Limits
                const maxRotX = isMobile ? 6 : 10;
                const maxRotY = isMobile ? 20 : 35;

                targetManualRotY += dx * sensX;
                targetManualRotX -= dy * sensY;

                // Clamp to prevent flipping
                targetManualRotX = Math.max(-maxRotX, Math.min(maxRotX, targetManualRotX));
                targetManualRotY = Math.max(-maxRotY, Math.min(maxRotY, targetManualRotY));

                // Momentary velocity for inertia
                velocityX = dx * 0.32;
                velocityY = -dy * 0.22;

                lastX = e.clientX;
                lastY = e.clientY;
                lastInteractionTime = performance.now();
            }
        }

        function onPointerUp(e) {
            if (!isPointerDown && !isDragging) return;

            isPointerDown = false;
            if (isDragging) {
                isDragging = false;
                stage.classList.remove('is-dragging');
                document.body.classList.remove('hero-stage-dragging');
                if (activePointerId !== null && stage.hasPointerCapture && stage.hasPointerCapture(activePointerId)) {
                    try {
                        stage.releasePointerCapture(activePointerId);
                    } catch (err) {}
                }
                lastInteractionTime = performance.now();
            }
            activePointerId = null;
        }

        function onPointerCancel(e) {
            onPointerUp(e);
        }

        // Double Click / Double Tap View Reset
        function onDoubleClick() {
            targetManualRotX = 0;
            targetManualRotY = 0;
            velocityX = 0;
            velocityY = 0;
            lastInteractionTime = performance.now() - 3000;
        }

        stage.addEventListener('pointerdown', onPointerDown, { passive: false });
        window.addEventListener('pointermove', onPointerMove, { passive: false });
        window.addEventListener('pointerup', onPointerUp, { passive: true });
        window.addEventListener('pointercancel', onPointerCancel, { passive: true });
        stage.addEventListener('dblclick', onDoubleClick, { passive: true });

        // 2. DESKTOP MOUSE PARALLAX TRACKING
        function onMouseMove(e) {
            if (isDragging) return;
            const rect = heroSection.getBoundingClientRect();
            if (rect.top <= window.innerHeight && rect.bottom >= 0) {
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                mouseX = Math.max(-1, Math.min(1, (e.clientX - centerX) / (rect.width / 2)));
                mouseY = Math.max(-1, Math.min(1, (e.clientY - centerY) / (rect.height / 2)));
            }
        }

        function onMouseLeave() {
            mouseX = 0;
            mouseY = 0;
        }

        if (hasFinePointer) {
            heroSection.addEventListener('mousemove', onMouseMove, { passive: true });
            heroSection.addEventListener('mouseleave', onMouseLeave, { passive: true });
            window.addEventListener('mousemove', onMouseMove, { passive: true });
        }

        // 3. VISIBILITY OBSERVER & TAB VISIBILITY CONTROLS
        const heroObserver = new IntersectionObserver((entries) => {
            isHeroVisible = entries[0].isIntersecting;
            handleAnimationState();
        }, { threshold: 0.05 });
        heroObserver.observe(heroSection);

        document.addEventListener('visibilitychange', () => {
            isTabActive = !document.hidden;
            handleAnimationState();
        });

        function handleAnimationState() {
            if (isHeroVisible && isTabActive) {
                if (!rafId) {
                    rafId = requestAnimationFrame(updateEngine);
                }
            } else {
                if (rafId) {
                    cancelAnimationFrame(rafId);
                    rafId = null;
                }
            }
        }

        // 4. MAIN ANIMATION & COMPOSITION LOOP
        function updateEngine() {
            if (!isHeroVisible || !isTabActive) {
                rafId = null;
                return;
            }

            const time = performance.now() * 0.001;
            const isMobile = window.innerWidth <= 768;

            if (prefersReducedMotion) {
                // In reduced-motion mode: direct rotation without inertia/floating/drift
                currentManualRotX = targetManualRotX;
                currentManualRotY = targetManualRotY;
                stage.style.transform = `rotateX(${currentManualRotX.toFixed(2)}deg) rotateY(${currentManualRotY.toFixed(2)}deg)`;
                rafId = requestAnimationFrame(updateEngine);
                return;
            }

            // Inertia & decay when pointer is released
            if (!isDragging) {
                if (Math.abs(velocityX) > 0.01 || Math.abs(velocityY) > 0.01) {
                    const maxRotX = isMobile ? 6 : 10;
                    const maxRotY = isMobile ? 20 : 35;

                    targetManualRotY += velocityX;
                    targetManualRotX += velocityY;

                    targetManualRotX = Math.max(-maxRotX, Math.min(maxRotX, targetManualRotX));
                    targetManualRotY = Math.max(-maxRotY, Math.min(maxRotY, targetManualRotY));

                    velocityX *= 0.92;
                    velocityY *= 0.90;

                    if (Math.abs(velocityX) < 0.01) velocityX = 0;
                    if (Math.abs(velocityY) < 0.01) velocityY = 0;
                } else {
                    // Return / Idle Behavior after 2.5s of inactivity
                    const timeSinceInteraction = performance.now() - lastInteractionTime;
                    if (timeSinceInteraction > 2500) {
                        targetManualRotX += (0 - targetManualRotX) * 0.035;
                        targetManualRotY += (0 - targetManualRotY) * 0.035;

                        if (Math.abs(targetManualRotX) < 0.05) targetManualRotX = 0;
                        if (Math.abs(targetManualRotY) < 0.05) targetManualRotY = 0;
                    }
                }
            }

            // Smooth interpolation for manual rotation (0.08)
            currentManualRotX += (targetManualRotX - currentManualRotX) * 0.08;
            currentManualRotY += (targetManualRotY - currentManualRotY) * 0.08;

            // Manual rotation activity factor (0 = fully idle, 1 = manual active)
            const manualMagnitude = Math.abs(currentManualRotX) + Math.abs(currentManualRotY);
            const manualActivity = Math.min(1, manualMagnitude / 10 + (isDragging ? 1 : 0));
            const parallaxWeight = Math.max(0, 1 - manualActivity * 0.9);

            let totalRotX, totalRotY, transX, transY;

            if (hasFinePointer && !isMobile) {
                // Desktop Parallax + Continuous Float
                currentParallaxX += (mouseX - currentParallaxX) * 0.055;
                currentParallaxY += (mouseY - currentParallaxY) * 0.055;

                const floatY = Math.sin(time * 0.95) * 4.0;
                const idleRotY = Math.sin(time * 0.6) * 1.2 * (1 - manualActivity);

                const parallaxRotX = -currentParallaxY * 3.0 * parallaxWeight;
                const parallaxRotY = currentParallaxX * 5.0 * parallaxWeight;

                totalRotX = (currentManualRotX + parallaxRotX).toFixed(2);
                totalRotY = (currentManualRotY + parallaxRotY + idleRotY).toFixed(2);
                transX = (currentParallaxX * 6.0 * parallaxWeight).toFixed(2);
                transY = (currentParallaxY * 4.0 * parallaxWeight + floatY).toFixed(2);
            } else {
                // Mobile Floating Wave
                const floatY = Math.sin(time * 0.95) * 3.0;
                totalRotX = currentManualRotX.toFixed(2);
                totalRotY = currentManualRotY.toFixed(2);
                transX = '0.00';
                transY = floatY.toFixed(2);
            }

            stage.style.transform = `rotateX(${totalRotX}deg) rotateY(${totalRotY}deg) translate3d(${transX}px, ${transY}px, 0)`;

            rafId = requestAnimationFrame(updateEngine);
        }

        handleAnimationState();
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
    window.filterByClass = function (classValue, el) {
        document.querySelectorAll('.discovery-class-btn, .class-chip-pill').forEach(c => c.classList.remove('active'));
        if (el && el.classList) {
            el.classList.add('active');
        } else if (classValue) {
            const btn = document.querySelector(`.discovery-class-btn[data-class="${classValue}"]`);
            if (btn) btn.classList.add('active');
        }

        const classFilter = document.getElementById('classFilter');
        if (classFilter) {
            let exists = Array.from(classFilter.options).some(opt => opt.value === String(classValue));
            if (!exists && classValue) {
                const opt = document.createElement('option');
                opt.value = classValue;
                opt.textContent = `Class ${classValue}`;
                classFilter.appendChild(opt);
            }
            classFilter.value = classValue;
            classFilter.dispatchEvent(new Event('change', { bubbles: true }));
        }

        if (typeof filterAndDisplayBooks === 'function') {
            const subjectFilter = document.getElementById('subjectFilter');
            const selectedSubject = subjectFilter ? subjectFilter.value : '';
            const searchInput = document.getElementById("searchInput");
            const searchTerm = searchInput ? searchInput.value.trim() : '';
            filterAndDisplayBooks(String(classValue), selectedSubject, searchTerm);
        }

        const booksSection = document.getElementById('booksSection');
        if (booksSection) {
            booksSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    window.selectClassChip = function (el, classValue) {
        window.filterByClass(classValue, el);
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
