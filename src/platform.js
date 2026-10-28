// Geräte-Funktionen: Einstellungen/Speicher, Vibration, Vollbild + Querformat, Wake Lock.

const KEY = 'echo-racer:settings';

export const isTouch =
  (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) ||
  (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));

const DEFAULTS = {
  name: '',
  car: 0,
  control: isTouch ? 'touch' : 'keys', // 'touch' | 'tilt' | 'keys'
  sens: 1.0,
  tiltCal: 0,
  tiltInvert: false,
  autoGas: true,
  assist: false, // Lenkhilfe: hält von der Bande fern
  quality: 'auto', // 'auto' | 'high' | 'mid' | 'low'
  dprCap: 2.5,
  showFps: false,
  music: 0.55,
  sfx: 0.85,
  vibration: true,
  laps: 4,
  opponents: 5,
  difficulty: 1,
  track: 'neon',
  ttLaps: 5,
  hackType: 0,
  paint: 'standard',
  gpDiff: 1,
  driver: 4,
  mirror: 0,
  seenPaints: [], // schon angesehene freigeschaltete Lacke (für die NEU-Markierung)
  flame: 'standard', // Boost-Flamme
  speedClass: 1, // Index in CLASSES (Sport)
  seenFlames: [],
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* privater Modus o.ä. */
  }
  return { ...DEFAULTS };
}

export const settings = load();

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignorieren */
  }
}

// Bestzeiten und Rekord-Echos pro Strecke (Zeitfahren)
export function loadRecord(trackId) {
  try {
    const raw = localStorage.getItem('echo-racer:record:' + trackId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveRecord(trackId, rec) {
  try {
    localStorage.setItem('echo-racer:record:' + trackId, JSON.stringify(rec));
  } catch {
    /* ignorieren */
  }
}

export function vibrate(pattern) {
  if (!settings.vibration) return;
  // Browser erlauben Vibration erst nach einer echten Berührung
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    /* nicht unterstützt */
  }
}

export async function enterFullscreen() {
  const el = document.documentElement;
  try {
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    /* iPhone Safari kann kein Vollbild für Seiten */
  }
  try {
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch {
    /* nur im Vollbild / nicht überall erlaubt */
  }
}

export function isFullscreen() {
  return !!document.fullscreenElement;
}

export function isStandalone() {
  return (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
}

// Bildschirm bleibt an
let lock = null;
let wanted = false;
export const wakeLock = {
  async acquire() {
    wanted = true;
    try {
      if ('wakeLock' in navigator && !lock) {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => {
          lock = null;
        });
      }
    } catch {
      lock = null;
    }
  },
  async release() {
    wanted = false;
    try {
      if (lock) await lock.release();
    } catch {
      /* egal */
    }
    lock = null;
  },
};

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wanted) wakeLock.acquire();
  });
}

export async function shareLink(url, title) {
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return 'shared';
    }
  } catch {
    /* abgebrochen */
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
