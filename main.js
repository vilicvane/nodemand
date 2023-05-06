#!/usr/bin/env node

const ChildProcess = require('child_process');
const Path = require('path');

const Chalk = require('chalk');
const NSFW = require('nsfw');

const {
  execArgv,
  options: {debounce: debounceDelay, 'node-modules': toIncludeNodeModules},
  modulePath,
  args,
} = require('./@cli');

const CHANGED_FILE_PRINTING_LIMIT = 10;
const CWD = process.cwd();

let subprocess;
let exited;
let exitedWithError;

console.info(Chalk.yellow('[nodemand] start'));

void up();

process.on('SIGINT', onSignalToExit);
process.on('SIGTERM', onSignalToExit);
process.on('SIGHUP', onSignalToExit);

async function up(pathSet = new Set()) {
  const reportedPathSet = new Set();

  let restartScheduled = false;
  let restartStarted = false;

  let restartScheduleDebounceTimer;

  let changedFileCount = 0;

  const nsfw = await NSFW(CWD, events => {
    for (let event of events) {
      let paths;

      switch (event.action) {
        case NSFW.actions.RENAMED:
          paths = [
            Path.join(event.directory, event.oldFile),
            Path.join(event.newDirectory, event.newFile),
          ];
          break;
        default:
          paths = [Path.join(event.directory, event.file)];
          break;
      }

      const watchingPaths = [...pathSet, ...reportedPathSet];

      for (const path of paths) {
        for (const watchingPath of watchingPaths) {
          // This handles platform specific stuffs like case sensitivity.
          if (Path.relative(path, watchingPath) === '') {
            scheduleRestart(path);
            break;
          }
        }
      }
    }
  });

  await nsfw.start();

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
        addPaths(message.paths, message.initial);

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

  function addPaths(paths, initial) {
    if (restartScheduled) {
      return;
    }

    paths = paths.filter(
      path =>
        // Exclude nodemand modules.
        Path.relative(__dirname, path).startsWith('..') ||
        // Exclude paths outside of CWD.
        Path.relative(CWD, path).startsWith('..'),
    );

    if (!toIncludeNodeModules) {
      paths = paths.filter(path => !/[\\/]node_modules[\\/]/.test(path));
    }

    for (const path of paths) {
      reportedPathSet.add(path);
    }

    if (initial) {
      pathSet.clear();
    }
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

    await nsfw.stop();

    await stopSubprocess();

    console.info(Chalk.yellow('[nodemand] restart'));

    up(exitedWithError ? reportedPathSet : undefined);
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
