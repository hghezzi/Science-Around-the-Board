import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/Science-Around-the-Board/docs/__docusaurus/debug',
    component: ComponentCreator('/Science-Around-the-Board/docs/__docusaurus/debug', '7a6'),
    exact: true
  },
  {
    path: '/Science-Around-the-Board/docs/__docusaurus/debug/config',
    component: ComponentCreator('/Science-Around-the-Board/docs/__docusaurus/debug/config', 'b2e'),
    exact: true
  },
  {
    path: '/Science-Around-the-Board/docs/__docusaurus/debug/content',
    component: ComponentCreator('/Science-Around-the-Board/docs/__docusaurus/debug/content', '365'),
    exact: true
  },
  {
    path: '/Science-Around-the-Board/docs/__docusaurus/debug/globalData',
    component: ComponentCreator('/Science-Around-the-Board/docs/__docusaurus/debug/globalData', 'e05'),
    exact: true
  },
  {
    path: '/Science-Around-the-Board/docs/__docusaurus/debug/metadata',
    component: ComponentCreator('/Science-Around-the-Board/docs/__docusaurus/debug/metadata', '14c'),
    exact: true
  },
  {
    path: '/Science-Around-the-Board/docs/__docusaurus/debug/registry',
    component: ComponentCreator('/Science-Around-the-Board/docs/__docusaurus/debug/registry', 'e1c'),
    exact: true
  },
  {
    path: '/Science-Around-the-Board/docs/__docusaurus/debug/routes',
    component: ComponentCreator('/Science-Around-the-Board/docs/__docusaurus/debug/routes', '488'),
    exact: true
  },
  {
    path: '/Science-Around-the-Board/docs/',
    component: ComponentCreator('/Science-Around-the-Board/docs/', 'd27'),
    routes: [
      {
        path: '/Science-Around-the-Board/docs/',
        component: ComponentCreator('/Science-Around-the-Board/docs/', '334'),
        routes: [
          {
            path: '/Science-Around-the-Board/docs/',
            component: ComponentCreator('/Science-Around-the-Board/docs/', '21f'),
            routes: [
              {
                path: '/Science-Around-the-Board/docs/instructor/pedagogy',
                component: ComponentCreator('/Science-Around-the-Board/docs/instructor/pedagogy', 'b00'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Science-Around-the-Board/docs/instructor/technical-guide',
                component: ComponentCreator('/Science-Around-the-Board/docs/instructor/technical-guide', 'c2e'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Science-Around-the-Board/docs/student-guide',
                component: ComponentCreator('/Science-Around-the-Board/docs/student-guide', '6ac'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Science-Around-the-Board/docs/',
                component: ComponentCreator('/Science-Around-the-Board/docs/', '213'),
                exact: true,
                sidebar: "tutorialSidebar"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
