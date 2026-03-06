const CACHE_NAME = 'badmin-ops-v1';
const URLS_TO_CACHE = [
  '/',
  '/admin',
  '/offline.html'
];

// インストール時: 基本ファイルをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(URLS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// アクティベーション時: 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// バックグラウンドプッシュ通知受信
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? '🏸 試合呼び出し！', {
      body: data.body ?? 'コートへお越しください',
      icon: '/new-logo_transparent.png',
      tag: data.tag ?? 'match-calling',
      requireInteraction: true,
      data: { url: '/user' }
    })
  );
});

// 通知クリック時: アプリを開く or フォーカス
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // すでに /user ページが開いていればフォーカス
      for (const client of clientList) {
        if (client.url.includes('/user') && 'focus' in client) {
          return client.focus();
        }
      }
      // 開いていなければ新規タブで /user を開く
      if (clients.openWindow) return clients.openWindow('/user');
    })
  );
});

// フェッチ時: Network First戦略(Firestoreデータは常に最新を取得)
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 🔥 POST/PUT/DELETE等のリクエストはキャッシュ不可 → バイパス
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  // 🔥 Firestore通信（Long Polling含む）は一切キャッシュしない
  if (request.url.includes('firestore.googleapis.com') ||
      request.url.includes('googleapis.com')) {
    event.respondWith(fetch(request));
    return;
  }

  // その他のGETリクエスト: Network First + Cache Fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        // 成功したら、キャッシュにコピーを保存（GETのみ保証済み）
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // ネットワークエラー時はキャッシュから返す
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // キャッシュもない場合、オフラインページを返す
          if (request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
        });
      })
  );
});
