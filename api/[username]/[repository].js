var dockerHubAPI = require('docker-hub-api');
var RSS = require('rss');

var log4js = require('log4js');
var logger = log4js.getLogger();

module.exports = async (req, res) => {
  var username = req.query.username;
  var repository = req.query.repository;
  var include = req.query.include ? req.query.include.split(',') : [];
  var includeRegex = req.query.includeRegex;
  var exclude = req.query.exclude ? req.query.exclude.split(',') : [];
  var excludeRegex = req.query.excludeRegex;
  if (!username || !repository) {
    return res.status(404).send('Not found');
  }
  logger.info('RSS request for ' + username + '/' + repository);
  try {
    const repo = await dockerHubAPI.repository(username, repository);
    const user = await dockerHubAPI.user(username);
    const images = await getAllTags(username, repository);
    var filtered = images.filter(image => {
      return (include.length === 0 || include.indexOf(image.name) !== -1) &&
        (exclude.length === 0 || exclude.indexOf(image.name) === -1) &&
        (!includeRegex || image.name.match(new RegExp(includeRegex))) &&
        (!excludeRegex || !image.name.match(new RegExp(excludeRegex)));
    });
    res.setHeader('Content-Type', 'text/xml');
    res.send(formatRSS(repo, user, filtered));
  } catch (e) {
    logger.error(e);
    res.status(500).send(e.message);
  }
}

async function getAllTags(username, repository) {
  return getTagsRecursive(username, repository, 1, []);
}

async function getTagsRecursive(username, repository, page, tags) {
  const tagsPage = await dockerHubAPI.tags(username, repository, {
    page
  });
  if ("length" in (tagsPage.results || tagsPage) === false || (tagsPage.results || tagsPage).length === 0) {
    return Promise.resolve(tags);
  }
  return getTagsRecursive(username, repository, page + 1, tags.concat((tagsPage.results || tagsPage)));
}

function formatRSS(repo, user, images) {
  var feed = new RSS({
    title: repo.user + '/' + repo.name + ' | Docker Hub Images',
    description: repo.description,
    site_url: 'https://hub.docker.com/r/' + repo.user + '/' + repo.name,
    image_url: user.gravatar_url
  });
  images.forEach(image => {
    feed.item({
      title: repo.user + '/' + repo.name + ':' + image.name,
      url: 'https://hub.docker.com/r/' + repo.user + '/' + repo.name + '/tags?name=' + image.name,
      guid: image.id + '-' + new Date(image.last_updated).getTime(),
      date: new Date(image.last_updated)
    });
  });
  return feed.xml();
}
