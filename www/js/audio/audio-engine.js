/**
 * GlassPlayer Audio Engine
 * Web Audio API context, 5-band equalizer, bass boost, pitch/speed, frequency analyser.
 */

(function (global) {
  'use strict';

  const EQ_BANDS = [60, 230, 910, 4000, 14000];

  let audioCtx = null;
  let mediaElementSource = null;
  let isSourceConnected = false;
  let bassFilter = null;
  let eqFilters = [];
  let analyser = null;
  let bufferLength = 0;
  let dataArray = null;

  function getAudioPlayer() {
    return global.audioPlayer || (typeof document !== 'undefined' ? document.getElementById('audio-player') : null);
  }

  function syncGlobals() {
    global.audioCtx = audioCtx;
    global.bassFilter = bassFilter;
    global.eqFilters = eqFilters;
    global.analyser = analyser;
    global.bufferLength = bufferLength;
    global.dataArray = dataArray;
  }

  function isMobilePlatform() {
    if (typeof window === 'undefined') return false;
    if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) {
      return true;
    }
    if (window.innerWidth && window.innerWidth <= 768 && typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')) {
      return true;
    }
    return false;
  }

  function initAudioContext(customPlayer) {
    if (isMobilePlatform()) {
      // Mobile native / Android: use direct hardware audio rendering.
      // WebAudio createMediaElementSource in Android WebView throttles/crackles during screen-off and causes background buffer underrun.
      return null;
    }

    if (audioCtx && isSourceConnected) return audioCtx;

    const player = customPlayer || getAudioPlayer();
    if (!player) {
      console.warn('[Audio Engine] Audio element not available for Web Audio API connection');
      return null;
    }

    try {
      if (!audioCtx) {
        const AudioCtxClass = global.AudioContext || global.webkitAudioContext;
        if (!AudioCtxClass) {
          console.warn('[Audio Engine] Web Audio API is not supported in this environment');
          return null;
        }
        audioCtx = new AudioCtxClass();
      }

      if (!isSourceConnected) {
        mediaElementSource = audioCtx.createMediaElementSource(player);
        isSourceConnected = true;

        // Create lowshelf filter for Bass Boost (100 Hz, +10dB)
        bassFilter = audioCtx.createBiquadFilter();
        bassFilter.type = 'lowshelf';
        bassFilter.frequency.value = 100;
        const savedBassBoost = typeof localStorage !== 'undefined' ? localStorage.getItem('gp_effect_bassboost') === 'true' : false;
        bassFilter.gain.value = savedBassBoost ? 10 : 0;

        // Create 5-band peaking EQ filters
        eqFilters = EQ_BANDS.map((frequency) => {
          const filter = audioCtx.createBiquadFilter();
          filter.type = 'peaking';
          filter.frequency.value = frequency;
          filter.Q.value = 1;
          const savedGain = typeof localStorage !== 'undefined' ? parseFloat(localStorage.getItem(`gp_eq_${frequency}`) || '0') : 0;
          filter.gain.value = isNaN(savedGain) ? 0 : savedGain;
          return filter;
        });

        // Create Analyser for frequency visualizer and canvas effects
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        // Connect chain: Source -> Bass Boost -> EQ bands -> Analyser -> Destination
        mediaElementSource.connect(bassFilter);
        let previousNode = bassFilter;
        eqFilters.forEach((filter) => {
          previousNode.connect(filter);
          previousNode = filter;
        });
        previousNode.connect(analyser);
        analyser.connect(audioCtx.destination);

        // Sync global references for backward compatibility with existing renderer.js visualizer & controls
        syncGlobals();

        console.log('[Audio Engine] AudioContext, Bass Boost, 5-band EQ, and Analyser initialized');
      }

      return audioCtx;
    } catch (err) {
      console.error('[Audio Engine] Initialization failed:', err);
      return null;
    }
  }

  // Alias for backward compatibility
  const initAudioEffects = initAudioContext;

  function resumeAudioContext() {
    if (isMobilePlatform()) return;
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch((err) => {
        console.warn('[Audio Engine] Failed to resume AudioContext:', err.message);
      });
    }
  }

  function applyAudioEffectsState() {
    if (typeof localStorage === 'undefined') return;

    const speed = parseFloat(localStorage.getItem('gp_effect_speed') || '1.0');
    const pitchLinked = localStorage.getItem('gp_effect_pitch_linked') === 'true';
    const bassBoost = localStorage.getItem('gp_effect_bassboost') === 'true';
    const player = getAudioPlayer();

    if (player) {
      player.playbackRate = speed;
      player.defaultPlaybackRate = speed;
      player.preservesPitch = !pitchLinked;
    }

    if (bassFilter) {
      bassFilter.gain.value = bassBoost ? 10 : 0;
    }

    if (eqFilters.length) {
      EQ_BANDS.forEach((frequency, index) => {
        if (eqFilters[index]) {
          eqFilters[index].gain.value = parseFloat(localStorage.getItem(`gp_eq_${frequency}`) || '0');
        }
      });
    }
  }

  function setEqBand(bandIdentifier, gainValue) {
    let index = -1;
    let frequency = null;

    if (typeof bandIdentifier === 'number' && bandIdentifier < EQ_BANDS.length) {
      index = bandIdentifier;
      frequency = EQ_BANDS[index];
    } else {
      frequency = parseInt(bandIdentifier, 10);
      index = EQ_BANDS.indexOf(frequency);
    }

    const gain = parseFloat(gainValue) || 0;
    if (frequency && typeof localStorage !== 'undefined') {
      localStorage.setItem(`gp_eq_${frequency}`, String(gain));
    }

    initAudioContext();
    if (index >= 0 && eqFilters[index]) {
      eqFilters[index].gain.value = gain;
    }
    return gain;
  }

  function setBassBoost(enabled) {
    const isEnabled = Boolean(enabled);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('gp_effect_bassboost', String(isEnabled));
    }
    initAudioContext();
    if (bassFilter) {
      bassFilter.gain.value = isEnabled ? 10 : 0;
    }
    return isEnabled;
  }

  function setPlaybackRate(rate, pitchLinked) {
    const val = parseFloat(rate) || 1.0;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('gp_effect_speed', String(val));
      if (pitchLinked !== undefined) {
        localStorage.setItem('gp_effect_pitch_linked', String(Boolean(pitchLinked)));
      }
    }
    const isPitchLinked = typeof localStorage !== 'undefined' ? localStorage.getItem('gp_effect_pitch_linked') === 'true' : false;

    const player = getAudioPlayer();
    if (player) {
      player.playbackRate = val;
      player.defaultPlaybackRate = val;
      player.preservesPitch = !isPitchLinked;
    }
    return val;
  }

  const Audio = {
    EQ_BANDS,
    initAudioContext,
    initAudioEffects,
    resumeAudioContext,
    applyAudioEffectsState,
    setEqBand,
    setBassBoost,
    setPlaybackRate,
    getAudioContext: () => audioCtx,
    getAnalyser: () => analyser,
    getDataArray: () => dataArray,
    getBufferLength: () => bufferLength,
    getEqFilters: () => eqFilters,
    getBassFilter: () => bassFilter,
    isSourceConnected: () => isSourceConnected
  };

  // Register in namespace
  global.GP = global.GP || {};
  global.GP.Audio = Audio;

  // Double export for 100% backward compatibility
  global.initAudioContext = initAudioContext;
  global.initAudioEffects = initAudioEffects;
  global.resumeAudioContext = resumeAudioContext;
  global.applyAudioEffectsState = applyAudioEffectsState;
  global.setEqBand = setEqBand;
  global.setBassBoost = setBassBoost;
  global.setPlaybackRate = setPlaybackRate;
  global.audioCtx = audioCtx;
  global.bassFilter = bassFilter;
  global.eqFilters = eqFilters;
  global.analyser = analyser;
  global.bufferLength = bufferLength;
  global.dataArray = dataArray;

  // CommonJS export for Node.js testing
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Audio;
  }
})(typeof window !== 'undefined' ? window : globalThis);
