import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/Science-Around-the-Board/docs/__docusaurus/debug',
    component: ComponentCreator('/Science-Around-the-Board/docs/__docusaurus/debug', '3f0'),
    exact: true
  },
  {
    path: '/Science-Around-the-Board/docs/__docusaurus/debug/config',
    component: ComponentCreator('/Science-Around-the-Board/docs/__docusaurus/debug/config', '16a'),
    exact: true
  },
  {
    path: '/Science-Around-the-Board/docs/__docusaurus/debug/content',
    component: ComponentCreator('/Science-Around-the-Board/docs/__docusaurus/debug/content', '443'),
    exact: true
  },
  {
    path: '/Science-Around-the-Board/docs/__docusaurus/debug/globalData',
    component: ComponentCreator('/Science-Around-the-Board/docs/__docusaurus/debug/globalData', 'afd'),
    exact: true
  },
  {
    path: '/Science-Around-the-Board/docs/__docusaurus/debug/metadata',
    component: ComponentCreator('/Science-Around-the-Board/docs/__docusaurus/debug/metadata', 'c09'),
    exact: true
  },
  {
    path: '/Science-Around-the-Board/docs/__docusaurus/debug/registry',
    component: ComponentCreator('/Science-Around-the-Board/docs/__docusaurus/debug/registry', '755'),
    exact: true
  },
  {
    path: '/Science-Around-the-Board/docs/__docusaurus/debug/routes',
    component: ComponentCreator('/Science-Around-the-Board/docs/__docusaurus/debug/routes', '222'),
    exact: true
  },
  {
    path: '/Science-Around-the-Board/docs/',
    component: ComponentCreator('/Science-Around-the-Board/docs/', '479'),
    routes: [
      {
        path: '/Science-Around-the-Board/docs/',
        component: ComponentCreator('/Science-Around-the-Board/docs/', '974'),
        routes: [
          {
            path: '/Science-Around-the-Board/docs/',
            component: ComponentCreator('/Science-Around-the-Board/docs/', '033'),
            routes: [
              {
                path: '/Science-Around-the-Board/docs/instructor/pedagogy',
                component: ComponentCreator('/Science-Around-the-Board/docs/instructor/pedagogy', '9f1'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Science-Around-the-Board/docs/instructor/technical-guide',
                component: ComponentCreator('/Science-Around-the-Board/docs/instructor/technical-guide', '660'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Science-Around-the-Board/docs/student-guide',
                component: ComponentCreator('/Science-Around-the-Board/docs/student-guide', 'd44'),
                exact: true,
                sidebar: "tutorialSidebar"
              },
              {
                path: '/Science-Around-the-Board/docs/',
                component: ComponentCreator('/Science-Around-the-Board/docs/', '4f2'),
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
