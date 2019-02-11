# Docker Hub RSS

[![Build Status](https://travis-ci.org/TheConnMan/docker-hub-rss.svg?branch=master)](https://travis-ci.org/TheConnMan/docker-hub-rss) [![Docker Pulls](https://img.shields.io/docker/pulls/theconnman/docker-hub-rss.svg)](https://hub.docker.com/r/theconnman/docker-hub-rss/)

RSS feed for Docker Hub images

## Why?

Docker Hub doesn't provide notifications for new image releases, so **Docker Hub RSS** turns image tags into an RSS feed for easy consumption. Subscribe using [Slack RSS](https://slack.com/apps/new/A0F81R7U7-rss), [Feedly](https://feedly.com/), or any other RSS feed reader to get notified when a new image is published.

## Quickstart

Run with Docker by executing: `docker run -d -p 3000:3000 --name=docker-hub-rss theconnman/docker-hub-rss:latest`

To use point an RSS feed reader to `http://<url>:3000/<docker-hub-user>/<docker-hub-repo>.atom`. The easiest way to create a publically accessible endpoint for an RSS reader is to use [Localtunnel](https://localtunnel.github.io/) to proxy a public location to your local **Docker Hub RSS** instance.

## Local Development

To develop locally run the following:

```bash
git clone https://github.com/TheConnMan/docker-hub-rss.git
cd docker-hub-rss
yarn install
yarn start
```

## Environment Variables

- **FLUENTD_HOST** (Optional) Fluent host for logging
- **FLUENTD_TAGS** (Optional) Add FluentD context tags (format is tag:value,tag2:value2)
- STATSD_HOST (default: localhost) - StatsD hostname
- STATSD_TAGS (Optional) - StatsD tags
