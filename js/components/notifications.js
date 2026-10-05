/**
 * GlassPlayer Notifications Component
 * Handles rich toast notifications and modal confirmation dialogs.
 */
(function (root) {
  'use strict';

  // Ensure window.GP.Components namespace
  const GP = root.GP = root.GP || {};
  GP.Components = GP.Components || {};
  GP.Components.Notifications = GP.Components.Notifications || {};

  function showToastNotification(message, type = 'info', title = null) {
    if (typeof document === 'undefined') return;

    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      document.body.appendChild(toastContainer);
    }
    toastContainer.removeAttribute('aria-live');
    toastContainer.removeAttribute('aria-atomic');
    toastContainer.setAttribute('role', 'region');
    toastContainer.setAttribute('aria-label', 'Уведомления');

    const typeConfigs = {
      error: {
        icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>',
        defaultTitle: 'Не получилось',
        class: 'toast-error',
        duration: 7000
      },
      success: {
        icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
        defaultTitle: 'Готово',
        class: 'toast-success',
        duration: 4000
      },
      info: {
        icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>',
        defaultTitle: 'GlassPlayer',
        class: 'toast-info',
        duration: 4000
      },
      warning: {
        icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 3.5 19h17L12 4Z"/><path d="M12 9v4M12 16h.01"/></svg>',
        defaultTitle: 'Обратите внимание',
        class: 'toast-warning',
        duration: 5500
      }
    };

    const config = typeConfigs[type] || typeConfigs.info;
    const displayTitle = title || config.defaultTitle;
    const toastKey = `${config.class}:${displayTitle}:${String(message)}`;

    const duplicate = Array.from(toastContainer.children)
      .find((item) => item.dataset && item.dataset.toastKey === toastKey);
    if (duplicate) duplicate.remove();
    while (toastContainer.children.length >= 4) {
      toastContainer.firstElementChild?.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast-notification ${config.class}`;
    toast.dataset.toastKey = toastKey;
    toast.style.setProperty('--toast-duration', `${config.duration}ms`);

    const iconBadge = document.createElement('div');
    iconBadge.className = 'toast-icon-badge';
    iconBadge.innerHTML = config.icon;

    const content = document.createElement('div');
    content.className = 'toast-content-body';
    content.setAttribute('role', type === 'error' ? 'alert' : 'status');
    content.setAttribute('aria-atomic', 'true');
    const titleElement = document.createElement('div');
    titleElement.className = 'toast-title';
    titleElement.textContent = String(displayTitle);
    const messageElement = document.createElement('div');
    messageElement.className = 'toast-message';
    messageElement.textContent = String(message);
    content.append(titleElement, messageElement);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'toast-close-btn';
    closeButton.setAttribute('aria-label', 'Закрыть уведомление');
    closeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';

    const progress = document.createElement('div');
    progress.className = 'toast-progress-bar';
    toast.append(iconBadge, content, closeButton, progress);

    toastContainer.appendChild(toast);
    let revealApplied = false;
    const revealToast = () => {
      if (revealApplied || !toast.isConnected) return;
      revealApplied = true;
      toast.classList.add('is-visible');
    };
    requestAnimationFrame(revealToast);
    setTimeout(revealToast, 40);

    let remaining = config.duration;
    let startedAt = Date.now();
    let hideTimeout = null;
    let dismissed = false;
    const pauseReasons = new Set();

    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      clearTimeout(hideTimeout);
      toast.classList.remove('is-visible');
      toast.classList.add('is-leaving');
      setTimeout(() => toast.remove(), 280);
    };
    const scheduleDismiss = () => {
      clearTimeout(hideTimeout);
      startedAt = Date.now();
      hideTimeout = setTimeout(dismiss, remaining);
    };
    const pauseDismiss = (reason) => {
      if (dismissed || pauseReasons.has(reason)) return;
      if (pauseReasons.size === 0) {
        clearTimeout(hideTimeout);
        remaining = Math.max(300, remaining - (Date.now() - startedAt));
      }
      pauseReasons.add(reason);
      toast.classList.add('is-paused');
    };
    const resumeDismiss = (reason) => {
      if (dismissed || !pauseReasons.has(reason)) return;
      pauseReasons.delete(reason);
      if (pauseReasons.size > 0) return;
      toast.classList.remove('is-paused');
      scheduleDismiss();
    };

    closeButton.addEventListener('click', dismiss);
    toast.addEventListener('mouseenter', () => pauseDismiss('hover'));
    toast.addEventListener('mouseleave', () => resumeDismiss('hover'));
    toast.addEventListener('focusin', () => pauseDismiss('focus'));
    toast.addEventListener('focusout', (event) => {
      if (!toast.contains(event.relatedTarget)) resumeDismiss('focus');
    });
    scheduleDismiss();
  }

  function showConfirmDialog({ title, message, confirmLabel = 'Подтвердить', cancelLabel = 'Отмена', danger = false }) {
    if (typeof document === 'undefined') return Promise.resolve(false);

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'gp-confirm-overlay';
      overlay.innerHTML = `
        <div class="gp-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="gp-confirm-title" aria-describedby="gp-confirm-message">
          <div class="gp-confirm-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 4 3.5 19h17L12 4Z"/><path d="M12 9v4M12 16h.01"/></svg></div>
          <div class="gp-confirm-copy"><h2 id="gp-confirm-title"></h2><p id="gp-confirm-message"></p></div>
          <div class="gp-confirm-actions">
            <button type="button" class="gp-confirm-button cancel"></button>
            <button type="button" class="gp-confirm-button confirm ${danger ? 'danger' : 'primary'}"></button>
          </div>
        </div>
      `;
      overlay.querySelector('#gp-confirm-title').textContent = title;
      overlay.querySelector('#gp-confirm-message').textContent = message;
      const cancelButton = overlay.querySelector('.gp-confirm-button.cancel');
      const confirmButton = overlay.querySelector('.gp-confirm-button.confirm');
      cancelButton.textContent = cancelLabel;
      confirmButton.textContent = confirmLabel;

      const finish = (confirmed) => {
        document.removeEventListener('keydown', handleKeydown);
        overlay.classList.remove('is-visible');
        setTimeout(() => overlay.remove(), 180);
        resolve(confirmed);
      };
      const handleKeydown = (event) => {
        if (event.key === 'Escape') finish(false);
      };
      cancelButton.addEventListener('click', () => finish(false));
      confirmButton.addEventListener('click', () => finish(true));
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) finish(false);
      });
      document.addEventListener('keydown', handleKeydown);
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('is-visible'));
      confirmButton.focus();
    });
  }

  // --- Registration & Dual Exports ---

  GP.Components.Notifications = {
    showToastNotification,
    showConfirmDialog
  };

  root.showToastNotification = showToastNotification;
  root.showConfirmDialog = showConfirmDialog;

})(typeof window !== 'undefined' ? window : global);
