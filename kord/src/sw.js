/**
 * Service Worker for Discord KaiOS
 * Handles push notifications and offline functionality
 */

// Cache name for offline assets
const CACHE_NAME = 'discord-kaios-v1';

// Assets to cache for offline use
const OFFLINE_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/icons/icon-56.png',
  '/icons/icon-112.png',
  '/icons/badge-24.png',
  '/offline.html'
];

// Install event - cache offline assets
self.addEventListener('install', function(event) {
  console.log('[ServiceWorker] Install');
  
  // Perform install steps
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('[ServiceWorker] Caching offline assets');
        return cache.addAll(OFFLINE_ASSETS);
      })
      .then(function() {
        // Force waiting service worker to become active
        return self.skipWaiting();
      })
  );
});

// Activation event - cleanup old caches
self.addEventListener('activate', function(event) {
  console.log('[ServiceWorker] Activate');
  
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(cacheName) {
            // Remove old caches
            return cacheName !== CACHE_NAME;
          })
          .map(function(cacheName) {
            console.log('[ServiceWorker] Removing old cache', cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(function() {
      // Take control of all clients
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache if available, otherwise fetch from network
self.addEventListener('fetch', function(event) {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin) && 
      !event.request.url.includes('discord.com/api')) {
    return;
  }
  
  // For API requests, use network first, then cache
  if (event.request.url.includes('discord.com/api')) {
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          // Cache important API responses
          if (event.request.url.includes('/users/') ||
              event.request.url.includes('/guilds/')) {
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then(function(cache) {
                cache.put(event.request, responseToCache);
              });
          }
          
          return response;
        })
        .catch(function() {
          // If network fails, try to get from cache
          return caches.match(event.request);
        })
    );
  } else {
    // For non-API requests, use cache first, then network
    event.respondWith(
      caches.match(event.request)
        .then(function(response) {
          // Cache hit - return response
          if (response) {
            return response;
          }
          
          // Cache miss - get from network
          return fetch(event.request).then(
            function(response) {
              // Check if we received a valid response
              if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
              }
              
              // Clone the response
              const responseToCache = response.clone();
              
              // Add to cache
              caches.open(CACHE_NAME)
                .then(function(cache) {
                  cache.put(event.request, responseToCache);
                });
                
              return response;
            }
          );
        }).catch(function() {
          // If both cache and network fail, show offline page
          if (event.request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
        })
    );
  }
});

// Push notification event handler
self.addEventListener('push', function(event) {
  console.log('[ServiceWorker] Push Received');
  
  let data = {};
  
  try {
    data = event.data.json();
  } catch (e) {
    data = {
      title: 'Discord',
      body: event.data ? event.data.text() : 'New notification'
    };
  }
  
  // Default notification options
  const title = data.title || 'Discord';
  const options = {
    body: data.body || data.content || 'New message received',
    icon: '/icons/icon-112.png',
    badge: '/icons/badge-24.png',
    tag: data.id || 'discord-notification',
    data: {
      url: data.url || '/',
      channelId: data.channel_id,
      messageId: data.id
    },
    vibrate: [100, 50, 100],
    requireInteraction: data.requireInteraction || false
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click event handler
self.addEventListener('notificationclick', function(event) {
  console.log('[ServiceWorker] Notification click received');
  
  event.notification.close();
  
  // Get notification data
  const data = event.notification.data;
  
  // This looks to see if the current is already open and focuses if it is
  event.waitUntil(
    clients.matchAll({
      type: 'window'
    })
    .then(function(clientList) {
      if (clientList.length > 0) {
        // If there's already a client, focus it and navigate to the right channel/message
        return clientList[0].focus().then(function(client) {
          if (data && data.channelId) {
            return client.postMessage({
              type: 'NAVIGATE_TO_CHANNEL',
              channelId: data.channelId,
              messageId: data.messageId
            });
          }
          return client;
        });
      } else {
        // If no client is open, open a new one
        return clients.openWindow(data && data.url ? data.url : '/');
      }
    })
  );
});

// Periodic sync for background updates
self.addEventListener('periodicsync', function(event) {
  if (event.tag === 'discord-messages-sync') {
    event.waitUntil(syncMessages());
  }
});

// Background sync function
async function syncMessages() {
  // Get stored credentials
  const db = await openDb();
  const credentials = await db.get('credentials', 'token');
  
  if (!credentials || !credentials.token) {
    return;
  }
  
  try {
    // Get list of channels to check
    const channels = await db.getAll('channels');
    
    for (const channel of channels) {
      // Check for new messages in each channel
      const response = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages?limit=10`, {
        headers: {
          'Authorization': `Bearer ${credentials.token}`
        }
      });
      
      if (response.ok) {
        const messages = await response.json();
        
        // Store new messages
        const tx = db.transaction('messages', 'readwrite');
        for (const message of messages) {
          await tx.store.put(message);
        }
        await tx.done;
        
        // Send notification for new messages
        const lastReadTimestamp = channel.lastRead || 0;
        const newMessages = messages.filter(m => new Date(m.timestamp).getTime() > lastReadTimestamp);
        
        if (newMessages.length > 0) {
          await self.registration.showNotification('Discord', {
            body: `${newMessages.length} new message${newMessages.length > 1 ? 's' : ''} in #${channel.name}`,
            icon: '/icons/icon-112.png',
            badge: '/icons/badge-24.png',
            tag: `channel-${channel.id}`,
            data: {
              channelId: channel.id
            }
          });
        }
        
        // Update channel last read timestamp
        await db.put('channels', {
          ...channel,
          lastRead: Date.now()
        });
      }
    }
  } catch (error) {
    console.error('Sync failed:', error);
  }
}

// Open IndexedDB
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('DiscordKaiOS', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = () => {
      const db = request.result;
      
      // Create object stores
      if (!db.objectStoreNames.contains('credentials')) {
        db.createObjectStore('credentials', { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains('messages')) {
        const messagesStore = db.createObjectStore('messages', { keyPath: 'id' });
        messagesStore.createIndex('channel', 'channel_id', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('channels')) {
        db.createObjectStore('channels', { keyPath: 'id' });
      }
    };
  });
}