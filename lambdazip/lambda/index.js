// Lambda entry point — re-exports the compiled TypeScript handler.
// The Alexa-hosted Lambda runtime looks for index.handler in the lambda root.
module.exports = require('./dist/index');
