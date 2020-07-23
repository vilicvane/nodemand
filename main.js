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

let subprocess;
let exited;
let exitedWithError;

console.info(Chalk.yellow('[nodemand] start'));

up();

process.on('SIGINT', onSignalToExit);
process.on('SIGTERM', onSignalToExit);
process.on('SIGHUP', onSignalToExit);

function up(initialPaths = [modulePath]) {
  let timestamp = Date.now();

  let addedPaths = [];

  let restartScheduled = false;
  let restartStarted = false;

  let restartScheduleDebounceTimer;

  let watcher = Chokidar.watch(initialPaths, {
    persistent: true,
  });

  watcher.on('add', (path, stats) => {
    if (stats.mtimeMs >= timestamp) {
      scheduleRestart(path);
    }
  });

  watcher.on('change', path => {
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

    console.info(`  ${Chalk.dim(path)}`);

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

    // 1. If a change leads to an error preventing CommonJS module from
    //    initializing, we will not be able to fetch the module path again
    //    after restart. Thus we need to add added paths as the next initial
    //    paths.
    // 2. And if the subprocess exited with error, it means the newly added
    //    path might not be as complete as the previous initial paths. So we
    //    put the previous initial paths together with added paths in this
    //    case.
    //
    // ES modules are free from this defect.

    let nextInitialPaths = exitedWithError
      ? Array.from(new Set([...initialPaths, ...addedPaths]))
      : addedPaths;

    up(nextInitialPaths);
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
