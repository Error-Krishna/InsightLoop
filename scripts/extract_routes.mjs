import { app } from '../apps/api/dist/app.js';

export function extractRegisteredRoutes(appInstance) {
  function cleanRegexp(re) {
    let s = re.source || '';
    s = s.replace(/^\^/, '');
    s = s.replace(/\\\/\?\(\?=\\\/\|\$\)\/?.*$/, '');
    s = s.replace(/\\([/.-])/g, '$1');
    return s;
  }

  function walk(router, currentPrefix = '') {
    const list = [];
    for (const layer of router.stack || []) {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
        const sub = layer.route.path === '/' ? '' : layer.route.path;
        list.push({
          methods,
          path: (currentPrefix + sub) || '/',
          originalPath: layer.route.path,
        });
      } else if (layer.name === 'router' && layer.handle?.stack) {
        const prefix = cleanRegexp(layer.regexp);
        list.push(...walk(layer.handle, currentPrefix + prefix));
      }
    }
    return list;
  }

  return walk(appInstance._router);
}

const routes = extractRegisteredRoutes(app);
console.log(`Found ${routes.length} registered routes:`);
for (const r of routes) {
  console.log(`${r.methods.join(',').padEnd(8)} ${r.path}`);
}
