const fs = require('fs');
const vm = require('vm');

function loadScript(filePath, extraContext = {}) {
  const code = fs.readFileSync(filePath, 'utf8');
  const context = {
    console,
    Promise,
    setTimeout,
    clearTimeout,
    ...extraContext,
  };

  vm.createContext(context);
  vm.runInContext(code, context, { filename: filePath });
  return context;
}

module.exports = { loadScript };