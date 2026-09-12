'use strict';

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const manifest = require('./manifest');
const { catalogs } = require('./catalogs');
const shows = require('./shows');
const movies = require('./movies');
const PORT = Number.parseInt(process.env.PORT || '7001', 10);
const CATALOG_PAGE_SIZE = 100;
const RPDB_API_KEY = 't0-free-rpdb-blocks';
const RPDB_POSTER_BASE = `https://api.ratingposterdb.com/${RPDB_API_KEY}/imdb/poster-default`;
const builder = new addonBuilder(manifest);

const datasetsByType = new Map([
  ['series', shows],
  ['movie', movies],
]);

const enabledCatalogsByKey = new Map(
  catalogs
    .filter((catalog) => catalog.enabled === true)
    .map((catalog) => [`${catalog.type}:${catalog.id}`, catalog])
);

function itemDisplayName(item) {
  return item.displayName || item.name;
}

const alphabeticalCollator = new Intl.Collator('en-US', {
  sensitivity: 'base',
  numeric: true,
});

function alphabeticalSortKey(item) {
  return itemDisplayName(item)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^[^\p{L}\p{N}]+/gu, '')
    .trim();
}

function alphabeticalGroup(item) {
  const key = alphabeticalSortKey(item);

  if (/^[0-9]/.test(key)) {
    return 0;
  }

  if (/^[A-Za-z]/.test(key)) {
    return 1;
  }

  return 2;
}

function compareNames(a, b) {
  return (
    alphabeticalGroup(a) - alphabeticalGroup(b) ||
    alphabeticalCollator.compare(alphabeticalSortKey(a), alphabeticalSortKey(b)) ||
    alphabeticalCollator.compare(itemDisplayName(a), itemDisplayName(b))
  );
}

function sortItems(items, mode) {
  const copy = [...items];

  if (mode === 'alphabetical') {
    return copy.sort(compareNames);
  }

  if (mode === 'chronological') {
    return copy.sort((a, b) => a.startYear - b.startYear || compareNames(a, b));
  }

  return copy.sort(
    (a, b) =>
      b.featuredRank - a.featuredRank ||
      a.startYear - b.startYear ||
      compareNames(a, b)
  );
}

function dedupeByImdbId(items) {
  const seen = new Set();

  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

function parseSkip(extra) {
  const raw = extra && extra.skip;
  const value = Number.parseInt(raw || '0', 10);

  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}

function releaseInfo(item) {
  if (!item.endYear || item.endYear === item.startYear) {
    return String(item.startYear);
  }

  return `${item.startYear}-${item.endYear}`;
}

function posterUrl(imdbId) {
  return `${RPDB_POSTER_BASE}/${imdbId}.jpg?fallback=true`;
}

function toMetaPreview(item) {
  const preview = {
    id: item.id,
    type: item.type,
    name: itemDisplayName(item),
    poster: posterUrl(item.id),
    posterShape: 'poster',
    releaseInfo: releaseInfo(item),
  };

  if (Array.isArray(item.genres) && item.genres.length > 0) {
    preview.genres = [...item.genres];
  }

  return preview;
}

function hasAnyTag(item, tags) {
  return Array.isArray(tags) && tags.some((tag) => item.tags.includes(tag));
}

function matchesCatalog(item, catalog) {
  if (item.enabled !== true || item.type !== catalog.type || !Array.isArray(item.tags)) {
    return false;
  }

  let included = false;

  if (catalog.match === 'all') {
    included = true;
  } else if (catalog.match === 'tags-any') {
    included = hasAnyTag(item, catalog.tags);
  } else if (catalog.match === 'tag') {
    included = item.tags.includes(catalog.tag);
  }

  if (!included) {
    return false;
  }

  if (hasAnyTag(item, catalog.excludeTags)) {
    return false;
  }

  return true;
}

builder.defineCatalogHandler(async ({ type, id, extra }) => {
  const catalog = enabledCatalogsByKey.get(`${type}:${id}`);
  const dataset = datasetsByType.get(type);

  if (!catalog || !dataset) {
    return { metas: [] };
  }

  const matchingItems = dataset.filter((item) => matchesCatalog(item, catalog));
  const orderedItems = sortItems(dedupeByImdbId(matchingItems), catalog.sort);
  const skip = parseSkip(extra);
  const page = orderedItems.slice(skip, skip + CATALOG_PAGE_SIZE);

  return {
    metas: page.map(toMetaPreview),
    cacheMaxAge: 0,
  };
});

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`);
}

const enabledSeriesCatalogs = manifest.catalogs.filter(
  (catalog) => catalog.type === 'series'
).length;
const enabledMovieCatalogs = manifest.catalogs.filter(
  (catalog) => catalog.type === 'movie'
).length;

console.log(
  `Nostalgia Rewind v${manifest.version}: ` +
    `${enabledSeriesCatalogs} series catalogs, ` +
    `${enabledMovieCatalogs} movie catalogs on port ${PORT}`
);

serveHTTP(builder.getInterface(), {
  port: PORT,
  cacheMaxAge: 0,
  static: '/public',
});