const { app } = require('../license-server/server');

module.exports = (req, res) => {
  return app(req, res);
};
