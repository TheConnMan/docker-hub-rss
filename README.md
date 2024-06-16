# Docker Hub RSS

[![Build Status](https://github.com/TheConnMan/docker-hub-rss/actions/workflows/build-publish-docker.yaml/badge.svg?branch=master)](https://github.com/TheConnMan/docker-hub-rss) [![Docker Pulls](https://img.shields.io/docker/pulls/theconnman/docker-hub-rss.svg)](https://hub.docker.com/r/theconnman/docker-hub-rss/)

RSS feed for Docker Hub images

## Why?

Docker Hub doesn't provide notifications for new image releases, so **Docker Hub RSS** turns image tags into an RSS feed for easy consumption. Subscribe using [Slack RSS](https://slack.com/apps/new/A0F81R7U7-rss), [Feedly](https://feedly.com/), or any other RSS feed reader to get notified when a new image is published.

## Quickstart

Run with Docker by executing: `docker run -d -p 3000:3000 --name=docker-hub-rss theconnman/docker-hub-rss:latest`

To use point an RSS feed reader to `http://<url>:3000/<docker-hub-user>/<docker-hub-repo>.atom`. The easiest way to create a publicly accessible endpoint for an RSS reader is to use [Localtunnel](https://localtunnel.github.io/) to proxy a public location to your local **Docker Hub RSS** instance.

## Local Development

To develop locally run the following:

```bash
npm i -g vercel
git clone https://github.com/TheConnMan/docker-hub-rss.git
cd docker-hub-rss
yarn install
vercel dev
```

## Environment Variables

- **FLUENTD_HOST** (Optional) Fluent host for logging
- **FLUENTD_TAGS** (Optional) Add FluentD context tags (format is tag:value,tag2:value2)
- **TAGS_FETCH_LIMIT** (Optional) Fetch only the given number of tags (before being filtered). Useful for reducing traffic and avoiding possible time-outs.
- **PORT** (Default: 3000) Port to run the service on

## Info Endpoint

`/info` is helper endpoint which provides additional information about the environment including:

- `version`: The version number of this Docker Hub RSS instance
