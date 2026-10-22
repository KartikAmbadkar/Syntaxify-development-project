# Syntaxify

**Understand any code, one line at a time.**

Syntaxify is a small, framework-free website that turns code you didn't write (or can't quite follow) into plain English. Paste a snippet, pick a language, and get a summary, the concepts used, and a line-by-line explanation.

## Features

- **Landing page** with an animated typing demo, plus About, Features and Info sections
- **Code explainer tool** with a line-numbered editor and a side-by-side explanation panel
- **Three explanation views**: Summary, Concepts used, and Line by line
- **Click-to-highlight**: select a line in the explanation to highlight it in your code
- **Language support**: Python, JavaScript, Java and C++, with auto-detection
- **Accessible and responsive**: keyboard-navigable tabs, a no-JavaScript mobile menu, reduced-motion support, and a layout that stacks on tablets and phones
- **Optional AI backend**: point the tool at your own server to replace the built-in rules

## Getting started

There is no build step and nothing to install.

1. Download or clone the project.
2. Open `index.html` in your browser.
3. Click **Get started** to open the tool page.

Or serve the folder locally:

```bash
# Python
python -m http.server 8000

# Node
npx serve .
```

Then visit `http://localhost:8000`.

## Project structure

```
syntaxify/
├── index.html          # Home page (hero, About, Features, Info)
├── style6.css          # Styles for the home page
├── promtpage.html      # Tool page (code editor + explanation panel)
├── promppagecss.css    # Styles for the tool page
├── promptscript.js     # Explainer engine and tool page behaviour
└── README.md
```

## How the explainer works

By default, explanations are generated **in the browser** by a rule-based engine in `promptscript.js`. No code leaves the page.

1. **Language detection** scores the snippet against common patterns for each supported language.
2. **Rules** (the `RULES` array) match each line against regular expressions. The first match supplies a plain-English description and a concept tag.
3. **Analysis** (`localAnalyse()`) collects the line explanations, builds the concept list, and writes a summary covering functions, loops, conditions, recursion and nested loops.
4. **Rendering** fills the three tabs and links each line to the editor highlight.

Because it is pattern-based, unusual or complex code may receive a generic description. The tool page shows a note about this.

### Adding a rule

Add an entry to `RULES` in `promptscript.js`:

```js
{
  re: /^\s*your-pattern-here/,   // regex tested against each line
  langs: ['python'],             // optional: limit to certain languages
  kind: 'func',                  // optional: func | loop | cond | print
  concept: 'Functions',          // optional: shown on the "Concepts used" tab
  plain: (m) => `Explains the line using ${tick(m[1])}.`,
}
```

Rules are checked in order, so put more specific rules above general ones. If you add a new concept name, describe it in `CONCEPT_INFO`.

### Using a real AI backend

Set `API_URL` at the top of `promptscript.js`:

```js
const API_URL = 'https://your-server.example.com/explain';
```

The page will `POST` `{ code, language }` and expects JSON in the same shape `localAnalyse()` returns:

```json
{
  "language": "python",
  "concepts": ["Functions", "Loops"],
  "summary": "This is Python code with 6 lines. ...",
  "lines": [{ "n": 1, "code": "def f(n):", "text": "Defines a function named `f` ..." }]
}
```

Text may use `` `backticks` `` to mark code. Once `API_URL` is set, the built-in-rules note is hidden automatically.

## Customising

- **Colours and fonts** are CSS variables in `:root` at the top of each stylesheet. Both pages share the same design tokens, so change them in both files.
- **Hero animation** timings in `style6.css` are percentages of a 16-second loop.
- **Section images** on the home page are inline SVGs. Replace one with an `<img>` tag (a comment above each shows how).
- **Input limit** is set by `MAX_CHARS` (8,000 characters) in `promptscript.js`.

## Browser support

Any modern evergreen browser (Chrome, Edge, Firefox, Safari). The tool page uses the `inert` attribute and `IntersectionObserver` on the home page.

## Known gaps

- `index.html` links to `services.html`, which is not part of this folder yet.
- The Features section mentions an execution trace and bug/improvement suggestions. These are not implemented in the built-in engine.
- The tool-page file names (`promtpage.html`, `promppagecss.css`) are spelled as the links reference them. If you rename them, update the links in `index.html` and `promtpage.html`.

## Contact

hello@syntaxify.com
