console.log('SERVICE WORKER');

importScripts('/js/polyfill.min.js');
importScripts('/js/idb.js');

let visibilityState = 'visible';

const cachedDatabase = idb.openDB('telekram', 5, {
  upgrade: (db, oldVersion, newVersion) => {
    const tables = ['profilePhotos', 'chatPreferences', 'mediaAttachments', 'offlineWebpages', 'appPreferences'];
    tables.forEach(n => {
      if (!db.objectStoreNames.contains(n))
        db.createObjectStore(n);
    });
  },
});

self.addEventListener('install', (event) => {
  console.log('[SW] on install');
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  console.log('[SW] on activate');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // console.log('[SW] on fetch');
});

self.addEventListener('push', (event) => {
  const obj = event.data.json();
  let hasActiveWindows = false;
  console.log('[SW] on push', obj);
  clients.matchAll({type: 'window'})
  .then((clientList) => {
    console.log('matched clients', clientList)
    hasActiveWindows = clientList.length > 0;
    if (visibilityState !== 'visible') {
      fireNotification(obj);
      return;
    }
    if (hasActiveWindows) {
      console.log('Supress notification because some instance is alive')
      return;
    }
    fireNotification(obj);
  })
  .catch((err) => {
    console.log(err);
  });
});

self.addEventListener('message', (event) => {
  console.log('[SW] on message:', event.data);
  switch (event.data.type) {
    case 0: // clearNotification
      break;
    case 1: // visibilityState
      visibilityState = event.data.visibilityState;
      console.log('visibilityState :', visibilityState);
      break;
  }
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] on notificationclick');
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window" })
  .then((clientList) => {
    for (var i = 0; i < clientList.length; i++) {
      let client = clientList[i];
      if (client.url == '/' && 'focus' in client)
        return client.focus();
    }
    if (clients.openWindow) {
      return clients.openWindow('/');
    }
    if (clients.openApp) {
      return clients.openApp();
    }
  })
  .catch((err) => {
    console.log(err);
  }));
});

self.addEventListener('notificationclose', (event) => {
  console.log('[SW] on notificationclose');
});

// https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/pushsubscriptionchange_event
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[SW] on pushsubscriptionchange', event);
  const result = self.registration.pushManager.subscribe({userVisibleOnly: true})
  .then((subscription) => {
    const subscriptionObj = subscription.toJSON();
    delete subscriptionObj['expirationTime'];
    return Promise.all([cachedDatabase, Promise.resolve(subscriptionObj)]);
  })
  .then(values => {
    return values[0].put('appPreferences', values[1], 'updatedPushSubscription');
  })
  .then(key => {
    console.log('[SW]@pushsubscriptionchange:', key);
    fireSystemNotification('System Update', 'Please re-launch app to apply new push notification subscription');
  })
  .catch(err => {
    console.error('[SW]@pushsubscriptionchange:', err);
    fireSystemNotification('System Update', 'Unable to resubscribe for push notification');
  });
  event.waitUntil(result);
});

function fireSystemNotification(title, body, requireInteraction = false, actions = []) {
  self.registration.showNotification(title || 'TeleKram', {
    body: body || 'Hello from TeleKram',
    requireInteraction: requireInteraction,
    actions: actions
  });
}

function fireNotification(obj) {
  let title = obj.title || 'Telegram'
  let body = obj.description || ''
  let icon = '/icons/icon56x56.png'
  let peerID

  if (obj.custom && obj.custom.channel_id) {
    peerID = -obj.custom.channel_id
  } else if (obj.custom && obj.custom.chat_id) {
    peerID = -obj.custom.chat_id
  } else {
    peerID = obj.custom && obj.custom.from_id || 0
  }
  obj.custom.peerID = peerID
  let tag = 'peer' + peerID

  console.log('[SW] show notify', title, body, icon, obj)

  self.registration.showNotification(title, {
    body: body,
    icon: icon,
    tag: tag,
    data: obj,
  });
}
