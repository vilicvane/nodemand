#!/usr/bin/env node

const ChildProcess = require('child_process');
const Path = require('path');

const Chalk = require('chalk');
const Chokidar = require('chokidar');

const {
  options: {debounce: debounceDelay, 'node-modules': toIncludeNodeModules},
  modulePath,
  args,
} = require('./@cli');

let subprocess;
let exited;

console.info(Chalk.yellow('[nodemand] start'));

up();

process.on('SIGINT', onSignalToExit);
process.on('SIGTERM', onSignalToExit);
process.on('SIGHUP', onSignalToExit);

function up() {
  exited = false;

  subprocess = ChildProcess.fork(modulePath, args, {
    stdio: 'inherit',
    execArgv: [
      '--require',
      Path.join(__dirname, 'injection.js'),
      ...process.execArgv,
    ],
  });

  subprocess.on('message', message => {
    if (!message || typeof message !== 'object') {
      return;
    }

    switch (message.type) {
      case 'setup': {
        let paths = Array.from(new Set([modulePath, ...message.paths]));
        setup(message.timestamp, paths);
        break;
      }
    }
  });

  subprocess.on('exit', code => {
    exited = true;

    if (typeof code === 'number') {
      console.info(
        (code ? Chalk.red : Chalk.green)(
          `[nodemand] process exited with code ${code}`,
        ),
      );
    } else {
      console.info(Chalk.cyan('[nodemand] process exited'));
    }
  });

  function setup(timestamp, paths) {
    paths = paths.filter(path =>
      Path.relative(__dirname, path).startsWith('..'),
    );

    if (!toIncludeNodeModules) {
      paths = paths.filter(path => !/[\\/]node_modules[\\/]/.test(path));
    }

    let watcher = Chokidar.watch(paths, {
      persistent: true,
    });

    watcher.on('add', (path, stats) => {
      if (stats.mtimeMs < timestamp) {
        return;
      }

      scheduleRestart(path);
    });

    watcher.on('change', path => {
      scheduleRestart(path);
    });

    let restartScheduled = false;
    let restartStarted = false;

    let timer;

    function scheduleRestart(path) {
      if (restartStarted) {
        return;
      }

      if (!restartScheduled) {
        restartScheduled = true;

        console.info(Chalk.yellow('[nodemand] restart scheduled'));
      }

      console.info(`  ${Chalk.dim(path)}`);

      clearTimeout(timer);

      timer = setTimeout(() => {
        restart().catch(error => {
          console.error(Chalk.red(error.message));
          process.exit(1);
        });
      }, debounceDelay);
    }

    async function restart() {
      restartStarted = true;

      await watcher.close();

      stopSubprocess();

      console.info(Chalk.yellow('[nodemand] restart'));

      up();
    }
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

  if (!subprocess.kill()) {
    console.error(Chalk.red('Error killing the process'));
    process.exit(1);
  }

  await new Promise(resolve => subprocess.on('exit', resolve));
}
