importScripts('node_modules/sw-toolbox/sw-toolbox.js');

toolbox.precache([
  '/',
  '/app.js',
  '/styles.css',
  '/images.json',
]);

toolbox.router.default = toolbox.networkFirst;

toolbox.router.get('/*', toolbox.cacheFirst, { origin: 'http://www.blogcdn.com' });
