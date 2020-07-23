const Path = require('path');

const INITIAL_MODULE_PATH_FETCH_TIMEOUT = 1000;

const MODULE_PATH_FETCH_INTERVAL = 5000;

const FILE_PROTOCOL_PREFIX = 'file://';

const {ESMLoader} = require('internal/process/esm_loader');

let reportedModulePathSet = new Set();

setTimeout(reportModulePaths, INITIAL_MODULE_PATH_FETCH_TIMEOUT).unref();

setInterval(reportModulePaths, MODULE_PATH_FETCH_INTERVAL).unref();

process.on('exit', reportModulePaths);

function reportModulePaths() {
  let paths = Array.from(ESMLoader.moduleMap.keys())
    .map(uri =>
      uri.startsWith(FILE_PROTOCOL_PREFIX)
        ? Path.normalize(decodeURI(uri.slice(FILE_PROTOCOL_PREFIX.length)))
        : undefined,
    )
    .filter(
      path => typeof path === 'string' && !reportedModulePathSet.has(path),
    );

  for (let path of paths) {
    reportedModulePathSet.add(path);
  }

  process.send({
    type: 'add-paths',
    paths,
  });
}
