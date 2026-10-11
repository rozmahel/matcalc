/* MatCalc – registrace service workeru (instalace jako aplikace, offline režim).
   Při otevření index.html přímo ze souboru (file://) se nic neděje. */
(function () {
  if (!('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function (err) {
      console.warn('[MatCalc] Service worker se nepodařilo zaregistrovat:', err);
    });
  });
})();
