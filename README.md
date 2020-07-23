[![NPM Package](https://badge.fury.io/js/nodemand.svg)](https://www.npmjs.com/package/nodemand)

# 🙅‍ Nodemand

Restart Node.js process on required modules change.

A light-weight alternative to tools like `nodemon` and `node-dev`, watches module files found in `ESMLoader` after start.

## Installation

```bash
yarn global add nodemand
# or
npm install --global nodemand
```

## Usage

```bash
nodemand [options] <module-path> [...args]
# example
nodemand server.js
```

### Options

- `--debounce <delay>`
  Debounce restart after change detection, defaults to 1000.
- `--node-modules`
  Watch also files under node_modules (symbolic links will be resolved before filtering).
- `--color`, `--no-color`
  Force color or no color in console output.
- Other Node.js command line options.

## License

MIT License.
