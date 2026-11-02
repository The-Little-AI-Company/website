/**
 * The copy, links, images and numbers each page must carry, written out once. The unit tests compare
 * the built pages with it and the end-to-end tests take their strings from it, so a copy edit is made
 * here and in src/ and nowhere else. It is written apart from src/data on purpose: a wrong edit to the
 * source cannot also change what the tests expect.
 *
 * Copy is compared exactly, so the curly quotes and apostrophes the site is typed with are written here too.
 */
import { SITE, SITE_NAME, type PageId } from './dist';
import { themeColor } from './tokens';

export const VERSION_PATTERN = /^v\d+\.\d+\.\d+$/;
export const RELEASED_PATTERN = /^Released · v\d+\.\d+\.\d+$/;

// ---------------------------------------------------------------------------
// Head and chrome

export const HEAD = {
  ogImage: `${SITE}/og.png`,
  ogImageWidth: '1200',
  ogImageHeight: '630',
  twitterCard: 'summary_large_image',
  colorScheme: 'light dark',
  // The browser chrome wears the ground of the theme it is in, so these are the ground tokens.
  themeColorLight: { content: themeColor('company-light', 'ground'), media: '(prefers-color-scheme: light)' },
  themeColorDark: { content: themeColor('company-dark', 'ground'), media: '(prefers-color-scheme: dark)' },
  favicons: [
    { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
    { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    { rel: 'manifest', href: '/site.webmanifest' },
  ],
  /** Preloaded, in this order, with `crossorigin`. The italic is never preloaded. */
  preloads: ['/fonts/instrument-serif-latin.woff2', '/fonts/instrument-sans-latin.woff2'],
} as const;

export const FOOTER = {
  line: 'The Little AI Company · Jeff Kazzee · rural Idaho',
  links: [
    { label: 'jeff@littleaicompany.com', href: 'mailto:jeff@littleaicompany.com' },
    { label: 'GitHub', href: 'https://github.com/The-Little-AI-Company' },
    { label: 'JeffKazzee.dev', href: 'https://jeffkazzee.dev' },
  ],
  note: 'This site sets no cookies, loads nothing from third parties, and keeps no analytics.',
} as const;

export const SKIP_LINK = { label: 'Skip to content', href: '#main' } as const;

// ---------------------------------------------------------------------------
// Fonts and images

export const FONT_FILES = [
  'instrument-serif-latin.woff2',
  'instrument-serif-italic-latin.woff2',
  'instrument-sans-latin.woff2',
] as const;

export const FONT_FACES = [
  { family: 'Instrument Serif', file: 'instrument-serif-latin.woff2', weight: '400' },
  { family: 'Instrument Serif Italic', file: 'instrument-serif-italic-latin.woff2', weight: '400' },
  { family: 'Instrument Sans', file: 'instrument-sans-latin.woff2', weight: '400 700' },
] as const;

export const OFL_FILES = {
  'OFL-instrument-serif.txt': 'Copyright 2022 The Instrument Serif Project Authors (https://github.com/Instrument/instrument-serif)',
  'OFL-instrument-sans.txt': 'Copyright 2022 The Instrument Sans Project Authors (https://github.com/Instrument/instrument-sans)',
} as const;

export interface ImageFile {
  src: string;
  width: number;
  height: number;
}

/** The full-size images and the size each is made at. */
export const IMAGES = {
  mascot760: { src: '/images/vivary-mascot-skate-760.webp', width: 760, height: 678 },
  mascot640: { src: '/images/vivary-mascot-skate-640.webp', width: 640, height: 571 },
  workspace: { src: '/images/vivary-workspace-2026-10-03.webp', width: 1200, height: 844 },
  vivarySite: { src: '/images/vivary-site-2026-10-08.webp', width: 1200, height: 750 },
  factbook: { src: '/images/open-world-factbook-2026-10-08.webp', width: 960, height: 600 },
  arcade: { src: '/images/llm-arcade-jeffkazzee-dev.webp', width: 960, height: 600 },
  puckwork: { src: '/images/puckwork-jeffkazzee-dev.webp', width: 960, height: 548 },
  neonNoir: { src: '/images/neon-noir-2026-10-08.webp', width: 960, height: 600 },
} as const satisfies Record<string, ImageFile>;

export interface ImageVariant {
  src: string;
  width: number;
  height: number;
  /** The full-size image this is a smaller copy of. */
  of: ImageFile;
}

/** Smaller copies that `srcset` serves to narrow screens, written by scripts/images.mjs. */
export const IMAGE_VARIANTS = {
  workspace: { src: '/images/vivary-workspace-2026-10-03-600.webp', width: 600, height: 422, of: IMAGES.workspace },
  vivarySite: { src: '/images/vivary-site-2026-10-08-640.webp', width: 640, height: 400, of: IMAGES.vivarySite },
  factbook: { src: '/images/open-world-factbook-2026-10-08-320.webp', width: 320, height: 200, of: IMAGES.factbook },
  arcade: { src: '/images/llm-arcade-jeffkazzee-dev-320.webp', width: 320, height: 200, of: IMAGES.arcade },
  puckwork: { src: '/images/puckwork-jeffkazzee-dev-320.webp', width: 320, height: 183, of: IMAGES.puckwork },
  neonNoir: { src: '/images/neon-noir-2026-10-08-320.webp', width: 320, height: 200, of: IMAGES.neonNoir },
} as const satisfies Record<string, ImageVariant>;

const CALLOUT_QUOTE = 'Signals in the text itself. Not a truth check.';

/** The facts plate for Callout. The home page and the Callout page show the same one. */
export const CALLOUT_PLATE = {
  rows: [
    { term: 'Runs on', detail: 'Windows 10 and 11' },
    { term: 'Version', detail: VERSION_PATTERN },
    { term: 'License', detail: 'MIT' },
    { term: 'API keys', detail: 'Yours, kept in Windows Credential Manager' },
  ],
  /** The words the data carries. */
  quote: CALLOUT_QUOTE,
  /** The same words as the plate sets them: in curly quotes, since they are upright display type and not italic. */
  quoteShown: `“${CALLOUT_QUOTE}”`,
  quoteCaption: 'The header on every Callout result.',
} as const;

// ---------------------------------------------------------------------------
// Home

export const HOME = {
  title: SITE_NAME,
  description: 'The Little AI Company makes Callout, which checks what you read, and Vivary, a desktop workspace for AI agents. Both keep you in charge.',
  now: 'Vivary 0.1.0-beta.1 is out for Windows. Published Nov 1, 2026.',
  h1: 'Tools for the work you keep doing by hand.',
  lede:
    'The Little AI Company makes Callout, a hotkey that checks what you read, and Vivary, a desktop workspace for AI agents. Small tools that keep you in charge of the AI you use.',
  buttons: [
    { label: 'Get Callout', href: '/callout/#get-it', variant: 'primary' },
    { label: 'See Vivary', href: '/vivary/', variant: 'secondary' },
  ],
  mascot: {
    phoneMedia: '(max-width: 860px)',
    phone: IMAGES.mascot640,
    desktop: IMAGES.mascot760,
    alt: 'The Vivary mascot, a felt creature with antlers, riding a skateboard with a paintbrush, a potted flower, and a notebook.',
  },
  vivary: {
    numeral: 'I. The main project',
    title: 'Vivary',
    plate: {
      ...IMAGES.workspace,
      alt: 'The Vivary window: a project list and conversations in a sidebar, an empty chat headed “What are we working on?”, and a notice asking you to sign in to Claude Code.',
      caption: 'Development build, Oct 3, 2026, a month before beta.1.',
      small: IMAGE_VARIANTS.workspace,
    },
    body:
      'A desktop workspace for working with AI agents on your own projects. Agent chat, project files, tools, and memory sit in one Windows app. For coding conversations it uses Claude Code or Codex, installed and signed in on the same computer. Vivary has no account of its own and includes no model access. Release notes and download.',
    bodyLink: { label: 'Release notes and download', href: 'https://github.com/vivary-dev/vivary/releases/tag/v0.1.0-beta.1' },
    tone: 'wip',
    status: 'Beta · v0.1.0-beta.1 · Nov 1, 2026',
    button: { label: 'More about Vivary', href: '/vivary/' },
  },
  callout: {
    numeral: 'II. Ready to download',
    title: 'Callout',
    plate: CALLOUT_PLATE,
    tone: 'shipped',
    button: { label: 'More about Callout', href: '/callout/' },
  },
  other: {
    heading: 'Other projects',
    maxWidth: 940,
  },
  how: {
    heading: 'How the tools work',
    text: 'Memory in files you can open. Claims with the sources behind them. Nothing runs that you can’t see, stop, or undo.',
    lanes: [
      { term: 'You decide', detail: 'The tool proposes and you approve. A human gate is a feature, not a speed bump.' },
      { term: 'You can read everything', detail: 'State is plain files on a machine you control, not a hosted store you cannot open.' },
      { term: 'You keep learning', detail: 'A tool that thinks for you leaves you weaker. These tools show their work so you get sharper.' },
      { term: 'Sources or silence', detail: 'Every claim carries where it came from. Unsure is a real answer.' },
    ],
  },
} as const;

export interface ProjectExpectation {
  title: string;
  line: string;
  tone: 'shipped' | 'alpha' | 'demo';
  status: string;
  href: string;
  linkLabel: string;
  image: ImageFile;
  thumb: ImageVariant;
}

/** The four "other things I have made", in the order they appear. */
export const PROJECTS = [
  {
    title: 'Open World Factbook',
    line: 'An open-source database of 262 countries and territories.',
    tone: 'shipped',
    status: 'Shipped',
    href: 'https://worldfactbook.xyz',
    linkLabel: 'worldfactbook.xyz',
    image: IMAGES.factbook,
    thumb: IMAGE_VARIANTS.factbook,
  },
  {
    title: 'LLM Arcade',
    line: 'A social arcade with 11 games. AI agents wrote every line.',
    tone: 'alpha',
    status: 'Alpha',
    href: 'https://llmarcade.fun',
    linkLabel: 'llmarcade.fun',
    image: IMAGES.arcade,
    thumb: IMAGE_VARIANTS.arcade,
  },
  {
    title: 'Puckwork',
    line: 'Air hockey with a simulated air cushion, in one canvas file.',
    tone: 'demo',
    status: 'Demo',
    href: 'https://puckwork.vercel.app',
    linkLabel: 'puckwork.vercel.app',
    image: IMAGES.puckwork,
    thumb: IMAGE_VARIANTS.puckwork,
  },
  {
    title: 'Neon Noir Detective Agency',
    line: 'A fictional agency site in pure HTML and CSS.',
    tone: 'demo',
    status: 'Demo',
    href: 'https://neon-noir-detective-agency.vercel.app',
    linkLabel: 'neon-noir-detective-agency.vercel.app',
    image: IMAGES.neonNoir,
    thumb: IMAGE_VARIANTS.neonNoir,
  },
] as const satisfies readonly ProjectExpectation[];

// ---------------------------------------------------------------------------
// Callout page

export interface LaneExpectation {
  term: string;
  detail: string;
}

export interface SectionExpectation {
  heading: string;
  /** Paragraphs outside the lanes, in order. */
  paragraphs: readonly string[];
  lanes: readonly LaneExpectation[];
}

export const CALLOUT_PAGE = {
  h1: 'Callout',
  lede: 'Press a key. Get the receipts.',
  buttons: [
    { label: 'Download for Windows', href: 'https://github.com/The-Little-AI-Company/callout/releases/latest/download/Callout-Setup.exe', variant: 'primary' },
    { label: 'Source on GitHub', href: 'https://github.com/The-Little-AI-Company/callout', variant: 'secondary' },
  ],
  description:
    'Press a hotkey over any text. Callout says whether it is trying to manipulate you and whether its claims hold up. Windows, bring your own keys, no server.',
  /** The plate beside the hero text: the same rows, quote and caption as the Callout feature on the home page. */
  plate: CALLOUT_PLATE,
  sections: [
    {
      heading: 'What it does',
      paragraphs: [
        'Select text anywhere on Windows, press the hotkey, and a small popover answers two questions.',
      ],
      lanes: [
        {
          term: 'Fast lane, under a second',
          detail:
            'Is this text trying to manipulate you? Callout scores the passage against a battery of manipulation signals, such as false urgency, loaded framing, and appeals that stand in for evidence.',
        },
        {
          term: 'Deep lane, a few seconds',
          detail:
            'Do the specific claims hold up? Callout pulls out the checkable claims, looks first at the sources the text cites, then searches the web, and shows you what it found. Nothing is shown without a source. Unsure is a real answer.',
        },
      ],
    },
    {
      heading: 'How it works',
      paragraphs: [
        'Three parts with one rule between them. The model that judges never writes prose, and the model that writes prose never judges.',
      ],
      lanes: [
        {
          term: 'A judging model',
          detail:
            'Returns probabilities, never sentences. It scores what kind of content this is, the manipulation signals in it, whether a passage is relevant, whether evidence supports a claim, and every sentence the helper writes.',
        },
        {
          term: 'A writing helper',
          detail:
            'Any OpenAI-compatible or Anthropic endpoint. It extracts claims, drafts search queries, reads screenshots, and writes the two-sentence summary. Everything it writes goes back through the judge.',
        },
        {
          term: 'A rules file',
          detail: 'Every threshold, cap, and question lives in one readable file in the repository. Nothing is tuned behind a server.',
        },
      ],
    },
    {
      heading: 'What stays on your machine',
      paragraphs: [],
      lanes: [
        {
          term: 'No server',
          detail:
            'No account, no telemetry. The text you check goes to the three APIs you configure and to the pages Callout fetches for evidence, and nowhere else.',
        },
        { term: 'Your keys', detail: 'You bring your own API keys. They sit in Windows Credential Manager, never in a plain-text file.' },
        { term: 'Your history', detail: 'Off by default. Usage counters stay local.' },
      ],
    },
  ] as const satisfies readonly SectionExpectation[],
  get: {
    heading: 'Get it',
    id: 'get-it',
    lede: 'Download the installer for Windows 10 and 11, run it, and paste your API keys into Settings. No account. Open source under MIT.',
    button: { label: 'Download for Windows', href: 'https://github.com/The-Little-AI-Company/callout/releases/latest/download/Callout-Setup.exe' },
    note: 'The installer is unsigned for now, so Windows SmartScreen warns on first run. Choose More info, then Run anyway. The source is on GitHub if you’d rather build it yourself.',
  },
} as const;

// ---------------------------------------------------------------------------
// Vivary page

export const VIVARY_PAGE = {
  h1: 'Vivary',
  lede: 'Your projects. Your agents. Your machine.',
  status: 'Beta · v0.1.0-beta.1 · Nov 1, 2026',
  buttons: [
    { label: 'Download 0.1.0-beta.1', href: 'https://github.com/vivary-dev/vivary/releases/tag/v0.1.0-beta.1', variant: 'primary' },
    { label: 'Release queue on GitHub', href: 'https://github.com/vivary-dev/vivary/milestone/1', variant: 'secondary' },
  ],
  description:
    'A desktop workspace for AI agents on your own projects. Agent chat, project files, tools, and memory in one app. Windows first. Beta 0.1.0-beta.1 is out.',
  plate: {
    ...IMAGES.vivarySite,
    alt: 'The vivaryagent.xyz home page: the headline “Your projects. Your AI agents.”, a Windows preview download button, and the felt antlered mascot holding a book.',
    caption: 'vivaryagent.xyz, Oct 8, 2026.',
    small: IMAGE_VARIANTS.vivarySite,
  },
  sections: [
    {
      heading: 'What it is',
      paragraphs: [
        'One app where you open a project, talk to an agent about it, and watch what the agent does to your files. Vivary runs on your computer. Claude Code or Codex does the coding work and must be installed and signed in on the same computer.',
      ],
      lanes: [
        { term: 'Work on a project', detail: 'Open an existing folder as a project, or create a new one. Chat with Claude Code or Codex in it. The agent can read files, change files, and run tools.' },
        { term: 'Keep what matters', detail: 'Save project facts as readable files in the project, and search the project’s files.' },
        { term: 'Check project health', detail: 'Run a project health check with the Python that ships inside the app.' },
        {
          term: 'Automate',
          detail:
            'Set up automations that run on a schedule, on an event, or from a webhook while Vivary is open. Provider-backed automations are not yet tested on the installed app.',
        },
        {
          term: 'Self-host later',
          detail: 'Vivary is built to be self-hosted. Remote access from another device is not yet tested on the installed app, so beta.1 is a desktop release.',
        },
      ],
    },
    {
      heading: 'What it asks of you',
      paragraphs: [],
      lanes: [
        { term: 'No Vivary account', detail: 'The desktop app needs none. Your Claude Code or Codex sign-in is yours and separate.' },
        { term: 'Windows 10 or 11, 64-bit', detail: 'No administrator rights. The installer installs Vivary for your Windows account only.' },
        { term: 'Windows first', detail: 'The desktop app targets Windows. A Mac build is possible later work, not a promise.' },
      ],
    },
  ] as const satisfies readonly SectionExpectation[],
  statusSection: {
    heading: 'Status',
    lede:
      'Beta. Version 0.1.0-beta.1 was published on Nov 1, 2026 as a GitHub prerelease. It comes as an installer and as a portable ZIP, for Windows 10 and 11 (x64). Neither is code signed, so Windows can show “Windows protected your PC”. Select More info, then Run anyway. Each file has a checksum, and the release notes show how to check it. The release queue lists what is verified and what is still required, in the open. Open source under MIT.',
    // In the order they appear in the sentence.
    links: [
      { label: 'GitHub prerelease', href: 'https://github.com/vivary-dev/vivary/releases/tag/v0.1.0-beta.1' },
      { label: 'release queue', href: 'https://github.com/vivary-dev/vivary/milestone/1' },
    ],
    limits:
      'Known limits: Vivary runs one coding conversation at a time on a computer. Provider-backed automations, remote access from another device, and an upgrade over an earlier install are not yet tested on the installed app. Rolling back to an earlier version after an upgrade is not supported, so back up your Vivary data before you upgrade. The release notes list the rest.',
    limitsLinks: [{ label: 'release notes', href: 'https://github.com/vivary-dev/vivary/releases/tag/v0.1.0-beta.1' }],
    bugs:
      'Found a bug? Open an issue. Include the release tag, your Windows version, the steps, and the error text. Do not attach credentials or private conversations. More about the project is at vivaryagent.xyz.',
    bugsLinks: [
      { label: 'Open an issue', href: 'https://github.com/vivary-dev/vivary/issues/new' },
      { label: 'vivaryagent.xyz', href: 'https://vivaryagent.xyz' },
    ],
  },
} as const;

// ---------------------------------------------------------------------------
// About, Contact, 404

export const ABOUT_PAGE = {
  h1: 'About',
  description: 'The Little AI Company is my independent software studio. I build small tools for people who use AI and intend to stay in charge of it.',
  lede:
    'The Little AI Company is my independent software studio. I’m Jeff Kazzee, and I build small tools for people who use AI and intend to stay in charge of it.',
  position: {
    heading: 'The position',
    paragraphs: [
      'Most AI products are built to take work off your hands. Some of that is useful. Past a point it takes your judgment with it. You end up trusting output you can’t inspect, from a system you can’t stop.',
      'I build the other kind. A tool of mine shows where a claim came from. It keeps its state in files you can open. It waits for your approval before it changes anything that matters. It should leave you sharper than it found you.',
      'That’s the whole company. Callout and Vivary are open source, and both run on machines you control.',
    ],
  },
  dont: {
    heading: 'What I don’t do',
    lanes: [
      { term: 'No hosted memory', detail: 'I don’t keep your data on my servers. My tools don’t need one to run.' },
      { term: 'No telemetry', detail: 'My tools don’t phone home, and neither does this site.' },
      { term: 'No autopilot', detail: 'Nothing ships that acts on your behalf without a gate you can see.' },
      {
        term: 'No courses',
        detail: 'My guides and workshops on second brains live on my own account at github.com/Jeff-Kazzee.',
      },
    ],
    link: { label: 'github.com/Jeff-Kazzee', href: 'https://github.com/Jeff-Kazzee' },
  },
} as const;

export const CONTACT_PAGE = {
  h1: 'Contact',
  description:
    'Reach me by email, or on GitHub, X, or Bluesky. Bug reports go to each tool’s issue tracker, and security reports go to my email.',
  lede: 'One person answers this. That’s me. Expect a reply within a few days.',
  heading: 'How to reach me',
  lanes: [
    { term: 'Email', detail: 'jeff@littleaicompany.com', links: [{ label: 'jeff@littleaicompany.com', href: 'mailto:jeff@littleaicompany.com' }] },
    {
      term: 'Bugs',
      detail: 'Report a bug on GitHub: Callout issues or Vivary issues.',
      links: [
        { label: 'Callout issues', href: 'https://github.com/The-Little-AI-Company/callout/issues' },
        { label: 'Vivary issues', href: 'https://github.com/vivary-dev/vivary/issues' },
      ],
    },
    {
      term: 'Security',
      detail: 'Email me with “security” in the subject. Don’t open a public issue for a vulnerability.',
      links: [],
    },
    {
      term: 'Elsewhere',
      detail: 'GitHub, X, and Bluesky.',
      links: [
        { label: 'GitHub', href: 'https://github.com/The-Little-AI-Company' },
        { label: 'X', href: 'https://x.com/JeffKazzee' },
        { label: 'Bluesky', href: 'https://bsky.app/profile/jeffkazzee.bsky.social' },
      ],
    },
  ],
} as const;

export const NOT_FOUND_PAGE = {
  h1: 'Page not found',
  description: 'That address doesn’t lead anywhere on this site. Start at the home page, or contact me if a link on this site is broken.',
  lede: 'That address doesn’t lead anywhere on this site.',
  buttons: [
    { label: 'Go to the home page', href: '/', variant: 'primary' },
    { label: 'Contact', href: '/contact/', variant: 'secondary' },
  ],
} as const;

/** The meta description of every page. */
export const DESCRIPTIONS: Record<PageId, string> = {
  home: HOME.description,
  callout: CALLOUT_PAGE.description,
  vivary: VIVARY_PAGE.description,
  about: ABOUT_PAGE.description,
  contact: CONTACT_PAGE.description,
  'not-found': NOT_FOUND_PAGE.description,
};

// ---------------------------------------------------------------------------
// Data (src/data/tools.ts)

export const TOOLS_EXPECTED = {
  callout: {
    summary:
      'Press a hotkey over anything you are reading. A small popover tells you whether the text is trying to manipulate you, and whether its claims hold up against sources it fetched.',
    repo: 'https://github.com/The-Little-AI-Company/callout',
    primary: { label: 'Download for Windows', href: CALLOUT_PAGE.buttons[0].href },
  },
  vivary: {
    status: 'Beta · v0.1.0-beta.1 · Nov 1, 2026',
    primary: { label: 'Download 0.1.0-beta.1', href: 'https://github.com/vivary-dev/vivary/releases/tag/v0.1.0-beta.1' },
    prerelease: { tag: 'v0.1.0-beta.1', href: 'https://github.com/vivary-dev/vivary/releases/tag/v0.1.0-beta.1', date: 'Nov 1, 2026' },
    repo: 'https://github.com/vivary-dev/vivary',
    queue: 'https://github.com/vivary-dev/vivary/milestone/1',
  },
} as const;

// ---------------------------------------------------------------------------
// Voice

/** All-caps words that are allowed in visible text. Roman numerals are allowed on top of these, see copy.ts. */
// PC appears only inside Windows' own dialog title, which the Vivary page quotes.
export const CAPS_ALLOWLIST: ReadonlySet<string> = new Set(['AI', 'MIT', 'API', 'APIs', 'LLM', 'HTML', 'CSS', 'CLI', 'V1', 'OS', 'ZIP', 'PC']);

export const BANNED_WORDS = ['unlock', 'empower', 'seamless', 'robust', 'revolutionary', 'game-changing', 'elevate'] as const;

/**
 * Names of products and offers the company no longer has. Case-sensitive, and none may appear anywhere in the HTML.
 * "beta" left this list on Nov 1, 2026, when Vivary 0.1.0-beta.1 shipped and the site has to name it.
 */
export const RETIRED_NAMES = ['Wazoo', 'Hoolio', 'Bellamente', 'HarnessMax', 'Agent Relay', 'Starter Kit', 'Two tools'] as const;

/** Dates the copy may contain. Anything else would be invented. */
export const KNOWN_DATES = ['Oct 3, 2026', 'Oct 8, 2026', 'Nov 1, 2026'] as const;

/** Redirects from astro.config.mjs that must keep working. */
export const RETIRED_PAGES = ['services', 'club', 'start-here', 'projects', 'brand', 'pages'] as const;
export const GUIDE_REDIRECT_TARGET = 'https://github.com/Jeff-Kazzee';
export const GUIDE_PAGES = [
  'guides',
  'guides/first-useful-thing',
  'guides/is-ai-wrong',
  'guides/prompt-anatomy',
  'guides/use-case-menu',
  'guides/make-it-better',
  'guides/what-not-to-paste',
  'guides/ai-good-and-bad',
] as const;

/**
 * The one duration and the one curve of every color or border change. They live in src/styles/tokens.css and
 * not in design/tokens.json, so they are written here. `ease` is the CSS spelling; the browser reports it as
 * `cubic-bezier(0.22, 1, 0.36, 1)`, which `normalizeValue` makes equal.
 */
export const MOTION = { seconds: 0.18, ease: 'cubic-bezier(.22, 1, .36, 1)' } as const;

/** How many <img> elements each page has. Every image is listed here; nothing else is added. */
export const IMAGE_COUNT: Record<PageId, number> = {
  home: 6, // the mascot, the Vivary screenshot and the four project thumbnails
  callout: 0,
  vivary: 1, // the vivaryagent.xyz screenshot
  about: 0,
  contact: 0,
  'not-found': 0,
};
