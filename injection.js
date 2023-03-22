if (!process.send) {
  // This might be a worker thread.
  return;
}

const Path = require('path');

const Chalk = require('chalk');

const INITIAL_MODULE_PATH_FETCH_TIMEOUT = 1000;

const MODULE_PATH_FETCH_INTERVAL = 5000;

let modulePathsFetcher;

try {
  let {ESMLoader, esmLoader} = require('internal/process/esm_loader');

  modulePathsFetcher = () => [
    ...Array.from((ESMLoader || esmLoader).moduleMap.keys())
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
  reportLoadedModulePaths();

  setInterval(
    () => reportLoadedModulePaths(),
    MODULE_PATH_FETCH_INTERVAL,
  ).unref();
}, INITIAL_MODULE_PATH_FETCH_TIMEOUT).unref();

process.on('uncaughtExceptionMonitor', error => {
  const modules = [];

  if (error instanceof SyntaxError) {
    const [, module] = error.stack.match(/^(.+):\d+\n/) ?? [];

    if (typeof module === 'string') {
      modules.push(module);
    }
  } else {
    switch (error.code) {
      case 'MODULE_NOT_FOUND': {
        // CommonJS module

        const extensions = ['', ...Object.keys(require.extensions)];

        const [, module] =
          error.message.match(/^Cannot find module '(.+)'\n/) ?? [];

        if (module === undefined) {
          break;
        }

        const source = error.requireStack[0];

        modules.push(
          ...extensions.map(extension =>
            Path.resolve(source, '..', module + extension),
          ),
        );

        break;
      }
      case 'ERR_MODULE_NOT_FOUND': {
        // ES module
        const [, module] =
          error.message.match(
            /^Cannot find module '(.+?)' imported from .+$/,
          ) ?? [];

        if (module === undefined) {
          break;
        }

        modules.push(module);

        break;
      }
      default:
        return;
    }
  }

  if (modules.length === 0) {
    console.warn(
      Chalk.yellow(
        '[nodemand] failed to extract module path from error message',
      ),
    );
    return;
  }

  reportModulePaths(modules);
});

process.on('exit', () => reportLoadedModulePaths());

function reportLoadedModulePaths() {
  reportModulePaths(modulePathsFetcher());
}

function reportModulePaths(reportedPaths) {
  const paths = [];

  for (let path of reportedPaths) {
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
