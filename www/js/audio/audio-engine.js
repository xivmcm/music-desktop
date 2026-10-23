/**
 * GlassPlayer Audio Engine 2.0
 * Web Audio API context, Pro Bass Boost (Sub/Punch + Soft Saturation),
 * 5-band equalizer, Studio Reverb (Convolver), 8D Spatial Panner,
 * Studio Dynamics Compressor (Audio Normalization), One-Click Presets,
 * and OfflineAudioContext Remix Exporter.
 */

(function (global) {
  'use strict';

  const EQ_BANDS = [60, 230, 910, 4000, 14000];

  const STUDIO_PRESETS = {
    original: {
      id: 'original',
      label: 'Оригинал',
      subtitle: 'Чистый студийный звук',
      badge: 'FLAT',
      speed: 1.0,
      pitchLinked: false,
      bassBoost: false,
      bassGain: 10,
      bassMode: 'punch',
      reverb: 0,
      spatial8D: false,
      normalization: false,
      eq: [0, 0, 0, 0, 0]
    },
    slowed_reverb: {
      id: 'slowed_reverb',
      label: 'Slowed + Reverb',
      subtitle: '0.85x + атмосферный холл',
      badge: 'REMIX',
      speed: 0.85,
      pitchLinked: true,
      bassBoost: true,
      bassGain: 7,
      bassMode: 'sub',
      reverb: 42,
      spatial8D: false,
      normalization: true,
      eq: [3, 2, 0, -2, -3]
    },
    nightcore: {
      id: 'nightcore',
      label: 'Nightcore',
      subtitle: '1.25x + высокий питч и драйв',
      badge: '1.25X',
      speed: 1.25,
      pitchLinked: true,
      bassBoost: true,
      bassGain: 6,
      bassMode: 'punch',
      reverb: 12,
      spatial8D: false,
      normalization: true,
      eq: [4, 0, 1, 3, 5]
    },
    bass_808: {
      id: 'bass_808',
      label: '808 Bass Slam',
      subtitle: 'Глубокий саб 55Hz + сатурация',
      badge: '808 SUB',
      speed: 1.0,
      pitchLinked: false,
      bassBoost: true,
      bassGain: 14,
      bassMode: 'sub',
      reverb: 0,
      spatial8D: false,
      normalization: true,
      eq: [8, 4, -1, 1, 2]
    },
    lofi: {
      id: 'lofi',
      label: 'Lo-Fi Tape',
      subtitle: 'Теплая кассета 0.95x',
      badge: 'VINTAGE',
      speed: 0.95,
      pitchLinked: true,
      bassBoost: true,
      bassGain: 5,
      bassMode: 'punch',
      reverb: 24,
      spatial8D: false,
      normalization: true,
      eq: [-3, 3, 4, -5, -9]
    },
    spatial_8d: {
      id: 'spatial_8d',
      label: '8D Spatial',
      subtitle: 'Панорама 360° для наушников',
      badge: '360°',
      speed: 1.0,
      pitchLinked: false,
      bassBoost: true,
      bassGain: 6,
      bassMode: 'sub',
      reverb: 28,
      spatial8D: true,
      normalization: true,
      eq: [3, 1, 0, 2, 4]
    }
  };

  let audioCtx = null;
  let mediaElementSource = null;
  let isSourceConnected = false;
  let subBassFilter = null;
  let bassFilter = null;
  let softClipper = null;
  let eqFilters = [];
  let dryGainNode = null;
  let wetGainNode = null;
  let reverbConvolver = null;
  let reverbDampingFilter = null;
  let spatialPanner = null;
  let spatialLfo = null;
  let spatialLfoGain = null;
  let compressorNode = null;
  let makeupGainNode = null;
  let analyser = null;
  let bufferLength = 0;
  let dataArray = null;

  function getAudioPlayer() {
    return global.audioPlayer || (typeof document !== 'undefined' ? document.getElementById('audio-player') : null);
  }

  function syncGlobals() {
    global.audioCtx = audioCtx;
    global.bassFilter = bassFilter;
    global.subBassFilter = subBassFilter;
    global.compressorNode = compressorNode;
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

  /**
   * Builds a smooth analog-style soft clipping saturation curve (tanh)
   * Prevents harsh digital clipping when heavy Bass Boost or EQ is applied.
   */
  function createSoftClipCurve(driveAmount = 1.15) {
    const samples = 8192;
    const curve = new Float32Array(samples);
    const k = Math.max(1.0, driveAmount);
    const norm = Math.tanh(k);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(k * x) / norm;
    }
    return curve;
  }

  /**
   * Generates a lush stereo studio hall impulse response buffer for Slowed + Reverb.
   */
  function createReverbImpulseBuffer(ctx, durationSec = 2.4, decayRate = 2.8) {
    if (!ctx || typeof ctx.createBuffer !== 'function') return null;
    try {
      const sampleRate = ctx.sampleRate || 44100;
      const length = Math.floor(sampleRate * durationSec);
      const impulse = ctx.createBuffer(2, length, sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const channelData = impulse.getChannelData(ch);
        for (let i = 0; i < length; i++) {
          const t = i / length;
          // Early reflections + smooth exponential lush tail
          const envelope = Math.pow(1 - t, decayRate) * (i < sampleRate * 0.015 ? (i / (sampleRate * 0.015)) : 1);
          channelData[i] = (Math.random() * 2 - 1) * envelope * 0.65;
        }
      }
      return impulse;
    } catch (e) {
      return null;
    }
  }

  function getSavedBassGain() {
    if (typeof localStorage === 'undefined') return 10;
    const raw = localStorage.getItem('gp_effect_bass_gain');
    if (raw !== null && raw !== '') {
      const parsed = parseFloat(raw);
      if (!isNaN(parsed)) return Math.max(0, Math.min(18, parsed));
    }
    return 10;
  }

  function getSavedBassMode() {
    if (typeof localStorage === 'undefined') return 'punch';
    return localStorage.getItem('gp_effect_bass_mode') === 'sub' ? 'sub' : 'punch';
  }

  function getSavedReverbMix() {
    if (typeof localStorage === 'undefined') return 0;
    const raw = parseFloat(localStorage.getItem('gp_effect_reverb') || '0');
    return isNaN(raw) ? 0 : Math.max(0, Math.min(100, raw));
  }

  function updateBassNodesState() {
    if (!bassFilter) return;
    const enabled = typeof localStorage !== 'undefined' ? localStorage.getItem('gp_effect_bassboost') === 'true' : false;
    const gainDb = getSavedBassGain();
    const mode = getSavedBassMode();

    bassFilter.frequency.value = mode === 'sub' ? 65 : 100;
    bassFilter.gain.value = enabled ? gainDb : 0;

    if (subBassFilter) {
      subBassFilter.frequency.value = mode === 'sub' ? 50 : 60;
      subBassFilter.Q.value = mode === 'sub' ? 1.15 : 0.8;
      // Add deep sub harmonic punch proportional to bass gain
      subBassFilter.gain.value = enabled ? (mode === 'sub' ? gainDb * 0.45 : gainDb * 0.2) : 0;
    }

    if (softClipper) {
      const activeGain = enabled ? gainDb : 0;
      const drive = activeGain > 4 ? 1.0 + (activeGain / 18) * 0.65 : 1.02;
      softClipper.curve = createSoftClipCurve(drive);
    }
  }

  function updateNormalizationNodesState() {
    if (!compressorNode) return;
    const normEnabled = typeof localStorage !== 'undefined' && localStorage.getItem('gp_effect_normalization') === 'true';
    const bassEnabled = typeof localStorage !== 'undefined' && localStorage.getItem('gp_effect_bassboost') === 'true';
    const bassGain = getSavedBassGain();

    if (normEnabled) {
      // Studio loudness normalization & dynamics leveling
      if (compressorNode.threshold) compressorNode.threshold.value = -24;
      if (compressorNode.knee) compressorNode.knee.value = 28;
      if (compressorNode.ratio) compressorNode.ratio.value = 9;
      if (compressorNode.attack) compressorNode.attack.value = 0.004;
      if (compressorNode.release) compressorNode.release.value = 0.22;
      if (makeupGainNode && makeupGainNode.gain) {
        // Automatic compensation so bass doesn't clip and quiet tracks get lifted
        const bassHeadroom = bassEnabled && bassGain > 8 ? -((bassGain - 8) * 0.025) : 0;
        makeupGainNode.gain.value = Math.max(0.88, 1.22 + bassHeadroom);
      }
    } else if (bassEnabled && bassGain >= 8) {
      // Transparent safety brickwall limiter when heavy bass boost is active without full normalization
      if (compressorNode.threshold) compressorNode.threshold.value = -4;
      if (compressorNode.knee) compressorNode.knee.value = 8;
      if (compressorNode.ratio) compressorNode.ratio.value = 12;
      if (compressorNode.attack) compressorNode.attack.value = 0.002;
      if (compressorNode.release) compressorNode.release.value = 0.15;
      if (makeupGainNode && makeupGainNode.gain) {
        makeupGainNode.gain.value = 0.96;
      }
    } else {
      // Bypass / neutral
      if (compressorNode.threshold) compressorNode.threshold.value = 0;
      if (compressorNode.knee) compressorNode.knee.value = 0;
      if (compressorNode.ratio) compressorNode.ratio.value = 1;
      if (compressorNode.attack) compressorNode.attack.value = 0.003;
      if (compressorNode.release) compressorNode.release.value = 0.25;
      if (makeupGainNode && makeupGainNode.gain) {
        makeupGainNode.gain.value = 1.0;
      }
    }
  }

  function updateReverbNodesState() {
    if (!dryGainNode || !wetGainNode) return;
    const mixPercent = getSavedReverbMix();
    const wetNorm = mixPercent / 100;
    // Equal-power dry/wet blend so volume stays natural
    wetGainNode.gain.value = wetNorm * 0.85;
    dryGainNode.gain.value = Math.max(0.55, 1.0 - wetNorm * 0.32);
  }

  function updateSpatial8DState() {
    if (!spatialPanner) return;
    const enabled = typeof localStorage !== 'undefined' && localStorage.getItem('gp_effect_8d') === 'true';
    if (spatialLfoGain && spatialLfoGain.gain) {
      spatialLfoGain.gain.value = enabled ? 0.78 : 0;
    }
    if (!enabled && spatialPanner.pan) {
      spatialPanner.pan.value = 0;
    }
  }

  function initAudioContext(customPlayer) {
    if (isMobilePlatform()) {
      // Mobile native / Android: use direct hardware audio rendering.
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

        // 1. Sub-Bass Harmonic Peaking Filter (50-60 Hz)
        subBassFilter = audioCtx.createBiquadFilter();
        subBassFilter.type = 'peaking';
        subBassFilter.frequency.value = 55;
        subBassFilter.Q.value = 1.0;
        subBassFilter.gain.value = 0;

        // 2. Main Lowshelf Filter for Bass Boost (65 Hz Sub / 100 Hz Punch, 0..18 dB)
        bassFilter = audioCtx.createBiquadFilter();
        bassFilter.type = 'lowshelf';
        bassFilter.frequency.value = 100;
        const savedBassBoost = typeof localStorage !== 'undefined' ? localStorage.getItem('gp_effect_bassboost') === 'true' : false;
        bassFilter.gain.value = savedBassBoost ? getSavedBassGain() : 0;

        // 3. Soft Clipper / Analog Saturation Node
        if (typeof audioCtx.createWaveShaper === 'function') {
          softClipper = audioCtx.createWaveShaper();
          softClipper.curve = createSoftClipCurve(1.05);
          softClipper.oversample = '2x';
        }

        updateBassNodesState();

        // 4. Create 5-band peaking EQ filters
        eqFilters = EQ_BANDS.map((frequency) => {
          const filter = audioCtx.createBiquadFilter();
          filter.type = 'peaking';
          filter.frequency.value = frequency;
          filter.Q.value = 1;
          const savedGain = typeof localStorage !== 'undefined' ? parseFloat(localStorage.getItem(`gp_eq_${frequency}`) || '0') : 0;
          filter.gain.value = isNaN(savedGain) ? 0 : savedGain;
          return filter;
        });

        // 5. Studio Reverb (Dry/Wet Convolver with warm high-damping)
        if (typeof audioCtx.createConvolver === 'function' && typeof audioCtx.createGain === 'function') {
          dryGainNode = audioCtx.createGain();
          wetGainNode = audioCtx.createGain();
          reverbConvolver = audioCtx.createConvolver();
          const impulse = createReverbImpulseBuffer(audioCtx, 2.4, 2.8);
          if (impulse) reverbConvolver.buffer = impulse;
          reverbDampingFilter = audioCtx.createBiquadFilter();
          reverbDampingFilter.type = 'lowpass';
          reverbDampingFilter.frequency.value = 3400;
          updateReverbNodesState();
        }

        // 6. 8D Spatial Panner with slow LFO oscillator
        if (typeof audioCtx.createStereoPanner === 'function') {
          spatialPanner = audioCtx.createStereoPanner();
          if (typeof audioCtx.createOscillator === 'function' && typeof audioCtx.createGain === 'function') {
            try {
              spatialLfo = audioCtx.createOscillator();
              spatialLfoGain = audioCtx.createGain();
              spatialLfo.type = 'sine';
              spatialLfo.frequency.value = 0.12; // ~8.3 seconds per full 360 rotation
              spatialLfoGain.gain.value = 0;
              spatialLfo.connect(spatialLfoGain);
              if (spatialPanner.pan) {
                spatialLfoGain.connect(spatialPanner.pan);
              }
              if (typeof spatialLfo.start === 'function') {
                spatialLfo.start();
              }
            } catch (e) {
              // Ignore if LFO connect fails in mock environment
            }
          }
          updateSpatial8DState();
        }

        // 7. Dynamics Compressor & Makeup Gain for Audio Normalization & Peak Limiting
        if (typeof audioCtx.createDynamicsCompressor === 'function') {
          compressorNode = audioCtx.createDynamicsCompressor();
          if (typeof audioCtx.createGain === 'function') {
            makeupGainNode = audioCtx.createGain();
          }
          updateNormalizationNodesState();
        }

        // 8. Create Analyser for frequency visualizer and canvas effects
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        // Connect chain:
        // Source -> subBass -> bassFilter -> [softClipper] -> EQ bands -> [Dry/Wet Reverb] -> [8D Panner] -> [Compressor -> Makeup] -> Analyser -> Destination
        mediaElementSource.connect(subBassFilter);
        subBassFilter.connect(bassFilter);

        let previousNode = bassFilter;
        if (softClipper) {
          previousNode.connect(softClipper);
          previousNode = softClipper;
        }

        eqFilters.forEach((filter) => {
          previousNode.connect(filter);
          previousNode = filter;
        });

        let postFxNode = previousNode;
        if (dryGainNode && wetGainNode && reverbConvolver && reverbDampingFilter && typeof audioCtx.createGain === 'function') {
          const reverbMerge = audioCtx.createGain();
          previousNode.connect(dryGainNode);
          dryGainNode.connect(reverbMerge);

          previousNode.connect(reverbConvolver);
          reverbConvolver.connect(reverbDampingFilter);
          reverbDampingFilter.connect(wetGainNode);
          wetGainNode.connect(reverbMerge);

          postFxNode = reverbMerge;
        }

        if (spatialPanner) {
          postFxNode.connect(spatialPanner);
          postFxNode = spatialPanner;
        }

        if (compressorNode) {
          postFxNode.connect(compressorNode);
          postFxNode = compressorNode;
          if (makeupGainNode) {
            postFxNode.connect(makeupGainNode);
            postFxNode = makeupGainNode;
          }
        }

        postFxNode.connect(analyser);
        analyser.connect(audioCtx.destination);

        // Sync global references for backward compatibility with existing renderer.js visualizer & controls
        syncGlobals();

        console.log('[Audio Engine] AudioContext 2.0 (Pro Bass Boost, 5-band EQ, Reverb, 8D, Normalization, Analyser) initialized');
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
    const player = getAudioPlayer();

    if (player) {
      player.playbackRate = speed;
      player.defaultPlaybackRate = speed;
      player.preservesPitch = !pitchLinked;
    }

    updateBassNodesState();
    updateReverbNodesState();
    updateSpatial8DState();
    updateNormalizationNodesState();

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

  function setBassBoost(enabled, customGainDb) {
    const isEnabled = Boolean(enabled);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('gp_effect_bassboost', String(isEnabled));
      if (customGainDb !== undefined && !isNaN(parseFloat(customGainDb))) {
        const clamped = Math.max(0, Math.min(18, parseFloat(customGainDb)));
        localStorage.setItem('gp_effect_bass_gain', String(clamped));
      }
    }
    initAudioContext();
    updateBassNodesState();
    updateNormalizationNodesState();
    return isEnabled;
  }

  function setBassBoostGain(gainDb) {
    const val = Math.max(0, Math.min(18, parseFloat(gainDb) || 0));
    const isEnabled = val > 0;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('gp_effect_bass_gain', String(val));
      localStorage.setItem('gp_effect_bassboost', String(isEnabled));
    }
    initAudioContext();
    updateBassNodesState();
    updateNormalizationNodesState();
    return val;
  }

  function setBassBoostMode(mode) {
    const normalized = mode === 'sub' ? 'sub' : 'punch';
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('gp_effect_bass_mode', normalized);
    }
    initAudioContext();
    updateBassNodesState();
    return normalized;
  }

  function setNormalization(enabled) {
    const isEnabled = Boolean(enabled);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('gp_effect_normalization', String(isEnabled));
    }
    initAudioContext();
    updateNormalizationNodesState();
    return isEnabled;
  }

  function setReverbMix(mixPercent) {
    const val = Math.max(0, Math.min(100, parseFloat(mixPercent) || 0));
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('gp_effect_reverb', String(val));
    }
    initAudioContext();
    updateReverbNodesState();
    return val;
  }

  function setSpatial8D(enabled) {
    const isEnabled = Boolean(enabled);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('gp_effect_8d', String(isEnabled));
    }
    initAudioContext();
    updateSpatial8DState();
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

  function applyStudioPreset(presetId) {
    const preset = STUDIO_PRESETS[presetId];
    if (!preset) return null;

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('gp_effect_preset', preset.id);
      localStorage.setItem('gp_effect_speed', String(preset.speed));
      localStorage.setItem('gp_effect_pitch_linked', String(preset.pitchLinked));
      localStorage.setItem('gp_effect_bassboost', String(preset.bassBoost));
      localStorage.setItem('gp_effect_bass_gain', String(preset.bassGain));
      localStorage.setItem('gp_effect_bass_mode', preset.bassMode);
      localStorage.setItem('gp_effect_reverb', String(preset.reverb));
      localStorage.setItem('gp_effect_8d', String(preset.spatial8D));
      localStorage.setItem('gp_effect_normalization', String(preset.normalization));
      EQ_BANDS.forEach((freq, i) => {
        localStorage.setItem(`gp_eq_${freq}`, String(preset.eq[i] || 0));
      });
    }

    initAudioContext();
    applyAudioEffectsState();
    return preset;
  }

  function getActiveEffectsState() {
    if (typeof localStorage === 'undefined') {
      return {
        preset: 'original',
        speed: 1.0,
        pitchLinked: false,
        bassBoost: false,
        bassGain: 10,
        bassMode: 'punch',
        reverb: 0,
        spatial8D: false,
        normalization: false,
        eq: [0, 0, 0, 0, 0]
      };
    }
    return {
      preset: localStorage.getItem('gp_effect_preset') || 'original',
      speed: parseFloat(localStorage.getItem('gp_effect_speed') || '1.0') || 1.0,
      pitchLinked: localStorage.getItem('gp_effect_pitch_linked') === 'true',
      bassBoost: localStorage.getItem('gp_effect_bassboost') === 'true',
      bassGain: getSavedBassGain(),
      bassMode: getSavedBassMode(),
      reverb: getSavedReverbMix(),
      spatial8D: localStorage.getItem('gp_effect_8d') === 'true',
      normalization: localStorage.getItem('gp_effect_normalization') === 'true',
      eq: EQ_BANDS.map((freq) => parseFloat(localStorage.getItem(`gp_eq_${freq}`) || '0') || 0)
    };
  }

  function hasActiveAudioEffects() {
    const state = getActiveEffectsState();
    if (Math.abs(state.speed - 1.0) > 0.01) return true;
    if (state.bassBoost && state.bassGain > 0) return true;
    if (state.reverb > 0) return true;
    if (state.spatial8D) return true;
    if (state.normalization) return true;
    if (state.eq.some((v) => Math.abs(v) > 0.1)) return true;
    return false;
  }

  function getActiveEffectsSummary() {
    const state = getActiveEffectsState();
    const parts = [];
    let tag = 'Studio Remix';

    if (state.preset && STUDIO_PRESETS[state.preset] && state.preset !== 'original') {
      tag = STUDIO_PRESETS[state.preset].label;
    } else if (state.speed < 0.95 && state.reverb >= 15) {
      tag = 'Slowed + Reverb';
    } else if (state.speed > 1.1 && state.pitchLinked) {
      tag = 'Nightcore';
    } else if (state.bassBoost && state.bassGain >= 8) {
      tag = 'Bass Boosted';
    } else if (state.spatial8D) {
      tag = '8D Audio';
    }

    if (Math.abs(state.speed - 1.0) > 0.01) {
      parts.push(`${state.speed.toFixed(2)}x${state.pitchLinked ? ' Pitch' : ''}`);
    }
    if (state.bassBoost && state.bassGain > 0) {
      parts.push(`Bass +${state.bassGain}dB (${state.bassMode === 'sub' ? '55Hz Sub' : '100Hz'})`);
    }
    if (state.reverb > 0) {
      parts.push(`Reverb ${Math.round(state.reverb)}%`);
    }
    if (state.spatial8D) {
      parts.push('8D 360°');
    }
    if (state.normalization) {
      parts.push('Нормализация');
    }
    if (state.eq.some((v) => Math.abs(v) > 0.1)) {
      parts.push('Custom EQ');
    }

    return {
      active: parts.length > 0,
      tag,
      description: parts.length > 0 ? parts.join(' • ') : 'Без активных эффектов (Оригинал)'
    };
  }

  /**
   * Encodes an AudioBuffer into a 16-bit PCM Stereo WAV Blob
   */
  function encodeAudioBufferToWav(audioBuffer) {
    const numChannels = Math.min(2, audioBuffer.numberOfChannels || 2);
    const sampleRate = audioBuffer.sampleRate || 44100;
    const length = audioBuffer.length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    function writeString(offset, str) {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    }

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true);  // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); // 16-bit
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) {
      channels.push(audioBuffer.getChannelData(ch));
    }

    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        let sample = channels[ch][i];
        sample = Math.max(-1, Math.min(1, sample));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * Renders an audio ArrayBuffer through the active Studio FX graph using OfflineAudioContext.
   * Allows users to download tracks with Slowed+Reverb, Bass Boost, Nightcore, EQ, etc.
   */
  async function renderTrackWithEffects(inputArrayBuffer, overrideState = null) {
    const AudioCtxClass = global.AudioContext || global.webkitAudioContext;
    const OfflineCtxClass = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    if (!AudioCtxClass || !OfflineCtxClass) {
      throw new Error('OfflineAudioContext не поддерживается в данном окружении');
    }

    const state = overrideState ? { ...getActiveEffectsState(), ...overrideState } : getActiveEffectsState();
    const decodeCtx = audioCtx || new AudioCtxClass();
    const clonedBuffer = inputArrayBuffer.slice(0);
    const decoded = await decodeCtx.decodeAudioData(clonedBuffer);

    const speed = Math.max(0.5, Math.min(2.0, state.speed || 1.0));
    const sampleRate = decoded.sampleRate || 44100;
    const reverbTailFrames = state.reverb > 0 ? Math.ceil(sampleRate * 1.6) : 0;
    const totalFrames = Math.ceil(decoded.length / speed) + reverbTailFrames;
    const numChannels = Math.max(2, Math.min(2, decoded.numberOfChannels || 2));

    const offlineCtx = new OfflineCtxClass(numChannels, totalFrames, sampleRate);

    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    source.playbackRate.value = speed;

    // 1. Sub-Bass + Main Bass Boost
    const offSubBass = offlineCtx.createBiquadFilter();
    offSubBass.type = 'peaking';
    offSubBass.frequency.value = state.bassMode === 'sub' ? 50 : 60;
    offSubBass.Q.value = state.bassMode === 'sub' ? 1.15 : 0.8;
    offSubBass.gain.value = state.bassBoost ? (state.bassMode === 'sub' ? state.bassGain * 0.45 : state.bassGain * 0.2) : 0;

    const offBass = offlineCtx.createBiquadFilter();
    offBass.type = 'lowshelf';
    offBass.frequency.value = state.bassMode === 'sub' ? 65 : 100;
    offBass.gain.value = state.bassBoost ? state.bassGain : 0;

    const offClipper = offlineCtx.createWaveShaper();
    const activeGain = state.bassBoost ? state.bassGain : 0;
    offClipper.curve = createSoftClipCurve(activeGain > 4 ? 1.0 + (activeGain / 18) * 0.65 : 1.02);
    offClipper.oversample = '2x';

    // 2. 5-Band EQ
    const offEqs = EQ_BANDS.map((freq, idx) => {
      const f = offlineCtx.createBiquadFilter();
      f.type = 'peaking';
      f.frequency.value = freq;
      f.Q.value = 1;
      f.gain.value = state.eq[idx] || 0;
      return f;
    });

    source.connect(offSubBass);
    offSubBass.connect(offBass);
    offBass.connect(offClipper);

    let prev = offClipper;
    offEqs.forEach((f) => {
      prev.connect(f);
      prev = f;
    });

    // 3. Reverb (Dry/Wet)
    let postReverb = prev;
    if (state.reverb > 0) {
      const merge = offlineCtx.createGain();
      const dry = offlineCtx.createGain();
      const wet = offlineCtx.createGain();
      const conv = offlineCtx.createConvolver();
      const damp = offlineCtx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 3400;

      const impulse = createReverbImpulseBuffer(offlineCtx, 2.4, 2.8);
      if (impulse) conv.buffer = impulse;

      const wetNorm = Math.max(0, Math.min(100, state.reverb)) / 100;
      wet.gain.value = wetNorm * 0.85;
      dry.gain.value = Math.max(0.55, 1.0 - wetNorm * 0.32);

      prev.connect(dry);
      dry.connect(merge);
      prev.connect(conv);
      conv.connect(damp);
      damp.connect(wet);
      wet.connect(merge);
      postReverb = merge;
    }

    // 4. 8D Spatial Panning
    let postSpatial = postReverb;
    if (state.spatial8D && typeof offlineCtx.createStereoPanner === 'function') {
      const panner = offlineCtx.createStereoPanner();
      const lfo = offlineCtx.createOscillator();
      const lfoGain = offlineCtx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.12;
      lfoGain.gain.value = 0.78;
      lfo.connect(lfoGain);
      lfoGain.connect(panner.pan);
      lfo.start(0);
      postReverb.connect(panner);
      postSpatial = panner;
    }

    // 5. Studio Compressor / Safety Limiter
    const comp = offlineCtx.createDynamicsCompressor();
    const makeup = offlineCtx.createGain();
    if (state.normalization) {
      comp.threshold.value = -24;
      comp.knee.value = 28;
      comp.ratio.value = 9;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;
      const bassHeadroom = state.bassBoost && state.bassGain > 8 ? -((state.bassGain - 8) * 0.025) : 0;
      makeup.gain.value = Math.max(0.88, 1.18 + bassHeadroom);
    } else {
      comp.threshold.value = -3;
      comp.knee.value = 6;
      comp.ratio.value = 12;
      comp.attack.value = 0.002;
      comp.release.value = 0.15;
      makeup.gain.value = 0.96;
    }

    postSpatial.connect(comp);
    comp.connect(makeup);
    makeup.connect(offlineCtx.destination);

    source.start(0);
    const renderedBuffer = await offlineCtx.startRendering();
    const wavBlob = encodeAudioBufferToWav(renderedBuffer);
    const summary = getActiveEffectsSummary();

    return {
      blob: wavBlob,
      extension: 'wav',
      mimeType: 'audio/wav',
      tag: summary.tag,
      description: summary.description
    };
  }

  const Audio = {
    EQ_BANDS,
    STUDIO_PRESETS,
    initAudioContext,
    initAudioEffects,
    resumeAudioContext,
    applyAudioEffectsState,
    setEqBand,
    setBassBoost,
    setBassBoostGain,
    setBassBoostMode,
    setNormalization,
    setReverbMix,
    setSpatial8D,
    setPlaybackRate,
    applyStudioPreset,
    getActiveEffectsState,
    hasActiveAudioEffects,
    getActiveEffectsSummary,
    renderTrackWithEffects,
    encodeAudioBufferToWav,
    getAudioContext: () => audioCtx,
    getAnalyser: () => analyser,
    getDataArray: () => dataArray,
    getBufferLength: () => bufferLength,
    getEqFilters: () => eqFilters,
    getBassFilter: () => bassFilter,
    getSubBassFilter: () => subBassFilter,
    getCompressorNode: () => compressorNode,
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
  global.setBassBoostGain = setBassBoostGain;
  global.setBassBoostMode = setBassBoostMode;
  global.setNormalization = setNormalization;
  global.setReverbMix = setReverbMix;
  global.setSpatial8D = setSpatial8D;
  global.setPlaybackRate = setPlaybackRate;
  global.applyStudioPreset = applyStudioPreset;
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
