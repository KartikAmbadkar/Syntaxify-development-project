# Syntaxify backend

Folder layout:

    syntaxify/
      server.js
      package.json
      .env.example   -> copy to .env and add your key
      .gitignore
      lib/explain.js, lib/fallback.js
      public/        <- put your 5 front-end files here:
                        index.html, style6.css, promtpage.html,
                        promppagecss.css, promptscript.js

One edit in public/promptscript.js:

    const API_URL = '/api/explain';

Run:

    npm install
    cp .env.example .env     # then paste your ANTHROPIC_API_KEY
    npm start                # http://localhost:3000

Test the logic: `npm test`

Deploy to a Node host (Render, Railway, Fly.io). GitHub Pages cannot run it.
Set ANTHROPIC_API_KEY in the host's environment settings, not in a file.
Behind a proxy (most hosts) also set TRUST_PROXY=1 so rate limiting sees real IPs.
