if (!process.send) {
  // This might be a worker thread.
  return;
}

const FS = require('fs');
const Path = require('path');

const Chalk = require('chalk');

const {NODEMAND_REPORT_FILE_PATH} = process.env;

const MODULE_PATH_FETCH_INTERVAL = 5000;

let modulePathsFetcher;

try {
  const ESMLoader = require('internal/process/esm_loader');

  const loader = ESMLoader.ESMLoader || ESMLoader.esmLoader;
  const moduleMap = loader.moduleMap || loader.loadCache;

  modulePathsFetcher = () => [
    ...Array.from(moduleMap.keys())
      .map(url => {
        const {protocol, pathname} = new URL(url);

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

const reportedModulePathSet = new Set();

process.on('uncaughtExceptionMonitor', error => {
  const modules = modulePathsFetcher();

  if (error instanceof SyntaxError) {
    const [, module] = error.stack.match(/^(.+):/) ?? [];
    if (typeof module === 'string') {
      modules.push(module);
    }
  } else if (error instanceof Error) {
    switch (error.code) {
      case 'MODULE_NOT_FOUND': {
        // CommonJS module

        const extensions = ['', ...Object.keys(require.extensions)];

        const [, module] =
          error.message.match(/^Cannot find module '(.+)'$/m) ?? [];

        if (module === undefined) {
          break;
        }

        modules.push(...error.requireStack);

        const source = error.requireStack[0];

        const modulePath = Path.resolve(source, '..', module);

        modules.push(...extensions.map(extension => modulePath + extension));

        break;
      }
      case 'ERR_MODULE_NOT_FOUND': {
        // ES module
        const [, module, source] =
          error.message.match(
            /^Cannot find module '(.+?)' imported from (.+)$/m,
          ) ?? [];

        if (module === undefined) {
          break;
        }

        modules.push(source);
        modules.push(module);

        break;
      }
      default: {
        let paths = error.stack?.match(/[^()]+(?=:\d+:\d+\)$)/gm) ?? [];

        paths = paths.filter(path => Path.isAbsolute(path));

        modules.push(...paths);

        break;
      }
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

process.on('exit', () => {
  FS.writeFileSync(
    NODEMAND_REPORT_FILE_PATH,
    JSON.stringify(modulePathsFetcher()),
  );
});

process.nextTick(() => {
  reportLoadedModulePaths(true);

  setInterval(
    () => reportLoadedModulePaths(),
    MODULE_PATH_FETCH_INTERVAL,
  ).unref();
});

function reportLoadedModulePaths(initial = false) {
  reportModulePaths(modulePathsFetcher(), initial);
}

function reportModulePaths(reportedPaths, initial = false) {
  const paths = [];

  for (const path of reportedPaths) {
    if (reportedModulePathSet.has(path)) {
      continue;
    }

    reportedModulePathSet.add(path);

    paths.push(path);
  }

  process.send({
    type: 'add-paths',
    paths,
    initial,
  });
}
