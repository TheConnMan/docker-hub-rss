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

var express = require('express');

var app = express();

app.use(express.static('public'));

app.get('/:username/:repository.atom', function (req, res) {
  var username = req.params.username;
  var repository = req.params.repository;
  var include = req.query.include ? req.query.include.split(',') : [];
  var exclude = req.query.exclude ? req.query.exclude.split(',') : [];
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
      return dockerHubAPI.tags(username, repository, {perPage: 20});
    }).then(images => {
      var filtered = (images.results || images).filter(image => {
        return (include.length === 0 || include.indexOf(image.name) !== -1) && (exclude.length === 0 || exclude.indexOf(image.name) === -1);
      });
      res.set('Content-Type', 'text/xml');
      res.send(formatRSS(data.repo, data.user, filtered));
    }).catch(e => {
      logger.error(e);
      res.sendStatus(500);
    });
  }
});

app.listen(3000, function () {
  console.log('Docker RSS Feed lisening on port 3000!');
});

function formatRSS(repo, user, images) {
  var feed = new RSS({
    title: 'Docker Hub Images: ' + repo.user + '/' + repo.name,
    description: repo.description,
    site_url: 'https://hub.docker.com/r/' + repo.user + '/' + repo.name,
    image_url: user.gravatar_url
  });
  images.forEach(image => {
    feed.item({
      title: repo.user + '/' + repo.name + ':' + image.name,
      url: 'https://hub.docker.com/r/' + repo.user + '/' + repo.name,
      guid: image.id + '-' + new Date(image.last_updated).getTime(),
      date: new Date(image.last_updated)
    });
  });
  return feed.xml();
}
