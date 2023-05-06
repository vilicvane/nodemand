const FS = require('fs');
const Path = require('path');

exports.guessRealPath = path => {
  path = Path.resolve(path);

  const {root} = Path.parse(path);

  let current = path;
  let base = '';

  while (current !== root) {
    try {
      let realPath = FS.realpathSync(current);
      return Path.join(realPath, base);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    const parsed = Path.parse(current);

    current = parsed.dir;
    base = Path.join(parsed.base, base);
  }

  return path;
};
