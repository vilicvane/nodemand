const Path = require('path');

const Chalk = require('chalk');

const HELP = `
${Chalk.green('USAGE')}

  nodemand [options] <module-path> [...args]

${Chalk.green('OPTIONS')}

  --debounce <delay>  Debounce restart after change detection, defaults to 1000.
  --node-modules      Watch also files under node_modules (symbolic links will
                        be resolved before filtering).
  --help              Show this help content.
`;

const OPTION_DEFINITION_MAP = new Map([
  [
    'debounce',
    {
      default: 1000,
      cast: raw => {
        const value = Number(raw);

        if (isNaN(value)) {
          throw `expecting a number but got ${JSON.stringify(raw)}`;
        }

        return value;
      },
    },
  ],
  ['node-modules', true],
  ['color', true],
  ['no-color', true],
]);

const execArgv = [];

const parsedOptionMap = new Map();

const args = process.argv.slice(2);

while (args.length) {
  const [arg] = args;

  if (!arg.startsWith('--')) {
    break;
  }

  const option = args.shift().slice(2);

  if (option === 'help') {
    console.info(HELP);
    process.exit();
  }

  const definition = OPTION_DEFINITION_MAP.get(option);

  if (!definition) {
    // Unknown option to nodemand, forward to Node.js.
    execArgv.push(arg);
    continue;
  }

  if (definition === true) {
    parsedOptionMap.set(option, true);
  } else {
    if (!args.length) {
      console.error(Chalk.red(`Expecting value for option "${option}"`));
      process.exit(1);
    }

    const raw = args.shift();
    let value;

    try {
      value = definition.cast(raw);
    } catch (error) {
      console.error(Chalk.red(`Error casting option "${option}": ${error}`));
      process.exit(1);
    }

    parsedOptionMap.set(option, value);
  }
}

const optionDict = Object.create(null);

for (const [option, definition] of OPTION_DEFINITION_MAP) {
  optionDict[option] = parsedOptionMap.has(option)
    ? parsedOptionMap.get(option)
    : definition === true
    ? false
    : definition.default;
}

if (!args.length) {
  console.error(HELP);
  process.exit(1);
}

const [modulePath, ...restArgs] = args;

exports.execArgv = execArgv;
exports.options = optionDict;
exports.modulePath = Path.resolve(modulePath);
exports.args = restArgs;
