var dockerHubAPI = require('docker-hub-api');
var RSS = require('rss');
var express = require('express');
var app = express();

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
  (images.results || images).forEach(image => {
    feed.item({
      title: repo.user + '/' + repo.name + ':' + image.name,
      url: 'https://hub.docker.com/r/' + repo.user + '/' + repo.name,
      guid: image.id,
      date: new Date(image.last_updated)
    });
  });
  return feed.xml();
}
