#!/usr/bin/env node

const ChildProcess = require('child_process');
const Path = require('path');

const Chalk = require('chalk');
const Chokidar = require('chokidar');

const {options, modulePath, args} = require('./@cli');

up();

function up() {
  let subprocess = ChildProcess.fork(modulePath, args, {
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
    console.info(
      (code ? Chalk.red : Chalk.green)(
        `[nodemand] process exited with code ${code}`,
      ),
    );
  });

  function setup(timestamp, paths) {
    paths = paths.filter(path =>
      Path.relative(__dirname, path).startsWith('..'),
    );

    if (!options['node-modules']) {
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

        console.info(Chalk.yellow(`[nodemand] restart scheduled`));
      }

      console.info(`  ${Chalk.dim(path)}`);

      clearTimeout(timer);

      timer = setTimeout(() => {
        restart().catch(error => {
          console.error(Chalk.red(error.message));
          process.exit(1);
        });
      }, options['debounce']);
    }

    async function restart() {
      restartStarted = true;

      console.info(Chalk.yellow(`[nodemand] restart`));

      if (subprocess.connected && !subprocess.kill()) {
        console.error(Chalk.red(`Error killing the process ${subprocess.pid}`));
        process.exit(1);
      }

      await watcher.close();

      up();
    }
  }
}
