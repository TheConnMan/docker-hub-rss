var log4js = require('log4js');
var logger = log4js.getLogger();

var pjson = require('../package.json');

module.exports = async (req, res) => {
  res.json({
    version: pjson.version
  });
}