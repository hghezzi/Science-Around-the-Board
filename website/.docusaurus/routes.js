import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
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
