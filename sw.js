// Offline support for the habit tracker.
// The app itself is cached on first visit; your ticks live in the browser's storage, not here.
// It also shows your reminders: GitHub only says which reminder is due, and the words
// are put together here on the phone, so edits in the app apply straight away.
var APP_CACHE = "habits-app-v3";
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
    caches.open(APP_CACHE).then(function (cache) {
      // "reload" skips any copy the browser saved earlier, so a new upload is picked up straight away
      return cache.addAll(APP_FILES.map(function (u) { return new Request(u, { cache: "reload" }); }));
    }).then(function () { return self.skipWaiting(); })
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
          var network = fetch(req, { cache: "no-cache" }).then(function (res) {
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

// ---------- reminders ----------
function idbGet(key) {
  return new Promise(function (resolve, reject) {
    var req = indexedDB.open("habit-tracker", 1);
    req.onupgradeneeded = function () { req.result.createObjectStore("kv"); };
    req.onerror = function () { reject(req.error); };
    req.onsuccess = function () {
      var q = req.result.transaction("kv", "readonly").objectStore("kv").get(key);
      q.onsuccess = function () { resolve(q.result); };
      q.onerror = function () { reject(q.error); };
    };
  });
}
function pad(n) { return (n < 10 ? "0" : "") + n; }
function todayIso() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

// keep in step with composeReminder() in index.html
function composeReminder(r, snap, day) {
  var title = r.title || "Habits";
  var body = r.msg || "Time to check your habits.";
  if (r.habits && r.habits.length) {
    var all = r.habits.indexOf("*") >= 0;
    var ticks = (snap.days && snap.days[day]) || {};
    var left = (snap.habits || []).filter(function (h) {
      return day >= h.from && (!h.to || day <= h.to) && (all || r.habits.indexOf(h.id) >= 0) && !ticks[h.id];
    }).map(function (h) { return h.name; });
    if (left.length) body += "\nStill to do: " + left.join(", ") + ".";
    else body += all ? "\nEverything is ticked off today. Nice work." : "\nAlready done today. Nice work.";
  }
  return { title: title, body: body, tag: "r-" + r.id + "-" + day };
}

function buildNotification(data, snap) {
  var day = todayIso();
  if (data.id === "test") return { title: "Habits", body: "Test from GitHub: your reminders are set up and working.", tag: "test" };
  var list = (snap && snap.reminders) || [];
  var r = list.filter(function (x) { return x.id === data.id; })[0];
  if (!r) return { title: "Habits", body: "Time to check your habits.", tag: "r-" + (data.id || "x") + "-" + day };
  return composeReminder(r, snap, day);
}

self.addEventListener("push", function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  event.waitUntil(
    idbGet("snapshot").catch(function () { return null; }).then(function (snap) {
      var n = buildNotification(data, snap);
      return self.registration.showNotification(n.title, {
        body: n.body,
        tag: n.tag,
        icon: "icons/icon-192.png",
        badge: "icons/icon-192.png",
        data: { url: "./" }
      });
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) if ("focus" in list[i]) return list[i].focus();
      return self.clients.openWindow("./");
    })
  );
});
