#!/usr/bin/env node

const ChildProcess = require('child_process');
const Path = require('path');

const Chalk = require('chalk');
const Chokidar = require('chokidar');

const {
  execArgv,
  options: {debounce: debounceDelay, 'node-modules': toIncludeNodeModules},
  modulePath,
  args,
} = require('./@cli');

const CHANGED_FILE_PRINTING_LIMIT = 10;

let subprocess;
let exited;
let exitedWithError;

console.info(Chalk.yellow('[nodemand] start'));

up();

process.on('SIGINT', onSignalToExit);
process.on('SIGTERM', onSignalToExit);
process.on('SIGHUP', onSignalToExit);

function up(paths = []) {
  let timestamp = Date.now();

  let addedPaths = [];

  let restartScheduled = false;
  let restartStarted = false;

  let restartScheduleDebounceTimer;

  let changedFileCount = 0;

  let watcher = Chokidar.watch([modulePath, ...paths]);

  watcher.on('add', (path, stats) => {
    if (stats.mtimeMs >= timestamp) {
      scheduleRestart(path);
    }
  });

  watcher.on('change', path => {
    scheduleRestart(path);
  });

  watcher.on('unlink', path => {
    scheduleRestart(path);
  });

  exited = false;
  exitedWithError = false;

  subprocess = ChildProcess.fork(modulePath, args, {
    stdio: 'inherit',
    execArgv: [
      ...process.execArgv,
      '--expose-internals',
      ...execArgv,
      '--require',
      Path.join(__dirname, 'injection.js'),
    ],
  });

  subprocess.on('message', message => {
    if (!message || typeof message !== 'object') {
      return;
    }

    switch (message.type) {
      case 'add-paths': {
        addPaths(message.paths);
        break;
      }
    }
  });

  subprocess.on('exit', code => {
    exited = true;

    if (typeof code === 'number') {
      exitedWithError = code !== 0;

      console.info(
        (exitedWithError ? Chalk.red : Chalk.green)(
          `[nodemand] process exited with code ${code}`,
        ),
      );
    } else {
      console.info(Chalk.cyan('[nodemand] process exited'));
    }
  });

  function addPaths(paths) {
    if (restartScheduled) {
      return;
    }

    // Exclude modules within nodemand itself.
    paths = paths.filter(path =>
      Path.relative(__dirname, path).startsWith('..'),
    );

    if (!toIncludeNodeModules) {
      paths = paths.filter(path => !/[\\/]node_modules[\\/]/.test(path));
    }

    watcher.add(paths);

    addedPaths.push(...paths);
  }

  function scheduleRestart(path) {
    if (restartStarted) {
      return;
    }

    if (!restartScheduled) {
      restartScheduled = true;

      console.info(Chalk.yellow('[nodemand] restart scheduled'));
    }

    changedFileCount++;

    if (changedFileCount <= CHANGED_FILE_PRINTING_LIMIT) {
      console.info(`  ${Chalk.dim(path)}`);
    } else if (changedFileCount === CHANGED_FILE_PRINTING_LIMIT + 1) {
      console.info(`  ${Chalk.dim('...')}`);
    }

    clearTimeout(restartScheduleDebounceTimer);

    restartScheduleDebounceTimer = setTimeout(() => {
      restart().catch(error => {
        console.error(Chalk.red(error.message));
        process.exit(1);
      });
    }, debounceDelay);
  }

  async function restart() {
    restartStarted = true;

    await watcher.close();

    await stopSubprocess();

    console.info(Chalk.yellow('[nodemand] restart'));

    // If a change to a module leads to an error prevents CommonJS module from
    // initializing, we will not be able to know the module (that causes the
    // error) path again after restart, thus we will not be able to restart
    // again after that module changes. So we need to add added paths as the
    // next initial paths.

    up(exitedWithError ? addedPaths : []);
  }
}

function onSignalToExit() {
  stopSubprocess().then(
    () => process.exit(),
    error => {
      console.error(Chalk.red(error.message));
      process.exit(1);
    },
  );
}

async function stopSubprocess() {
  if (exited) {
    return;
  }

  console.info(Chalk.yellow(`[nodemand] killing process ${subprocess.pid}`));

  if (!subprocess.kill('SIGTERM')) {
    console.error(Chalk.red('Error killing the process'));
    process.exit(1);
  }

  await new Promise(resolve => subprocess.on('exit', resolve));
}
