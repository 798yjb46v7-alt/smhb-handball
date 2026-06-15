// ─── SMHB — Notifications Push (côté client) ──────────────────────────────
// Clé VAPID publique : à générer sur https://vapidkeys.com/
// Puis ajouter la clé privée dans les secrets Supabase Edge Functions
const VAPID_PUBLIC_KEY = 'VOTRE_VAPID_PUBLIC_KEY';

// ══════════════════════════════════════════════════════════════
// ENREGISTREMENT DU SERVICE WORKER
// ══════════════════════════════════════════════════════════════

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker non supporté');
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.log('[SW] Enregistré :', reg.scope);
    return reg;
  } catch (err) {
    console.error('[SW] Échec enregistrement :', err);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// DEMANDE DE PERMISSION + SOUSCRIPTION PUSH
// ══════════════════════════════════════════════════════════════

export async function requestPushPermission() {
  if (!('Notification' in window)) return { granted: false, reason: 'unsupported' };
  if (Notification.permission === 'denied') return { granted: false, reason: 'denied' };
  if (Notification.permission === 'granted') return { granted: true };

  const permission = await Notification.requestPermission();
  return { granted: permission === 'granted', reason: permission };
}

export async function subscribeToPush(swRegistration) {
  try {
    const existing = await swRegistration.pushManager.getSubscription();
    if (existing) return existing;

    const subscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    return subscription;
  } catch (err) {
    console.error('[Push] Échec souscription :', err);
    return null;
  }
}

// Souscrit et sauvegarde en base
export async function enablePushForUser(userId, updateProfileFn) {
  const { granted } = await requestPushPermission();
  if (!granted) return false;

  const swReg = await navigator.serviceWorker.ready;
  const subscription = await subscribeToPush(swReg);
  if (!subscription) return false;

  // Sauvegarde en base Supabase
  await updateProfileFn(userId, { push_subscription: subscription.toJSON() });
  console.log('[Push] Souscription sauvegardée');
  return true;
}

export async function disablePush(userId, updateProfileFn) {
  const swReg = await navigator.serviceWorker.ready;
  const sub = await swReg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();
  await updateProfileFn(userId, { push_subscription: null });
}

// ══════════════════════════════════════════════════════════════
// NOTIFICATIONS IN-APP (badge + liste)
// ══════════════════════════════════════════════════════════════

let notifCount = 0;

export function updateNotifBadge(count) {
  notifCount = count;
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  badge.textContent = count > 9 ? '9+' : count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

export function showLocalNotif(title, body) {
  // Notification toast in-app
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed;top:70px;right:12px;
    background:#1e1e1e;border:1px solid #F5C800;border-radius:10px;
    padding:12px 16px;max-width:300px;z-index:500;
    box-shadow:0 4px 20px rgba(0,0,0,.5);
    animation:slideIn .3s ease;
  `;
  toast.innerHTML = `
    <div style="font-size:13px;font-weight:700;color:#F5C800;margin-bottom:4px">${title}</div>
    <div style="font-size:12px;color:#aaa">${body}</div>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// ══════════════════════════════════════════════════════════════
// RAPPELS AUTOMATIQUES (côté client, 24h avant)
// ══════════════════════════════════════════════════════════════

export function scheduleReminders(events) {
  events.forEach(event => {
    const eventDate = new Date(`${event.date}T${event.time}`);
    const reminderDate = new Date(eventDate.getTime() - 24 * 60 * 60 * 1000);
    const now = new Date();
    const delay = reminderDate.getTime() - now.getTime();

    if (delay > 0 && delay < 7 * 24 * 60 * 60 * 1000) {
      setTimeout(() => {
        showLocalNotif(
          `Rappel : ${event.title}`,
          `Demain à ${event.time} — ${event.location || 'Lieu à confirmer'}`
        );
      }, delay);
    }
  });
}

// ══════════════════════════════════════════════════════════════
// HELPER
// ══════════════════════════════════════════════════════════════

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
