# Docker Hub RSS

[![Build Status](https://github.com/TheConnMan/docker-hub-rss/actions/workflows/build-publish-docker.yaml/badge.svg?branch=master)](https://github.com/TheConnMan/docker-hub-rss) [![Docker Pulls](https://img.shields.io/docker/pulls/theconnman/docker-hub-rss.svg)](https://hub.docker.com/r/theconnman/docker-hub-rss/)

RSS feed for Docker Hub images

## Why?

Docker Hub doesn't provide notifications for new image releases, so **Docker Hub RSS** turns image tags into an RSS feed for easy consumption. Subscribe using [Slack RSS](https://slack.com/apps/new/A0F81R7U7-rss), [Feedly](https://feedly.com/), or any other RSS feed reader to get notified when a new image is published.

## Usage

Point an RSS feed reader at `/<docker-hub-user>/<docker-hub-repo>.atom`. The bare (`/<user>/<repo>`) and `/r/<user>/<repo>` routes serve the same feed, and tags can be filtered with the `include`, `exclude`, `includeRegex`, and `excludeRegex` query params. Use `_` as the user for official images (e.g. `/_/nginx.atom`).

## Running

**Docker Hub RSS** runs four ways. The Local, Docker, and Vercel paths share the Express app (`index.js`, `api/`); Cloudflare runs the equivalent Worker (`src/worker.js`).

The Cloudflare Worker is the recommended way to host a public instance: it needs no server, stays within the Workers free tier for typical feed-reader traffic, and authenticates to Docker Hub so it avoids the anonymous rate limits described below.

### Local (Node)

```bash
yarn install
yarn start          # Express on http://localhost:3000
```

The easiest way to expose a local instance publicly for an RSS reader is to proxy it with [Localtunnel](https://localtunnel.github.io/).

### Docker

```bash
docker run -d -p 3000:3000 --name=docker-hub-rss theconnman/docker-hub-rss:latest
```

### Vercel

```bash
npm i -g vercel
yarn install
vercel dev          # local; deploy with `vercel` (routing in vercel.json)
```

### Cloudflare Workers

Runs as a single [Cloudflare Worker](https://developers.cloudflare.com/workers/) — a free, publicly reachable feed with no server to host. The Worker serves the same routes; the homepage is served from the Wrangler `[assets]` layer, and each feed is cached at the edge (~30 min TTL) so repeat RSS polls don't re-hit Docker Hub.

```bash
yarn install
yarn dev            # wrangler dev — local, no Cloudflare account required
yarn test           # vitest suite (runs in the Workers runtime)
wrangler deploy     # deploy (requires `wrangler login`)
```

The Worker deploys to `*.workers.dev`. On the free tier, `TAGS_FETCH_LIMIT` (a `wrangler.toml` var, default `100`) keeps each request to ~3 Docker Hub subrequests, under the 50-per-request cap.

The deployed Worker requires two secrets — a Docker Hub username and a read-only access token — because Docker Hub rate-limits Cloudflare's shared egress IPs and returns HTTP 429 to anonymous requests; authenticating gives the feed a per-account limit instead:

```bash
npx wrangler secret put DOCKERHUB_USERNAME
npx wrangler secret put DOCKERHUB_TOKEN
```

When the secrets are absent (e.g. `wrangler dev` or the test suite), the Worker falls back to anonymous requests.

## Environment Variables

- **FLUENTD_HOST** (Optional) Fluent host for logging
- **FLUENTD_TAGS** (Optional) Add FluentD context tags (format is tag:value,tag2:value2)
- **TAGS_FETCH_LIMIT** (Optional) Fetch only the given number of tags (before being filtered). Useful for reducing traffic and avoiding possible time-outs.
- **PORT** (Default: 3000) Port to run the service on

## Info Endpoint

`/info` is helper endpoint which provides additional information about the environment including:

- `version`: The version number of this Docker Hub RSS instance
