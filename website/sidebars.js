/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  tutorialSidebar: [
    'intro',
    'student-guide',
    {
      type: 'category',
      label: 'Instructor Guide',
      items: ['instructor/pedagogy', 'instructor/technical-guide'],
    },
  ],
};

module.exports = sidebars;