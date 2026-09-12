'use strict';

const { catalogs } = require('./catalogs');

const enabledCatalogs = catalogs
  .filter((catalog) => catalog.enabled === true)
  .map((catalog) => ({
    type: catalog.type,
    id: catalog.id,
    name: catalog.name,
    extra: [
      {
        name: 'skip',
        isRequired: false,
      },
    ],
  }));

module.exports = {
  id: 'community.nostalgiarewind.catalogs',
  version: '1.0.1',
  name: 'Nostalgia Rewind',
  description:
    'A curated nostalgia collection of TV series and movies from the 1990s and early 2000s.',
  logo: 'https://2f680d7c8e22-nostalgia-rewind.baby-beamup.club/public/Nostalgia-Rewind.png',
  resources: [
    {
      name: 'catalog',
      types: ['series', 'movie'],
    },
  ],
  types: ['series', 'movie'],
  catalogs: enabledCatalogs,
  behaviorHints: {
    configurable: false,
    configurationRequired: false,
  },
};
