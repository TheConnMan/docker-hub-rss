var dockerHubAPI = require('docker-hub-api');
var RSS = require('rss');
var express = require('express');
var app = express();

var regex_exclude = process.env.DOCKER_HUB_RSS_REGEX_EXCLUDE || false;

app.get('/:username/:repository.atom', function (req, res) {
  var username = req.params.username;
  var repository = req.params.repository;
  if (!username || !repository) {
    res.notFound();
  } else {
    var data = {};
    dockerHubAPI.repository(username, repository).then(repo => {
      data.repo = repo;
      return dockerHubAPI.user(username);
    }).then(user => {
      data.user = user;
      return dockerHubAPI.tags(username, repository, {perPage: 20});
    }).then(images => {
      res.set('Content-Type', 'text/xml');
      res.send(formatRSS(data.repo, data.user, images));
    }).catch(e => {
      console.log(e);
      res.sendStatus(500);
    });
  }
});

app.listen(80, function () {
  console.log('Docker RSS Feed lisening on port 80!');
});

function formatRSS(repo, user, images) {
  var feed = new RSS({
    title: 'Docker Hub Images: ' + repo.user + '/' + repo.name,
    description: repo.description,
    site_url: 'https://hub.docker.com/r/' + repo.user + '/' + repo.name,
    image_url: user.gravatar_url
  });
  (images.results || images).forEach(image => {
    var image = repo.user + '/' + repo.name + ':' + image.name;
    if(regex_exclude && image.match(regex_exclude)){
      return;
    }
    feed.item({
      title: image,
      url: 'https://hub.docker.com/r/' + repo.user + '/' + repo.name,
      guid: image.id + '-' + new Date(image.last_updated).getTime(),
      date: new Date(image.last_updated)
    });
  });
  return feed.xml();
}
