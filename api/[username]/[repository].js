var log4js = require('log4js');
var logger = log4js.getLogger();
var { generateFeed } = require('../../lib/feed');

module.exports = async (req, res) => {
  var username = req.query.username;
  var repository = req.query.repository;
  if (!username || !repository) {
    return res.status(404).send('Not found');
  }
  logger.info('RSS request for ' + username + '/' + repository);
  try {
    const xml = await generateFeed({
      username,
      repository,
      filters: {
        include: req.query.include,
        exclude: req.query.exclude,
        includeRegex: req.query.includeRegex,
        excludeRegex: req.query.excludeRegex,
      },
      tagsFetchLimit: process.env.TAGS_FETCH_LIMIT,
    });
    res.setHeader('Content-Type', 'text/xml');
    res.send(xml);
  } catch (e) {
    logger.error(e);
    res.status(500).send(e.message);
  }
};
