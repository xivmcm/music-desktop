/**
 * GlassPlayer - Audio Visualizer (Liquid Wave inside Player Bar)
 * Namespace: window.GP.Visualizer
 * Renders dynamic bass-reactive liquid wave visualizer on HTML5 Canvas using Web Audio API analyser.
 */

(function (window) {
  'use strict';

  let visualizerAnimationId = null;
  let visualizerCanvas = null;
  let smoothBass = 0;
  let currentAmp = 0;
  let isResizeListenerAttached = false;

  function getCanvas() {
    if (!visualizerCanvas && typeof document !== 'undefined') {
      visualizerCanvas = document.getElementById('player-visualizer');
    }
    return visualizerCanvas;
  }

  function resizeCanvas() {
    const canvas = getCanvas();
    if (!canvas) return;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { width: 0, height: 0 };
    const newWidth = Math.round((rect.width || canvas.clientWidth || 0) * dpr);
    const newHeight = Math.round((rect.height || canvas.clientHeight || 0) * dpr);

    if (newWidth > 0 && newHeight > 0) {
      canvas.width = newWidth;
      canvas.height = newHeight;
    }
  }

  // Ensure window resize listener is bound once
  if (typeof window !== 'undefined' && !isResizeListenerAttached) {
    window.addEventListener('resize', resizeCanvas);
    isResizeListenerAttached = true;
  }

  function startVisualizer() {
    const canvas = getCanvas();
    if (!canvas) return;
    if (visualizerAnimationId) return;

    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('gp_visualizer') !== 'true') return;
    } catch (e) {}

    const player = (typeof window !== 'undefined' && window.audioPlayer) || (typeof document !== 'undefined' && document.getElementById('audio-player'));
    if (player && player.paused) return;

    resizeCanvas();

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let time = 0;

    function draw() {
      try {
        if (typeof localStorage !== 'undefined' && localStorage.getItem('gp_visualizer') !== 'true') {
          stopVisualizer();
          return;
        }
      } catch (e) {}

      const currentPlayer = (typeof window !== 'undefined' && window.audioPlayer) || (typeof document !== 'undefined' && document.getElementById('audio-player'));
      if (currentPlayer && currentPlayer.paused) {
        stopVisualizer();
        return;
      }

      visualizerAnimationId = requestAnimationFrame(draw);

      const width = canvas.width;
      const height = canvas.height;
      if (width === 0 || height === 0) return;

      ctx.clearRect(0, 0, width, height);

      // Web Audio API frequency spectrum resolution
      const gpAudio = typeof window !== 'undefined' && window.GP && window.GP.Audio;
      const analyserNode = (gpAudio && gpAudio.getAnalyser && gpAudio.getAnalyser()) || (typeof window !== 'undefined' && window.analyser);
      const freqData = (gpAudio && gpAudio.getDataArray && gpAudio.getDataArray()) || (typeof window !== 'undefined' && window.dataArray);
      const audioCtxNode = (gpAudio && gpAudio.getContext && gpAudio.getContext()) || (typeof window !== 'undefined' && window.audioCtx);
      const bufLength = (gpAudio && gpAudio.getBufferLength && gpAudio.getBufferLength()) || (typeof window !== 'undefined' && window.bufferLength) || (analyserNode ? analyserNode.frequencyBinCount : 0);

      // Compute sub-bass/bass value from 20Hz-120Hz bins
      let bassSum = 0;
      let bassBins = 0;

      if (analyserNode && freqData && bufLength > 0) {
        analyserNode.getByteFrequencyData(freqData);
        const nyquist = audioCtxNode ? audioCtxNode.sampleRate / 2 : 24000;
        const binHz = nyquist / bufLength;
        const startBin = Math.max(0, Math.floor(20 / binHz));
        const endBin = Math.min(bufLength - 1, Math.ceil(120 / binHz));
        for (let i = startBin; i <= endBin; i++) {
          bassSum += freqData[i];
          bassBins += 1;
        }
      }

      const avgBass = bassBins > 0 ? bassSum / bassBins : 0;
      const bassNormalized = avgBass / 255;
      smoothBass = smoothBass * 0.75 + bassNormalized * 0.25; // Faster bass smoothing
      const bassKick = bassNormalized > 0.6; // Lower threshold to capture beats more frequently

      if (typeof document !== 'undefined') {
        const playerBar = document.querySelector('.player-bar');
        if (playerBar) {
          playerBar.classList.toggle('bass-pulse', bassKick);
        }
      }

      // Determine target amplitude
      let targetAmp = 0;
      if (analyserNode) {
        const bassMultiplier = bassKick ? 2.2 : 1.0 + smoothBass * 0.8;
        targetAmp = (4 + smoothBass * height * 0.75) * bassMultiplier;
      }
      // High-responsiveness transition constants
      currentAmp = currentAmp * 0.75 + targetAmp * 0.25;

      time += 0.04;

      let accentColor = '#1db954';
      if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.documentElement) {
        const styles = window.getComputedStyle(document.documentElement);
        accentColor = styles.getPropertyValue('--accent-color').trim() || '#1db954';
      }

      // Wave 1: Underlay wave (slightly out of phase, less opaque, slower)
      if (currentAmp > 0.1) {
        const grad1 = ctx.createLinearGradient(0, 0, 0, height);
        grad1.addColorStop(0, accentColor);
        grad1.addColorStop(1, 'transparent');
        drawSingleWave(ctx, time * 0.8, currentAmp * 0.7, 1.5, width, height, grad1, accentColor, 0.15, 0.15);
      }

      // Wave 2: Foreground wave (main bass reactive wave)
      const grad2 = ctx.createLinearGradient(0, 0, 0, height);
      grad2.addColorStop(0, accentColor);
      grad2.addColorStop(1, 'transparent');
      drawSingleWave(ctx, time, currentAmp, 0, width, height, grad2, accentColor, 0.3, 0.6);
    }

    visualizerAnimationId = requestAnimationFrame(draw);
  }

  function drawSingleWave(ctx, time, amp, phaseOffset, width, height, fillGradient, strokeColor, fillOpacity, strokeOpacity) {
    if (!ctx || width <= 0 || height <= 0) return;
    const points = [];
    const N = 8;
    const segmentWidth = width / N;

    for (let i = 0; i <= N; i++) {
      const x = i * segmentWidth;
      const waveFreq = 0.5;
      const wavePhase = i * 0.45 + phaseOffset;
      let y = amp * Math.sin(time * waveFreq + wavePhase);

      // Vibrate wave points intensely on strong bass
      if (amp > 15) {
        const jitter = (Math.random() - 0.5) * (amp * 0.35);
        y += jitter;
      }

      points.push({ x, y: Math.max(1, y + amp + 1) });
    }

    // Draw fill
    ctx.beginPath();
    ctx.moveTo(0, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    ctx.lineTo(width, points[points.length - 1].y);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();

    ctx.globalAlpha = fillOpacity;
    ctx.fillStyle = fillGradient;
    ctx.fill();

    // Draw stroke
    ctx.beginPath();
    ctx.moveTo(0, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    ctx.lineTo(width, points[points.length - 1].y);

    ctx.shadowBlur = amp > 2 ? 8 : 0;
    ctx.shadowColor = strokeColor;
    ctx.globalAlpha = strokeOpacity;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Reset values
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1.0;
  }

  function stopVisualizer() {
    if (visualizerAnimationId) {
      cancelAnimationFrame(visualizerAnimationId);
      visualizerAnimationId = null;
    }
    const canvas = getCanvas();
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx && canvas.width > 0 && canvas.height > 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    if (typeof document !== 'undefined') {
      const playerBar = document.querySelector('.player-bar');
      if (playerBar) {
        playerBar.classList.remove('bass-pulse');
      }
    }
  }

  // --- Namespace & Export ---
  window.GP = window.GP || {};
  window.GP.Visualizer = {
    resizeCanvas,
    startVisualizer,
    drawSingleWave,
    stopVisualizer,
    getCanvas,
    getAnimationId: () => visualizerAnimationId,
    getSmoothBass: () => smoothBass,
    getCurrentAmp: () => currentAmp
  };

  // Backward compatibility global exports
  window.resizeCanvas = resizeCanvas;
  window.startVisualizer = startVisualizer;
  window.drawSingleWave = drawSingleWave;
  window.stopVisualizer = stopVisualizer;

  Object.defineProperty(window, 'visualizerCanvas', {
    get: () => getCanvas(),
    set: (val) => { visualizerCanvas = val; },
    configurable: true
  });

  Object.defineProperty(window, 'visualizerAnimationId', {
    get: () => visualizerAnimationId,
    set: (val) => { visualizerAnimationId = val; },
    configurable: true
  });

  Object.defineProperty(window, 'smoothBass', {
    get: () => smoothBass,
    set: (val) => { smoothBass = val; },
    configurable: true
  });

  Object.defineProperty(window, 'currentAmp', {
    get: () => currentAmp,
    set: (val) => { currentAmp = val; },
    configurable: true
  });

})(typeof window !== 'undefined' ? window : global);
