/**
 * GlassPlayer Changelog & Release Notes Component
 * Compact, glassmorphic modal with version history, theme styling, and zero emojis.
 */
(function(window) {
  'use strict';

  const CHANGELOG_REGISTRY = [
    {
      version: '1.20.13',
      tag: 'v1.20.13',
      date: '24 октября 2026',
      title: 'Что нового в GlassPlayer',
      subtitle: 'Studio Audio Remixer 2.0, экспорт треков с эффектами и стеклянные уведомления',
      categories: [
        {
          id: 'studio',
          title: 'Студия звука и ремиксов 2.0 (Pro Bass, Reverb, 8D, Nightcore)',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>',
          items: [
            'Быстрые пресеты ремиксов в 1 клик: Slowed + Reverb, Nightcore 1.25x, 808 Bass Slam, Lo-Fi Tape и 8D Spatial Audio (360-градусная панорама).',
            'Pro Bass Boost & Soft Clipper: плавный регулятор мощности от 0 до +18 dB, выбор характера баса (Deep Sub 55Hz и Punch Kick 100Hz) и аналоговая сатурация без хрипа.',
            'Настоящая студийная нормализация звука (Dynamics Compressor): автоматическое выравнивание громкости тихих и громких треков.'
          ]
        },
        {
          id: 'export',
          title: 'Экспорт ремиксов и обновленные уведомления Liquid Glass',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
          items: [
            'Выбор режима при скачивании трека: сохранение чистого оригинала (MP3) или быстрый оффлайн-рендеринг трека со всеми активными эффектами Studio.',
            'Всплывающие уведомления в стиле жидкого стекла (Liquid Glass), автоматически подстраивающиеся под цвета и свечение вашего конструктора тем.'
          ]
        }
      ]
    },
    {
      version: '1.20.12',
      tag: 'v1.20.12',
      date: '23 октября 2026',
      title: 'Что нового в GlassPlayer',
      subtitle: 'Стабильное сетевое подключение и мгновенные обновления без закрытия окна',
      categories: [
        {
          id: 'network',
          title: 'Сетевой стек и гибридный DNS-резолвер',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>',
          items: [
            'Гибридный режим DNS (automatic DoH + системный DNS Windows): устранена ошибка ERR_NAME_NOT_RESOLVED при подключении к серверам и WebSocket.',
            'Полная совместимость с локальными DNS-фильтрами и сетевыми экранами (AdGuard DNS и др.).'
          ]
        },
        {
          id: 'updater',
          title: 'Система мгновенных обновлений Hot-Update',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
          items: [
            'Загрузка сжатых пакетов обновлений (~0.68 МБ) за доли секунды с проверкой целостности SHA-256.',
            'Применение обновлений на лету прямо в открытом окне плеера без его закрытия.'
          ]
        }
      ]
    },
    {
      version: '1.20.11',
      tag: 'v1.20.11',
      date: '23 октября 2026',
      title: 'Что нового в GlassPlayer',
      subtitle: 'Мгновенные модульные обновления без закрытия окна плеера',
      categories: [
        {
          id: 'updater',
          title: 'Мгновенная система Hot-Update и оптимизация сборки',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
          items: [
            'Легковесные пакеты обновлений (около 0.7 МБ вместо полной перекачки установщика): загрузка новой версии занимает доли секунды.',
            'Обновление без закрытия плеера: при нажатии «Установить» приложение мгновенно применяет патч прямо в открытом окне.',
            'Криптографическая проверка целостности пакетов по хэшу SHA-256 с автоматическим резервным переключением на полный установщик.',
            'Размер базового установщика Windows сокращен почти вдвое (со 151 МБ до 83 МБ) за счет очистки от неиспользуемых мобильных пакетов.'
          ]
        }
      ]
    },
    {
      version: '1.20.10',
      tag: 'v1.20.10',
      date: '23 октября 2026',
      title: 'Что нового в GlassPlayer',
      subtitle: 'Отказоустойчивый загрузчик обновлений и защита от повреждения файлов',
      categories: [
        {
          id: 'updater',
          title: 'Отказоустойчивость и безопасность загрузчика',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
          items: [
            'Безопасное скачивание во временный файл .part: файл переименовывается в .exe только после 100% подтверждения размера.',
            'Устранено ложное удаление файла при переходах по редиректам GitHub Releases.',
            'Таймаут 30 секунд и защита от зависания процесса обновления при нестабильном интернет-соединении.',
            'Валидация источников загрузки: разрешены только доверенные адреса репозитория.',
            'Автоматическая очистка устаревших установочных файлов из временной папки Temp.'
          ]
        }
      ]
    },
    {
      version: '1.20.9',
      tag: 'v1.20.9',
      date: '23 октября 2026',
      title: 'Что нового в GlassPlayer',
      subtitle: 'Бесшовный автоматический перезапуск и информативный апдейтер',
      categories: [
        {
          id: 'updater',
          title: 'Автоматический перезапуск и стабильность апдейтера',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
          items: [
            'Автоматический перезапуск: после нажатия «Установить» приложение тихо обновляется в фоне и сразу запускается само.',
            'Устранено зависание установщика: исправлена очистка стека NSIS и гарантированное освобождение файлов.',
            'Отображение версии на плашке: баннер обновления теперь всегда четко указывает номер устанавливаемой версии.',
            'Улучшенное кэширование: уже скачанный установочный файл не скачивается повторно.'
          ]
        }
      ]
    },
    {
      version: '1.20.8',
      tag: 'v1.20.8',
      date: '23 октября 2026',
      title: 'Что нового в GlassPlayer',
      subtitle: 'Мгновенное сетевое присутствие и надежная синхронизация друзей',
      categories: [
        {
          id: 'presence',
          title: 'Сетевой статус и присутствие друзей',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
          items: [
            'Исправлено отображение статуса «В сети»: собственный профиль и активные друзья теперь мгновенно отображаются онлайн.',
            'Устранено ложное отключение через 3 минуты: статус привязан к активному соединению сокета без искусственного таймаута.',
            'Мгновенная доставка статусов друзей при запуске приложения без задержки ожидания смены трека.',
            'Фоновое параллельное подключение WebSocket с автоматическим переподключением при пробуждении сервера.'
          ]
        },
        {
          id: 'stability',
          title: 'Стабильность и автоподключение',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
          items: [
            'Резервное чтение сохраненных сессий пользователя при холодном старте сервера.',
            'Автоматическое восстановление соединения с сервером при обрыве связи.',
            'Живое обновление карточки профиля в реальном времени при смене статуса друга.'
          ]
        }
      ]
    },
    {
      version: '1.20.7',
      tag: 'v1.20.7',
      date: '18 октября 2026',
      title: 'Что нового в GlassPlayer',
      subtitle: 'Точная аналитика до секунд и устранение ложных статусов «В сети»',
      categories: [
        {
          id: 'stats',
          title: 'Точная аналитика времени звучания (до секунд)',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
          items: [
            'Устранена ошибка отображения фиксированных «3 минут» для треков и исполнителей во вкладках за 7 и 30 дней.',
            'Высокоточный расчет звучания каждого трека и артиста с детализацией до секунд (минуты и секунды).',
            'Отображение времени звучания в карточке главного трека, Топ-5 треках и Топ-5 исполнителях.'
          ]
        },
        {
          id: 'social',
          title: 'Статусы друзей и сетевое присутствие',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
          items: [
            'Устранен баг фантомного статуса «В сети»: пользователи больше не отображаются активными после закрытия программы.',
            'Автоматическая очистка устаревших сессий при перезапуске сервера и 30-секундный heartbeat-контроль соединений.',
            'Клиентская валидация свежести последней активности для исключения устаревших записей базы данных.'
          ]
        }
      ]
    },
    {
      version: '1.20.6',
      tag: 'v1.20.6',
      date: '18 октября 2026',
      title: 'Что нового в GlassPlayer',
      subtitle: 'Аналитика прослушивания, бесшовный автоапдейтер и умное караоке',
      categories: [
        {
          id: 'stats',
          title: 'Статистика прослушивания (Stats Wrapped)',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>',
          items: [
            'Полноценный аналитический дашборд с фильтрами за всё время, 30 дней и 7 дней.',
            'Hero-карточка главного трека #1 с суммарным временем и запуском в один клик.',
            'Рейтинг Топ-5 треков и исполнителей с прямым переходом в профили артистов.',
            'Честный подсчет времени: секунды начисляются строго во время воспроизведения (на паузе время не идёт).',
            'Исправлен учет зацикленного повтора (loop): каждый полный цикл трека честно засчитывает +1 воспроизведение.',
            'Облачная синхронизация с аккаунтом: защита от стирания данных при очистке кэша с сохранением всех наслушанных часов.'
          ]
        },
        {
          id: 'updater',
          title: 'Бесшовный тихий автоапдейтер',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
          items: [
            'Тихая фоновая загрузка обновлений прямо во время прослушивания музыки.',
            'Умное кэширование: приложение проверяет локальный файл и не скачивает 150 МБ заново.',
            'Бесшовный автоматический перезапуск и установка: решена проблема с зависанием фоновых процессов.',
            'Регистрация ярлыков в меню «Пуск» и на рабочем столе для мгновенного поиска в Windows.'
          ]
        },
        {
          id: 'lyrics',
          title: 'Караоке и умные тексты',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>',
          items: [
            'Умная псевдо-синхронизация Genius (Auto-Pacing) для песен без встроенных LRC-меток.',
            'Алгоритм строгой фильтрации ложных совпадений с базы LRCLIB.'
          ]
        },
        {
          id: 'privacy',
          title: 'Приватность и интеграции',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
          items: [
            'Настройки приватности: возможность скрыть список избранных треков в профиле от гостей.',
            'Обновленный Discord Rich Presence: кликабельные кнопки перехода на сайт и трек.'
          ]
        },
        {
          id: 'discovery',
          title: 'Моя волна и дискографии',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"></path><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"></path><circle cx="12" cy="12" r="2"></circle><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"></path><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"></path></svg>',
          items: [
            'Оптимизированные бесконечные рекомендации SoundCloud и Spotify с плавной подгрузкой.',
            'Корректная загрузка альбомов и треклистов артистов с правильными обложками.'
          ]
        }
      ]
    }
  ];

  function getAppVersion() {
    return (typeof window !== 'undefined' && window.APP_VERSION) || '1.20.6';
  }

  function getChangelogEntry(version) {
    if (!version) return CHANGELOG_REGISTRY[0];
    const cleanVer = String(version).replace(/^v/, '');
    const found = CHANGELOG_REGISTRY.find(e => e.version === cleanVer);
    return found || CHANGELOG_REGISTRY[0];
  }

  function buildChangelogHTML(entry) {
    const categoriesHTML = (entry.categories || []).map(cat => {
      const itemsHTML = (cat.items || []).map(item => `
        <li class="changelog-item">
          <span class="changelog-bullet" aria-hidden="true"></span>
          <span>${item}</span>
        </li>
      `).join('');

      return `
        <div class="changelog-section">
          <div class="changelog-section-header">
            <span class="changelog-section-icon" aria-hidden="true">${cat.icon || ''}</span>
            <h4 class="changelog-section-title">${cat.title}</h4>
          </div>
          <ul class="changelog-list">
            ${itemsHTML}
          </ul>
        </div>
      `;
    }).join('');

    return `
      <div class="changelog-modal" role="dialog" aria-modal="true" aria-labelledby="changelog-dialog-title">
        <div class="changelog-header">
          <div class="changelog-header-main">
            <div class="changelog-version-row">
              <span class="changelog-version-tag">${entry.tag || ('v' + entry.version)}</span>
              <span class="changelog-release-date">${entry.date || ''}</span>
            </div>
            <h3 id="changelog-dialog-title" class="changelog-title">${entry.title}</h3>
          </div>
        </div>

        <div class="changelog-body">
          ${categoriesHTML}
        </div>

        <div class="changelog-footer">
          <button id="changelog-confirm-btn" class="changelog-primary-btn" type="button">Понятно</button>
        </div>
      </div>
    `;
  }

  function openChangelogModal(version) {
    let overlay = document.getElementById('changelog-modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'changelog-modal-overlay';
      document.body.appendChild(overlay);
    }

    const currentVer = version || getAppVersion();
    const entry = getChangelogEntry(currentVer);
    overlay.innerHTML = buildChangelogHTML(entry);

    // Fade-in animation
    requestAnimationFrame(() => {
      overlay.classList.add('visible');
    });

    const close = () => {
      overlay.classList.remove('visible');
      try {
        localStorage.setItem('gp_last_seen_changelog', currentVer);
      } catch (err) {
        // Safe localStorage write
      }
      setTimeout(() => {
        if (overlay && overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }, 300);
    };

    const confirmBtn = overlay.querySelector('#changelog-confirm-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', close);
      confirmBtn.focus();
    }

    // Close when clicking outside modal box
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        close();
      }
    });

    // Close on Escape key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        window.removeEventListener('keydown', escHandler);
        close();
      }
    };
    window.addEventListener('keydown', escHandler);
  }

  function checkChangelogOnStartup() {
    try {
      const currentVer = getAppVersion();
      const lastSeen = localStorage.getItem('gp_last_seen_changelog');
      if (lastSeen !== currentVer) {
        // Trigger modal smoothly after initial app load so it doesn't stutter window painting
        setTimeout(() => {
          openChangelogModal(currentVer);
        }, 1200);
      }
    } catch (e) {
      console.warn('[Changelog] Startup check error:', e);
    }
  }

  // Exports
  window.GP = window.GP || {};
  window.GP.Components = window.GP.Components || {};
  window.GP.Components.Changelog = {
    openChangelogModal,
    checkChangelogOnStartup,
    CHANGELOG_REGISTRY
  };

  window.openChangelogModal = openChangelogModal;
  window.checkChangelogOnStartup = checkChangelogOnStartup;

  // Auto-run startup check
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', checkChangelogOnStartup);
    } else {
      checkChangelogOnStartup();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
