var dockerHubAPI = require('docker-hub-api');
var RSS = require('rss');

var log4js = require('log4js');
var logger = log4js.getLogger();

if (process.env.FLUENTD_HOST) {
  var tags = (process.env.FLUENTD_TAGS ? process.env.FLUENTD_TAGS.split(',') : []).reduce((allTags, tag) => {
    var pair = tag.split(':');
    allTags[pair[0].trim()] = pair.length === 1 ? true : pair[1].trim();
    return allTags;
  }, {});
  tags.function = 'DockerHubRSS';
  log4js.addAppender(require('fluent-logger').support.log4jsAppender('docker-hub-rss', {
    host: process.env.FLUENTD_HOST,
    timeout: 3.0,
    tags: tags
  }));
}

var SDC = require('statsd-client');

var tags = (process.env.STATSD_TAGS ? process.env.STATSD_TAGS.split(',') : []).reduce((allTags, tag) => {
  var pair = tag.split(':');
  allTags[pair[0].trim()] = pair.length === 1 ? true : pair[1].trim();
  return allTags;
}, {});

var statsd = new SDC({
  host: process.env.STATSD_HOST || 'localhost',
  tags: tags
});

var express = require('express');

var app = express();

app.use(express.static('public'));

app.use(statsd.helpers.getExpressMiddleware('rss'));


app.get('/r/:username/:repository', function (req, res) {
  res.redirect(`/${req.params.username}/${req.params.repository}.atom`);
});

app.get('/:username/:repository.atom', function (req, res) {
  statsd.increment('rss.request.count');
  var username = req.params.username;
  var repository = req.params.repository;
  var include = req.query.include ? req.query.include.split(',') : [];
  var includeRegex = req.query.includeRegex;
  var exclude = req.query.exclude ? req.query.exclude.split(',') : [];
  var excludeRegex = req.query.excludeRegex;
  if (!username || !repository) {
    res.notFound();
  } else {
    var data = {};
    logger.info('RSS request for ' + username + '/' + repository);
    dockerHubAPI.repository(username, repository).then(repo => {
      data.repo = repo;
      return dockerHubAPI.user(username);
    }).then(user => {
      data.user = user;
      return getAllTags(username, repository);
    }).then(images => {
      var filtered = images.filter(image => {
        return (include.length === 0 || include.indexOf(image.name) !== -1) &&
          (exclude.length === 0 || exclude.indexOf(image.name) === -1) &&
          (!includeRegex || image.name.match(new RegExp(includeRegex))) &&
          (!excludeRegex || !image.name.match(new RegExp(excludeRegex)));
      });
      res.set('Content-Type', 'text/xml');
      res.send(formatRSS(data.repo, data.user, filtered));
    }).catch(e => {
      logger.error(e);
      res.sendStatus(500);
    });
  }
});

function getAllTags(username, repository) {
  return getTagsRecursive(username, repository, 1, []);
}

function getTagsRecursive(username, repository, page, tags) {
  return dockerHubAPI.tags(username, repository, {
    page
  }).then(tagsPage => {
    if ((tagsPage.results || tagsPage).length === 0) {
      return Promise.resolve(tags);
    }
    return getTagsRecursive(username, repository, page + 1, tags.concat((tagsPage.results || tagsPage)));
  });
}

app.listen(3000, function () {
  console.log('Docker RSS Feed listening on port 3000!');
});

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
