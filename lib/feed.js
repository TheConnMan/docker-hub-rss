const DOCKER_HUB_BASE = 'https://hub.docker.com/v2';

// Faithful port of docker-hub-api@0.8.0 makeGetRequest: it ignores the HTTP
// status entirely and only rejects when the parsed JSON body "has an error".
function bodyHasError(body) {
  if (body && body.error === true) return true;
  if (body && body.error === false) return false;
  return !!(body && typeof body.detail !== 'undefined');
}

async function dockerHubFetch(url) {
  const res = await fetch(url); // follows redirects by default
  const body = await res.json(); // ignore HTTP status, like docker-hub-api
  if (bodyHasError(body)) {
    throw new Error(JSON.stringify(body));
  }
  return body;
}

async function getAllTags(user, repository, tagsFetchLimit) {
  const limitRaw = Number(tagsFetchLimit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : null;

  let tags = [];
  let page = 1;
  while (!(limit && tags.length >= limit)) {
    const data = await dockerHubFetch(
      `${DOCKER_HUB_BASE}/repositories/${user}/${repository}/tags?page_size=100&page=${page}`,
    );
    const results = data.results || data;
    if (!Array.isArray(results) || results.length === 0) break;
    tags = tags.concat(results);
    page++;
  }
  return tags;
}

// XML-escape plain-text fields (link, image url). CDATA fields stay raw.
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Wrap a value in CDATA, splitting any `]]>` terminator across adjacent CDATA
// blocks (matches the `rss` npm package). Byte-identical to a bare CDATA wrap
// for inputs that contain no `]]>`.
function cdata(str) {
  return `<![CDATA[${String(str).replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

function buildFeedXml(repo, user, images) {
  const title = `${repo.user}/${repo.name} | Docker Hub Images`;
  const link = `https://hub.docker.com/r/${repo.user}/${repo.name}`;

  let out = '<?xml version="1.0" encoding="UTF-8"?>';
  out +=
    '<rss xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
    'xmlns:content="http://purl.org/rss/1.0/modules/content/" ' +
    'xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">';
  out += '<channel>';
  out += `<title>${cdata(title)}</title>`;
  out += `<description>${cdata(repo.description)}</description>`;
  out += `<link>${esc(link)}</link>`;
  if (user.gravatar_url) {
    out += '<image>';
    out += `<url>${esc(user.gravatar_url)}</url>`;
    out += `<title>${title}</title>`;
    out += `<link>${esc(link)}</link>`;
    out += '</image>';
  }
  out += '<generator>RSS for Node</generator>';
  out += `<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`;
  images.forEach((image) => {
    const itemTitle = `${repo.user}/${repo.name}:${image.name}`;
    const itemLink = `${link}/tags?name=${image.name}`;
    const guid = `${image.id}-${new Date(image.last_updated).getTime()}`;
    out += '<item>';
    out += `<title>${cdata(itemTitle)}</title>`;
    out += `<link>${esc(itemLink)}</link>`;
    out += `<guid isPermaLink="false">${esc(guid)}</guid>`;
    out += `<pubDate>${new Date(image.last_updated).toUTCString()}</pubDate>`;
    out += '</item>';
  });
  out += '</channel></rss>';
  return out;
}

// `_` -> `library`, lowercased (used for the repo + tags endpoints).
function resolveRepoUser(username) {
  const lower = String(username).toLowerCase();
  return lower === '_' ? 'library' : lower;
}

// filters: raw query values (strings or undefined).
function filterTags(tags, filters = {}) {
  const include = filters.include ? filters.include.split(',') : [];
  const exclude = filters.exclude ? filters.exclude.split(',') : [];
  const { includeRegex, excludeRegex } = filters;
  return tags.filter(
    (t) =>
      (include.length === 0 || include.includes(t.name)) &&
      (exclude.length === 0 || !exclude.includes(t.name)) &&
      (!includeRegex || t.name.match(new RegExp(includeRegex))) &&
      (!excludeRegex || !t.name.match(new RegExp(excludeRegex))),
  );
}

// Orchestrator both adapters call. Returns the feed XML string.
async function generateFeed({ username, repository, filters, tagsFetchLimit }) {
  const repoUser = resolveRepoUser(username); // repo + tags: _ -> library
  const userSlug = String(username).toLowerCase(); // users endpoint: raw lowercased, NOT mapped
  const repo = await dockerHubFetch(
    `${DOCKER_HUB_BASE}/repositories/${repoUser}/${repository}/`,
  );
  const user = await dockerHubFetch(`${DOCKER_HUB_BASE}/users/${userSlug}/`);
  const tags = await getAllTags(repoUser, repository, tagsFetchLimit);
  const filtered = filterTags(tags, filters);
  return buildFeedXml(repo, user, filtered);
}

module.exports = {
  generateFeed,
  filterTags,
  buildFeedXml,
  dockerHubFetch,
  getAllTags,
  resolveRepoUser,
};
