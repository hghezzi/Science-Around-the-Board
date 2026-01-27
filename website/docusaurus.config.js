// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require('prism-react-renderer').themes.github;
const darkCodeTheme = require('prism-react-renderer').themes.dracula;

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Science Around the Board',
  tagline: 'A Universal Educational Board Game Engine',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://hghezzi.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  baseUrl: '/Science-Around-the-Board/docs/',

  // GitHub pages deployment config.
  organizationName: 'hghezzi', // Usually your GitHub org/user name.
  projectName: 'Science-Around-the-Board', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/', // Serve the docs at the site's root
          sidebarPath: require.resolve('./sidebars.js'),
        },
        blog: false, // Disable the blog plugin
        theme: {
          customCss: require.resolve('../src/css/custom.css'), // We will create a dummy css file
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'Science Around the Board',
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'Documentation',
          },
          {
            href: 'https://github.com/hghezzi/Science-Around-the-Board',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        copyright: `Copyright © ${new Date().getFullYear()} Science Around the Board. Built with Docusaurus.`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
      },
    }),
};

module.exports = config;