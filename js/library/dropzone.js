/**
 * GlassPlayer - Drag & Drop Audio Upload & File Ingestion Module
 * Namespace: window.GP.Dropzone
 * Handles dragover, dragleave, drop overlays and file routing into local library.
 */

(function (window) {
  'use strict';

  let isDropzoneInitialized = false;

  function initDropzone() {
    if (isDropzoneInitialized || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    // Dragover listener
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      const overlay = document.getElementById('drop-overlay');
      if (overlay) overlay.classList.remove('hidden');
    });

    // Dragleave listener
    window.addEventListener('dragleave', (e) => {
      if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
        const overlay = document.getElementById('drop-overlay');
        if (overlay) overlay.classList.add('hidden');
      }
    });

    // Drop listener
    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      const overlay = document.getElementById('drop-overlay');
      if (overlay) overlay.classList.add('hidden');

      const rawFiles = e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
      await handleDropFiles(rawFiles);
    });

    // Prevent native drag-and-drop of track covers / images inside the app
    document.addEventListener('dragstart', (e) => {
      const target = e.target;
      if (
        (typeof HTMLImageElement !== 'undefined' && target instanceof HTMLImageElement) ||
        target?.closest?.('.track-cover-container, .card-cover, .mini-cover, #current-cover')
      ) {
        e.preventDefault();
      }
    }, true);

    isDropzoneInitialized = true;
  }

  async function handleDropFiles(fileList) {
    const files = Array.from(fileList || []).filter(f =>
      f && f.name && (f.name.toLowerCase().endsWith('.mp3') || (f.type && f.type.startsWith('audio/')))
    );

    const toast = typeof window !== 'undefined' && window.showToastNotification;

    if (files.length === 0) {
      if (typeof toast === 'function') {
        toast('Перетащите файлы формата .mp3', 'warning');
      }
      return;
    }

    if (typeof toast === 'function') {
      toast(`Обрабатываем файлов: ${files.length}`, 'info', 'Медиатека');
    }

    const importFn = (window.GP && window.GP.LocalDB && window.GP.LocalDB.importLocalAudioFiles) ||
      (typeof window !== 'undefined' && window.importLocalAudioFiles);

    if (typeof importFn === 'function') {
      await importFn(files);
    }

    if (typeof window !== 'undefined' && window.activeView === 'library' && typeof window.loadFavorites === 'function') {
      window.loadFavorites('local');
    }
  }

  // --- Namespace & Export ---
  window.GP = window.GP || {};
  window.GP.Dropzone = {
    initDropzone,
    handleDropFiles,
    isInitialized: () => isDropzoneInitialized
  };

  // Backward compatibility global exports
  window.initDropzone = initDropzone;
  window.handleDropFiles = handleDropFiles;

  // Auto-initialize when DOM is ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initDropzone);
    } else {
      initDropzone();
    }
  }

})(typeof window !== 'undefined' ? window : global);
