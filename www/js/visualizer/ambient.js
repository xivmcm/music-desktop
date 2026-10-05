/**
 * GlassPlayer - Ambient Background Particles & Effects Module
 * Namespace: window.GP.Ambient
 * Provides ambient particle animations on HTML5 Canvas and background visual presets.
 */

(function (window) {
  'use strict';

  let ambientCanvas = null;
  let ambientCtx = null;
  let ambientAnimationId = null;
  let ambientParticles = [];
  let isResizeListenerAttached = false;

  class Particle {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.reset();
    }

    reset() {
      this.x = Math.random() * this.width;
      this.y = Math.random() * this.height + this.height;
      if (Math.random() > 0.5) {
        this.y = Math.random() * this.height;
      }
      this.vx = (Math.random() - 0.5) * 0.4;
      this.vy = -Math.random() * 0.4 - 0.1;
      this.radius = Math.random() * 80 + 40;
      this.alpha = Math.random() * 0.05 + 0.01;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.y < -this.radius || this.x < -this.radius || this.x > this.width + this.radius) {
        this.reset();
        this.y = this.height + this.radius;
      }
    }

    draw(ctx, accentColor) {
      if (!ctx) return;
      ctx.beginPath();
      const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
      const color = accentColor || '#ffffff';
      let rgb = { r: 255, g: 255, b: 255 };
      if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(color)) {
        let c = color.substring(1).split('');
        if (c.length === 3) {
          c = [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        c = '0x' + c.join('');
        rgb = {
          r: (c >> 16) & 255,
          g: (c >> 8) & 255,
          b: c & 255
        };
      }
      grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${this.alpha})`);
      grad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
      ctx.fillStyle = grad;
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function initAmbientCanvas() {
    if (typeof document === 'undefined') return;
    ambientCanvas = document.getElementById('ambient-canvas');
    if (!ambientCanvas) return;
    ambientCtx = ambientCanvas.getContext('2d');
    resizeAmbientCanvas();
    if (!isResizeListenerAttached) {
      window.addEventListener('resize', resizeAmbientCanvas);
      isResizeListenerAttached = true;
    }
  }

  function resizeAmbientCanvas() {
    if (!ambientCanvas) {
      if (typeof document !== 'undefined') {
        ambientCanvas = document.getElementById('ambient-canvas');
      }
    }
    if (!ambientCanvas) return;
    const w = (typeof window !== 'undefined' && window.innerWidth) || 800;
    const h = (typeof window !== 'undefined' && window.innerHeight) || 600;
    if (w > 0 && h > 0) {
      ambientCanvas.width = w;
      ambientCanvas.height = h;
    }
  }

  function startAmbientParticles() {
    if (!ambientCanvas) {
      initAmbientCanvas();
    }
    if (!ambientCanvas) return;
    ambientCanvas.style.opacity = '0.8';

    stopAmbientParticles();

    ambientParticles = [];
    const numParticles = 12;
    const w = ambientCanvas.width || (window.innerWidth || 800);
    const h = ambientCanvas.height || (window.innerHeight || 600);
    for (let i = 0; i < numParticles; i++) {
      ambientParticles.push(new Particle(w, h));
    }

    function loop() {
      if (!ambientCtx) return;
      ambientCtx.clearRect(0, 0, ambientCanvas.width, ambientCanvas.height);
      let accentColor = '#ffffff';
      if (typeof document !== 'undefined' && document.documentElement) {
        accentColor = document.documentElement.style.getPropertyValue('--accent-color') || '#ffffff';
      }
      for (let p of ambientParticles) {
        p.update();
        p.draw(ambientCtx, accentColor);
      }
      ambientAnimationId = requestAnimationFrame(loop);
    }
    loop();
  }

  function stopAmbientParticles() {
    if (ambientAnimationId) {
      cancelAnimationFrame(ambientAnimationId);
      ambientAnimationId = null;
    }
    if (ambientCanvas && ambientCtx) {
      ambientCtx.clearRect(0, 0, ambientCanvas.width, ambientCanvas.height);
      ambientCanvas.style.opacity = '0';
    }
  }

  function applyBgEffect(effectName = 'none') {
    if (typeof document === 'undefined') return;
    let layer = document.getElementById('bg-effect-layer');
    if (!layer && document.body) {
      layer = document.createElement('div');
      layer.id = 'bg-effect-layer';
      layer.className = 'bg-effect-layer';
      document.body.prepend(layer);
    }

    if (layer) {
      layer.className = 'bg-effect-layer';
    }
    stopAmbientParticles();

    if (effectName === 'aurora') {
      if (layer) layer.classList.add('effect-aurora');
    } else if (effectName === 'liquid') {
      if (layer) layer.classList.add('effect-liquid');
    } else if (effectName === 'particles') {
      if (layer) layer.classList.add('effect-particles');
      startAmbientParticles();
    }
    try {
      localStorage.setItem('gp_bg_effect', effectName);
    } catch (e) {}
  }

  // --- Namespace & Export ---
  window.GP = window.GP || {};
  window.GP.Ambient = {
    Particle,
    initAmbientCanvas,
    resizeAmbientCanvas,
    startAmbientParticles,
    stopAmbientParticles,
    applyBgEffect,
    getCanvas: () => ambientCanvas,
    getContext: () => ambientCtx,
    getParticles: () => ambientParticles,
    getAnimationId: () => ambientAnimationId
  };

  // Backward compatibility global exports
  window.Particle = Particle;
  window.initAmbientCanvas = initAmbientCanvas;
  window.resizeAmbientCanvas = resizeAmbientCanvas;
  window.startAmbientParticles = startAmbientParticles;
  window.stopAmbientParticles = stopAmbientParticles;
  window.applyBgEffect = applyBgEffect;

  Object.defineProperty(window, 'ambientCanvas', {
    get: () => ambientCanvas,
    set: (val) => { ambientCanvas = val; },
    configurable: true
  });

  Object.defineProperty(window, 'ambientCtx', {
    get: () => ambientCtx,
    set: (val) => { ambientCtx = val; },
    configurable: true
  });

  Object.defineProperty(window, 'ambientAnimationId', {
    get: () => ambientAnimationId,
    set: (val) => { ambientAnimationId = val; },
    configurable: true
  });

  Object.defineProperty(window, 'ambientParticles', {
    get: () => ambientParticles,
    set: (val) => { ambientParticles = val; },
    configurable: true
  });

})(typeof window !== 'undefined' ? window : global);
