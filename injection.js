if (!process.send) {
  // This might be a worker thread.
  return;
}

const Path = require('path');

const INITIAL_MODULE_PATH_FETCH_TIMEOUT = 1000;

const MODULE_PATH_FETCH_INTERVAL = 5000;

let modulePathsFetcher;

try {
  let {ESMLoader} = require('internal/process/esm_loader');

  modulePathsFetcher = () => [
    ...Array.from(ESMLoader.moduleMap.keys())
      .map(url => {
        let {protocol, pathname} = new URL(url);

        if (protocol !== 'file:') {
          return undefined;
        }

        let path = Path.normalize(decodeURI(pathname));

        // On Windows it would be something like '\\C:\\foo.js'.
        if (path.startsWith('\\')) {
          path = path.slice(1);
        }

        return path;
      })
      .filter(path => typeof path === 'string'),
    ...Object.keys(require.cache),
  ];
} catch (error) {
  modulePathsFetcher = () => Object.keys(require.cache);
}

let reportedModulePathSet = new Set();

setTimeout(() => {
  reportModulePaths();

  setInterval(() => reportModulePaths(), MODULE_PATH_FETCH_INTERVAL).unref();
}, INITIAL_MODULE_PATH_FETCH_TIMEOUT).unref();

process.on('exit', () => reportModulePaths());

function reportModulePaths() {
  let paths = [];

  for (let path of modulePathsFetcher()) {
    if (reportedModulePathSet.has(path)) {
      continue;
    }

    reportedModulePathSet.add(path);

    paths.push(path);
  }

  process.send({
    type: 'add-paths',
    paths,
  });
}
