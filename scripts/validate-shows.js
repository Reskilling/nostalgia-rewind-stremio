'use strict';

const path = require('path');
const shows = require(path.join(__dirname, '..', 'shows'));
const movies = require(path.join(__dirname, '..', 'movies'));
const {
  catalogs,
  KNOWN_TAGS,
  SORT_MODES,
  MEDIA_TYPES,
  MATCH_MODES,
} = require(path.join(__dirname, '..', 'catalogs'));
const manifest = require(path.join(__dirname, '..', 'manifest'));

const errors = [];
const knownTags = new Set(KNOWN_TAGS);

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function validateDataset(items, expectedType, label) {
  if (!Array.isArray(items)) {
    errors.push(`${label} must export an array.`);
    return;
  }

  const ids = new Set();
  const titles = new Map();

  for (const [index, item] of items.entries()) {
    const where = `${label}[${index}]`;

    if (!item || typeof item !== 'object') {
      errors.push(`${where} is not a valid record.`);
      continue;
    }

    if (!/^tt\d+$/.test(item.id || '')) {
      errors.push(`${where} has invalid IMDb ID: ${item.id}`);
    } else if (ids.has(item.id)) {
      errors.push(`${label} has duplicate IMDb ID: ${item.id}`);
    } else {
      ids.add(item.id);
    }

    if (item.type !== expectedType) {
      errors.push(`${where} has type ${item.type}; expected ${expectedType}.`);
    }

    if (typeof item.name !== 'string' || !item.name.trim()) {
      errors.push(`${where} has no valid name.`);
    }

    if (!Number.isInteger(item.startYear)) {
      errors.push(`${where} has invalid startYear.`);
    }

    if (!Array.isArray(item.tags)) {
      errors.push(`${where} has no tags array.`);
    } else {
      const seenTags = new Set();
      for (const tag of item.tags) {
        if (seenTags.has(tag)) {
          errors.push(`${where} repeats tag: ${tag}`);
        }
        seenTags.add(tag);

        if (tag.startsWith('catalog-')) {
          errors.push(`${where} still contains synthetic tag: ${tag}`);
        }

        if (!knownTags.has(tag)) {
          errors.push(`${where} uses unknown tag: ${tag}`);
        }
      }
    }

    const names = [item.name, ...(Array.isArray(item.alternateTitles) ? item.alternateTitles : [])];
    for (const title of names) {
      const normalized = normalizeTitle(title);
      if (!normalized) continue;

      const previous = titles.get(normalized);
      if (previous && previous !== item.id) {
        errors.push(`${label} title/alias collision: "${title}" (${previous}, ${item.id}).`);
      } else {
        titles.set(normalized, item.id);
      }
    }
  }
}

function hasAnyTag(item, tags) {
  return Array.isArray(tags) && tags.some((tag) => item.tags.includes(tag));
}

function matchesCatalog(item, catalog) {
  if (item.enabled !== true || item.type !== catalog.type || !Array.isArray(item.tags)) {
    return false;
  }

  let included = false;
  if (catalog.match === 'all') included = true;
  if (catalog.match === 'tag') included = item.tags.includes(catalog.tag);
  if (catalog.match === 'tags-any') included = hasAnyTag(item, catalog.tags);

  return included && !hasAnyTag(item, catalog.excludeTags);
}

validateDataset(shows, 'series', 'shows');
validateDataset(movies, 'movie', 'movies');

const catalogKeys = new Set();
for (const catalog of catalogs) {
  const key = `${catalog.type}:${catalog.id}`;

  if (catalogKeys.has(key)) {
    errors.push(`Duplicate catalog key: ${key}`);
  }
  catalogKeys.add(key);

  if (!MEDIA_TYPES.includes(catalog.type)) {
    errors.push(`${catalog.id} has invalid media type: ${catalog.type}`);
  }

  if (!MATCH_MODES.includes(catalog.match)) {
    errors.push(`${catalog.id} has invalid match mode: ${catalog.match}`);
  }

  if (!SORT_MODES.includes(catalog.sort)) {
    errors.push(`${catalog.id} has invalid sort mode: ${catalog.sort}`);
  }

  const configuredTags = [
    ...(catalog.tag ? [catalog.tag] : []),
    ...(Array.isArray(catalog.tags) ? catalog.tags : []),
    ...(Array.isArray(catalog.excludeTags) ? catalog.excludeTags : []),
  ];

  for (const tag of configuredTags) {
    if (!knownTags.has(tag)) {
      errors.push(`${catalog.id} references unknown tag: ${tag}`);
    }
  }

  if (catalog.enabled === true) {
    const dataset = catalog.type === 'series' ? shows : movies;
    const count = dataset.filter((item) => matchesCatalog(item, catalog)).length;
    if (count === 0) {
      errors.push(`${catalog.id} is enabled but matches zero records.`);
    }
  }
}

if (manifest.id !== 'community.nostalgiarewind.catalogs') {
  errors.push(`Unexpected manifest ID: ${manifest.id}`);
}
if (manifest.name !== 'Nostalgia Rewind') {
  errors.push(`Unexpected manifest name: ${manifest.name}`);
}
if (manifest.version !== '1.0.0') {
  errors.push(`Unexpected manifest version: ${manifest.version}`);
}

if (errors.length > 0) {
  console.error(`Validation failed with ${errors.length} error(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Validation passed: ${shows.length} shows, ${movies.length} movies, ${catalogs.length} catalogs.`);
for (const catalog of catalogs.filter((item) => item.enabled === true)) {
  const dataset = catalog.type === 'series' ? shows : movies;
  const count = dataset.filter((item) => matchesCatalog(item, catalog)).length;
  console.log(`${catalog.name}: ${count}`);
}
