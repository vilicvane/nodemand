const timestamp = Date.now();

let ready = false;

process.nextTick(setup);

process.on('exit', setup);

function setup() {
  if (ready) {
    return;
  }

  ready = true;

  process.send({
    type: 'dear',
    timestamp: timestamp,
    paths: Object.keys(require.cache),
  });
}

// function setup() {
//   let paths = Object.keys(require.cache).filter(path =>
//     Path.relative(__dirname, path).startsWith('..'),
//   );

//   let watcher = Chokidar.watch(paths, {
//     persistent: true,
//   });

//   watcher.on('add', (path, stats) => {
//     if (stats.mtimeMs < timestamp) {
//       return;
//     }

//     process.send({
//       type: 'mtime-outdated',
//       path,
//     });
//   });

//   watcher.on('change', path => {
//     process.send({
//       type: 'file-changed',
//       path,
//     });
//   });
// }
