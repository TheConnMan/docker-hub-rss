# Docker Hub RSS

[![Build Status](https://travis-ci.org/TheConnMan/docker-hub-rss.svg?branch=master)](https://travis-ci.org/TheConnMan/docker-hub-rss) [![Docker Pulls](https://img.shields.io/docker/pulls/theconnman/docker-hub-rss.svg)](https://hub.docker.com/r/theconnman/docker-hub-rss/)

RSS feed for Docker Hub images

## Quickstart

Run with Docker by executing: `docker run -d -p 3000:3000 --name=docker-hub-rss theconnman/docker-hub-rss:latest`

To use point an RSS feed reader to `http://<url>:3000/<docker-hub-user>/<docker-hub-repo>.atom`. The easiest way to create a publically accessible endpoint for an RSS reader is to use [Localtunnel](https://localtunnel.github.io/) to proxy a public location to your local **Docker Hub RSS** instance.

## Local Development

To develop locally run the following:

```bash
git clone https://github.com/TheConnMan/docker-hub-rss.git
cd docker-hub-rss
npm install
npm start
```

## Environment Variables

- **FLUENTD_HOST** (Optional) Fluent host for logging
- **FLUENTD_TAGS** (Optional) Add FluentD context tags (format is tag:value,tag2:value2)
