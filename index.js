var vercel = require('./api/[username]/[repository]');
var info = require('./api/info');

var log4js = require('log4js');

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


app.get('/info', function (req, res) {
  info(req, res);
});

app.get('/r/:username/:repository', function (req, res) {
  req.query.username = req.params.username;
  req.query.repository = req.params.repository;
  vercel(req, res);
});

app.get('/:username/:repository.atom', function (req, res) {
  req.query.username = req.params.username;
  req.query.repository = req.params.repository;
  vercel(req, res);
});

var port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.listen(port, function () {
  console.log(`Docker RSS Feed listening on port ${port}!`);
});
