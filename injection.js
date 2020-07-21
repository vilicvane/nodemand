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
    type: 'setup',
    timestamp: timestamp,
    paths: Object.keys(require.cache),
  });
}
