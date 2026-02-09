/* ═══════════════════════════════════════════════════════════════════════════════
   
   MACRA EFFECTS v1.0
   ════════════════════════════════════════════════════════════════════════════════
   
   Innovative animations to make MACRA feel premium and cutting-edge.
   Built on GSAP + Custom Effects inspired by MSG Effects Catalog.
   
   EFFECTS INCLUDED:
   ─────────────────
   1. View Transitions (Circular Reveal)
   2. Scroll Animations (Fade In)
   3. Number Counters (Animated Stats)
   4. Pulse Effects (Breathing Glow)
   5. Confetti/Fireworks (Celebrations)
   6. Particle Effects (Ambient Background)
   7. Progress Bar (Scroll Indicator)
   8. Gesture Effects (Hold to Confirm)
   9. Text Typewriter (AI Response Effect)
   
   ═══════════════════════════════════════════════════════════════════════════════ */

const MACRA_FX = {
    
    version: '1.0.0',
    initialized: false,
    
    // ═══════════════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════════════
    
    init() {
        if (this.initialized) return;
        
        console.log('✨ MACRA Effects v' + this.version + ' initializing...');
        
        // Initialize GSAP plugins
        if (typeof gsap !== 'undefined') {
            gsap.registerPlugin(ScrollTrigger);
        } else {
            console.warn('MACRA FX: GSAP not found, some effects disabled');
        }
        
        // Initialize all effects
        this.progressBar.init();
        this.scrollAnimations.init();
        this.particles.init();
        this.viewTransitions.init();
        
        this.initialized = true;
        console.log('✨ MACRA Effects ready!');
    },
    
    // ═══════════════════════════════════════════════════════════════════════════
    // 1. VIEW TRANSITIONS (Circular Reveal)
    // ═══════════════════════════════════════════════════════════════════════════
    
    viewTransitions: {
        lastClickX: window.innerWidth / 2,
        lastClickY: window.innerHeight / 2,
        
        init() {
            // Track click positions for circular reveal origin
            document.addEventListener('click', (e) => {
                this.lastClickX = e.clientX;
                this.lastClickY = e.clientY;
            });
        },
        
        // Circular reveal transition
        circularReveal(callback, duration = 0.6) {
            const x = this.lastClickX;
            const y = this.lastClickY;
            
            // Check if View Transitions API is supported
            if (document.startViewTransition) {
                document.startViewTransition(() => {
                    if (callback) callback();
                });
            } else {
                // Fallback: Create overlay and animate
                const overlay = document.createElement('div');
                overlay.style.cssText = `
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: var(--obsidian);
                    z-index: 99999;
                    clip-path: circle(0% at ${x}px ${y}px);
                    pointer-events: none;
                `;
                document.body.appendChild(overlay);
                
                gsap.to(overlay, {
                    clipPath: `circle(150% at ${x}px ${y}px)`,
                    duration: duration,
                    ease: 'power2.out',
                    onComplete: () => {
                        if (callback) callback();
                        gsap.to(overlay, {
                            opacity: 0,
                            duration: 0.3,
                            onComplete: () => overlay.remove()
                        });
                    }
                });
            }
        },
        
        // Slide transition
        slideTransition(direction = 'left', callback) {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: var(--obsidian);
                z-index: 99999;
                transform: translateX(${direction === 'left' ? '100%' : '-100%'});
            `;
            document.body.appendChild(overlay);
            
            gsap.to(overlay, {
                x: 0,
                duration: 0.4,
                ease: 'power2.inOut',
                onComplete: () => {
                    if (callback) callback();
                    gsap.to(overlay, {
                        x: direction === 'left' ? '-100%' : '100%',
                        duration: 0.4,
                        ease: 'power2.inOut',
                        onComplete: () => overlay.remove()
                    });
                }
            });
        }
    },
    
    // ═══════════════════════════════════════════════════════════════════════════
    // 2. SCROLL ANIMATIONS
    // ═══════════════════════════════════════════════════════════════════════════
    
    scrollAnimations: {
        init() {
            if (typeof gsap === 'undefined') return;
            
            // Animate cards on scroll
            gsap.utils.toArray('.card, .stat-card').forEach((card, i) => {
                gsap.fromTo(card, 
                    { opacity: 0, y: 30 },
                    {
                        opacity: 1,
                        y: 0,
                        duration: 0.6,
                        delay: i * 0.1,
                        ease: 'power2.out',
                        scrollTrigger: {
                            trigger: card,
                            start: 'top 90%',
                            toggleActions: 'play none none none'
                        }
                    }
                );
            });
            
            // Animate timeline items
            gsap.utils.toArray('.timeline-item, .activity-item').forEach((item, i) => {
                gsap.fromTo(item,
                    { opacity: 0, x: -20 },
                    {
                        opacity: 1,
                        x: 0,
                        duration: 0.5,
                        delay: i * 0.05,
                        ease: 'power2.out',
                        scrollTrigger: {
                            trigger: item,
                            start: 'top 95%',
                            toggleActions: 'play none none none'
                        }
                    }
                );
            });
        },
        
        // Refresh scroll triggers (call after DOM changes)
        refresh() {
            if (typeof ScrollTrigger !== 'undefined') {
                ScrollTrigger.refresh();
            }
        },
        
        // Animate a specific element in
        animateIn(element, options = {}) {
            const defaults = {
                from: { opacity: 0, y: 30 },
                to: { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
            };
            const config = { ...defaults, ...options };
            return gsap.fromTo(element, config.from, config.to);
        }
    },
    
    // ═══════════════════════════════════════════════════════════════════════════
    // 3. NUMBER COUNTERS
    // ═══════════════════════════════════════════════════════════════════════════
    
    numberCounter: {
        // Animate a number from 0 to target
        animate(element, target, options = {}) {
            const config = {
                duration: 1.5,
                ease: 'power2.out',
                suffix: '',
                prefix: '',
                decimals: 0,
                ...options
            };
            
            const el = typeof element === 'string' ? document.querySelector(element) : element;
            if (!el) return;
            
            const obj = { value: 0 };
            
            gsap.to(obj, {
                value: target,
                duration: config.duration,
                ease: config.ease,
                onUpdate: () => {
                    el.textContent = config.prefix + obj.value.toFixed(config.decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + config.suffix;
                }
            });
        },
        
        // Animate all stat values on the page
        animateAllStats() {
            const stats = [
                { selector: '#statStreak', suffix: '' },
                { selector: '#statCalories', suffix: '' },
                { selector: '#statProtein', suffix: 'g' },
                { selector: '#statWorkouts', suffix: '' },
                { selector: '#statPRs', suffix: '' },
                { selector: '#statPoints', suffix: '' }
            ];
            
            stats.forEach(stat => {
                const el = document.querySelector(stat.selector);
                if (el) {
                    const text = el.textContent;
                    const value = parseInt(text.replace(/[^0-9]/g, '')) || 0;
                    if (value > 0) {
                        el.textContent = '0';
                        this.animate(el, value, { suffix: stat.suffix, duration: 1.2 });
                    }
                }
            });
        }
    },
    
    // ═══════════════════════════════════════════════════════════════════════════
    // 4. PULSE EFFECTS
    // ═══════════════════════════════════════════════════════════════════════════
    
    pulse: {
        // Continuous breathing pulse
        breathe(element, options = {}) {
            const config = {
                scale: 1.1,
                duration: 1.5,
                ...options
            };
            
            return gsap.to(element, {
                scale: config.scale,
                duration: config.duration,
                ease: 'sine.inOut',
                repeat: -1,
                yoyo: true
            });
        },
        
        // Glow pulse effect
        glow(element, color = 'var(--prism-cyan)', options = {}) {
            const config = {
                intensity: 20,
                duration: 1.5,
                ...options
            };
            
            return gsap.to(element, {
                boxShadow: `0 0 ${config.intensity}px ${color}, 0 0 ${config.intensity * 2}px ${color}`,
                duration: config.duration,
                ease: 'sine.inOut',
                repeat: -1,
                yoyo: true
            });
        },
        
        // Single attention pulse
        attention(element) {
            return gsap.to(element, {
                scale: 1.2,
                duration: 0.2,
                ease: 'power2.out',
                yoyo: true,
                repeat: 1
            });
        },
        
        // Apply to streak fire emoji
        initStreakPulse() {
            const streakElements = document.querySelectorAll('#userStreak, #feedStreak, #statStreak');
            streakElements.forEach(el => {
                if (parseInt(el.textContent) > 0) {
                    this.breathe(el.parentElement || el, { scale: 1.05, duration: 2 });
                }
            });
        }
    },
    
    // ═══════════════════════════════════════════════════════════════════════════
    // 5. CONFETTI & FIREWORKS
    // ═══════════════════════════════════════════════════════════════════════════
    
    celebrate: {
        // Confetti burst
        confetti(options = {}) {
            const config = {
                particleCount: 100,
                spread: 70,
                origin: { x: 0.5, y: 0.6 },
                colors: ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EC4899'],
                ...options
            };
            
            const container = document.createElement('div');
            container.style.cssText = `
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                pointer-events: none;
                z-index: 99999;
                overflow: hidden;
            `;
            document.body.appendChild(container);
            
            for (let i = 0; i < config.particleCount; i++) {
                const particle = document.createElement('div');
                const color = config.colors[Math.floor(Math.random() * config.colors.length)];
                const size = Math.random() * 10 + 5;
                
                particle.style.cssText = `
                    position: absolute;
                    width: ${size}px;
                    height: ${size}px;
                    background: ${color};
                    border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
                    left: ${config.origin.x * 100}%;
                    top: ${config.origin.y * 100}%;
                `;
                container.appendChild(particle);
                
                const angle = (Math.random() * config.spread - config.spread / 2) * (Math.PI / 180) - Math.PI / 2;
                const velocity = Math.random() * 500 + 200;
                const vx = Math.cos(angle) * velocity;
                const vy = Math.sin(angle) * velocity;
                
                gsap.to(particle, {
                    x: vx,
                    y: vy + 400,
                    rotation: Math.random() * 720 - 360,
                    opacity: 0,
                    duration: Math.random() * 1.5 + 1,
                    ease: 'power2.out'
                });
            }
            
            setTimeout(() => container.remove(), 3000);
        },
        
        // Fireworks burst
        fireworks(x = window.innerWidth / 2, y = window.innerHeight / 2) {
            const container = document.createElement('div');
            container.style.cssText = `
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                pointer-events: none;
                z-index: 99999;
            `;
            document.body.appendChild(container);
            
            const colors = ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EC4899', '#F43F5E'];
            
            // Create multiple bursts
            for (let burst = 0; burst < 3; burst++) {
                setTimeout(() => {
                    const bx = x + (Math.random() - 0.5) * 200;
                    const by = y + (Math.random() - 0.5) * 100;
                    const color = colors[Math.floor(Math.random() * colors.length)];
                    
                    for (let i = 0; i < 30; i++) {
                        const particle = document.createElement('div');
                        particle.style.cssText = `
                            position: absolute;
                            width: 4px;
                            height: 4px;
                            background: ${color};
                            border-radius: 50%;
                            left: ${bx}px;
                            top: ${by}px;
                            box-shadow: 0 0 6px ${color}, 0 0 12px ${color};
                        `;
                        container.appendChild(particle);
                        
                        const angle = (i / 30) * Math.PI * 2;
                        const distance = Math.random() * 150 + 50;
                        
                        gsap.to(particle, {
                            x: Math.cos(angle) * distance,
                            y: Math.sin(angle) * distance + 50,
                            opacity: 0,
                            scale: 0,
                            duration: Math.random() * 0.8 + 0.6,
                            ease: 'power2.out'
                        });
                    }
                }, burst * 200);
            }
            
            setTimeout(() => container.remove(), 3000);
        },
        
        // PR celebration (fireworks + text)
        prCelebration(exerciseName, weight) {
            // Show fireworks
            this.fireworks();
            
            // The existing PR modal will show
            console.log(`🎆 PR Celebration: ${exerciseName} @ ${weight}lbs`);
        }
    },
    
    // ═══════════════════════════════════════════════════════════════════════════
    // 6. PARTICLE EFFECTS
    // ═══════════════════════════════════════════════════════════════════════════
    
    particles: {
        container: null,
        enabled: true,
        particles: [],
        animationFrame: null,
        
        init() {
            // Check if user prefers reduced motion
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                this.enabled = false;
                return;
            }
            
            // Create particle container
            this.container = document.createElement('div');
            this.container.id = 'macra-particles';
            this.container.style.cssText = `
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                pointer-events: none;
                z-index: 0;
                opacity: 0.4;
                overflow: hidden;
            `;
            document.body.prepend(this.container);
            
            // Create particles
            this.createParticles(30);
            this.animate();
        },
        
        createParticles(count) {
            for (let i = 0; i < count; i++) {
                const particle = document.createElement('div');
                const size = Math.random() * 3 + 1;
                
                particle.style.cssText = `
                    position: absolute;
                    width: ${size}px;
                    height: ${size}px;
                    background: rgba(139, 92, 246, ${Math.random() * 0.5 + 0.2});
                    border-radius: 50%;
                    left: ${Math.random() * 100}%;
                    top: ${Math.random() * 100}%;
                `;
                
                this.container.appendChild(particle);
                this.particles.push({
                    element: particle,
                    x: Math.random() * window.innerWidth,
                    y: Math.random() * window.innerHeight,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: (Math.random() - 0.5) * 0.5 - 0.2, // Slight upward drift
                    size: size
                });
            }
        },
        
        animate() {
            if (!this.enabled) return;
            
            this.particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                
                // Wrap around screen
                if (p.x < 0) p.x = window.innerWidth;
                if (p.x > window.innerWidth) p.x = 0;
                if (p.y < 0) p.y = window.innerHeight;
                if (p.y > window.innerHeight) p.y = 0;
                
                p.element.style.transform = `translate(${p.x}px, ${p.y}px)`;
            });
            
            this.animationFrame = requestAnimationFrame(() => this.animate());
        },
        
        toggle(show) {
            this.enabled = show;
            if (this.container) {
                this.container.style.display = show ? 'block' : 'none';
            }
            if (show && !this.animationFrame) {
                this.animate();
            }
        },
        
        destroy() {
            if (this.animationFrame) {
                cancelAnimationFrame(this.animationFrame);
            }
            if (this.container) {
                this.container.remove();
            }
            this.particles = [];
        }
    },
    
    // ═══════════════════════════════════════════════════════════════════════════
    // 7. PROGRESS BAR
    // ═══════════════════════════════════════════════════════════════════════════
    
    progressBar: {
        element: null,
        
        init() {
            // Create progress bar
            const container = document.createElement('div');
            container.id = 'macra-progress-bar';
            container.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 3px;
                background: rgba(255,255,255,0.1);
                z-index: 99998;
            `;
            
            this.element = document.createElement('div');
            this.element.style.cssText = `
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, var(--prism-violet), var(--prism-cyan));
                transition: width 0.1s ease;
            `;
            
            container.appendChild(this.element);
            document.body.appendChild(container);
            
            // Update on scroll
            window.addEventListener('scroll', () => this.update(), { passive: true });
        },
        
        update() {
            const scrollTop = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
            
            if (this.element) {
                this.element.style.width = progress + '%';
            }
        }
    },
    
    // ═══════════════════════════════════════════════════════════════════════════
    // 8. GESTURE EFFECTS (Hold to Confirm)
    // ═══════════════════════════════════════════════════════════════════════════
    
    gesture: {
        // Hold to confirm action
        holdToConfirm(element, options = {}) {
            const config = {
                duration: 1500, // ms to hold
                onComplete: () => {},
                color: 'var(--prism-violet)',
                ...options
            };
            
            const el = typeof element === 'string' ? document.querySelector(element) : element;
            if (!el) return;
            
            let holdTimer = null;
            let progressEl = null;
            
            const startHold = (e) => {
                e.preventDefault();
                
                // Create progress overlay
                progressEl = document.createElement('div');
                progressEl.style.cssText = `
                    position: absolute;
                    top: 0; left: 0;
                    height: 100%;
                    width: 0%;
                    background: ${config.color};
                    opacity: 0.3;
                    border-radius: inherit;
                    pointer-events: none;
                    transition: width ${config.duration}ms linear;
                `;
                el.style.position = 'relative';
                el.style.overflow = 'hidden';
                el.appendChild(progressEl);
                
                // Start progress
                requestAnimationFrame(() => {
                    progressEl.style.width = '100%';
                });
                
                holdTimer = setTimeout(() => {
                    config.onComplete();
                    endHold();
                    MACRA_FX.celebrate.confetti({ particleCount: 50 });
                }, config.duration);
            };
            
            const endHold = () => {
                if (holdTimer) {
                    clearTimeout(holdTimer);
                    holdTimer = null;
                }
                if (progressEl) {
                    progressEl.remove();
                    progressEl = null;
                }
            };
            
            // Mouse events
            el.addEventListener('mousedown', startHold);
            el.addEventListener('mouseup', endHold);
            el.addEventListener('mouseleave', endHold);
            
            // Touch events
            el.addEventListener('touchstart', startHold, { passive: false });
            el.addEventListener('touchend', endHold);
            el.addEventListener('touchcancel', endHold);
            
            return { destroy: () => {
                el.removeEventListener('mousedown', startHold);
                el.removeEventListener('mouseup', endHold);
                el.removeEventListener('mouseleave', endHold);
                el.removeEventListener('touchstart', startHold);
                el.removeEventListener('touchend', endHold);
                el.removeEventListener('touchcancel', endHold);
            }};
        }
    },
    
    // ═══════════════════════════════════════════════════════════════════════════
    // 9. TEXT TYPEWRITER
    // ═══════════════════════════════════════════════════════════════════════════
    
    typewriter: {
        // Type text character by character
        type(element, text, options = {}) {
            const config = {
                speed: 30, // ms per character
                cursor: true,
                onComplete: () => {},
                ...options
            };
            
            const el = typeof element === 'string' ? document.querySelector(element) : element;
            if (!el) return Promise.resolve();
            
            return new Promise((resolve) => {
                el.textContent = '';
                let i = 0;
                
                // Add cursor
                const cursor = document.createElement('span');
                cursor.className = 'typewriter-cursor';
                cursor.textContent = '|';
                cursor.style.cssText = `
                    animation: blink 0.7s infinite;
                    color: var(--prism-cyan);
                `;
                
                if (config.cursor) {
                    el.appendChild(cursor);
                }
                
                const typeChar = () => {
                    if (i < text.length) {
                        el.insertBefore(document.createTextNode(text.charAt(i)), cursor);
                        i++;
                        setTimeout(typeChar, config.speed);
                    } else {
                        if (config.cursor) {
                            setTimeout(() => cursor.remove(), 1000);
                        }
                        config.onComplete();
                        resolve();
                    }
                };
                
                typeChar();
            });
        },
        
        // Add CSS for cursor blink
        initStyles() {
            if (document.getElementById('typewriter-styles')) return;
            
            const style = document.createElement('style');
            style.id = 'typewriter-styles';
            style.textContent = `
                @keyframes blink {
                    0%, 50% { opacity: 1; }
                    51%, 100% { opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    },
    
    // ═══════════════════════════════════════════════════════════════════════════
    // UTILITY FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════
    
    utils: {
        // Debounce function
        debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },
        
        // Check if element is in viewport
        isInViewport(el) {
            const rect = el.getBoundingClientRect();
            return (
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            );
        }
    }
};

// Initialize typewriter styles
MACRA_FX.typewriter.initStyles();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => MACRA_FX.init());
} else {
    // Small delay to ensure GSAP is loaded
    setTimeout(() => MACRA_FX.init(), 100);
}

// Export for global access
window.MACRA_FX = MACRA_FX;

console.log('📦 MACRA Effects module loaded');
