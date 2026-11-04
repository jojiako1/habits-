// Offline support for the habit tracker.
// The app itself is cached on first visit; your ticks live in the browser's storage, not here.
var APP_CACHE = "habits-app-v1";
var FONT_CACHE = "habits-fonts-v1";
var APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(APP_CACHE).then(function (cache) { return cache.addAll(APP_FILES); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k.indexOf("habits-") === 0 && k !== APP_CACHE && k !== FONT_CACHE;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // Serve the saved copy straight away, and refresh it in the background
    // so the next launch picks up any update.
    var key = req.mode === "navigate" ? "./index.html" : req;
    event.respondWith(
      caches.open(APP_CACHE).then(function (cache) {
        return cache.match(key).then(function (hit) {
          var network = fetch(req).then(function (res) {
            if (res && res.ok) cache.put(key, res.clone());
            return res;
          }).catch(function () { return hit; });
          return hit || network;
        });
      })
    );
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open(FONT_CACHE).then(function (cache) {
        return cache.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            cache.put(req, res.clone());
            return res;
          });
        });
      })
    );
  }
});
