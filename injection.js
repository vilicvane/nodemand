const Path = require('path');

const INITIAL_MODULE_PATH_FETCH_TIMEOUT = 1000;

const MODULE_PATH_FETCH_INTERVAL = 5000;

const FILE_PROTOCOL_PREFIX = 'file:///';

let reportedModulePathSet = new Set();

setTimeout(reportModulePaths, INITIAL_MODULE_PATH_FETCH_TIMEOUT).unref();

setInterval(reportModulePaths, MODULE_PATH_FETCH_INTERVAL).unref();

process.on('exit', reportModulePaths);

function reportModulePaths() {
  let paths = fetchModulePaths().filter(
    path => !reportedModulePathSet.has(path),
  );

  for (let path of paths) {
    reportedModulePathSet.add(path);
  }

  process.send({
    type: 'add-paths',
    paths,
  });
}

function fetchModulePaths() {
  try {
    const {ESMLoader} = require('internal/process/esm_loader');

    return Array.from(ESMLoader.moduleMap.keys())
      .map(uri => {
        if (!uri.startsWith(FILE_PROTOCOL_PREFIX)) {
          return undefined;
        }

        let path = Path.normalize(
          decodeURI(uri.slice(FILE_PROTOCOL_PREFIX.length)),
        );

        if (!Path.isAbsolute(path)) {
          path = `${Path.sep}${path}`;
        }

        return path;
      })
      .filter(path => typeof path === 'string');
  } catch (error) {
    return Object.keys(require.cache);
  }
}
