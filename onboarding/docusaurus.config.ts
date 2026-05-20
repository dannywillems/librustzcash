import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const config: Config = {
  title: 'librustzcash Onboarding',
  tagline: 'A graduate course on the librustzcash Rust workspace',
  favicon: 'img/favicon.ico',

  // The deployed URL. Update if forking under a different account.
  url: 'https://dannywillems.github.io',
  baseUrl: '/librustzcash/',

  organizationName: 'dannywillems',
  projectName: 'librustzcash',

  onBrokenLinks: 'throw',

  // Parse .md as plain CommonMark, .mdx as MDX. The chapters are
  // dense with LaTeX; CommonMark mode keeps math-adjacent characters
  // (curly braces, angle brackets in inline math, ...) from tripping
  // the stricter MDX parser.
  markdown: {
    format: 'detect',
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
          remarkPlugins: [remarkMath],
          rehypePlugins: [rehypeKatex],
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  // KaTeX stylesheet for math rendering.
  stylesheets: [
    {
      href: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
      type: 'text/css',
      integrity:
        'sha384-nB0miv6/jRmo5EGIE6RDQE0etf4GvjBR1bkf4pcUk2TprLGa0k7/rJkRnCu6WSt6',
      crossorigin: 'anonymous',
    },
  ],

  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        indexDocs: true,
        indexPages: true,
        language: ['en'],
        highlightSearchTermsOnTargetPage: true,
      },
    ],
    // Embed code from GitHub directly via fenced code blocks of the
    // form:
    //
    //   ```rust reference title="path/to/file.rs"
    //   https://github.com/zcash/librustzcash/blob/main/path/to/file.rs#L10-L20
    //   ```
    //
    // The plugin fetches the snippet at build time so the docs
    // always reflect the actual source.
    [
      'docusaurus-theme-github-codeblock',
      {
        // No options; the theme reads URL + reference keyword from
        // the code-block info string directly.
      },
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'librustzcash Onboarding',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Course',
        },
        {
          href: 'https://github.com/dannywillems/librustzcash/tree/onboarding',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      copyright:
        'librustzcash onboarding course. Source on GitHub under MIT OR Apache-2.0.',
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['rust', 'bash', 'toml', 'json', 'yaml'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
