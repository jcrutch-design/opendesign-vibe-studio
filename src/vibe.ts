import type { GeneratedFile } from './types';

export function extractGeneratedFiles(raw: string): GeneratedFile[] {
  const fencedFiles = extractFencedFiles(raw);
  if (fencedFiles.length) {
    return fencedFiles;
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? raw;
  const firstBrace = source.indexOf('{');
  const lastBrace = source.lastIndexOf('}');

  if (firstBrace < 0 || lastBrace < firstBrace) {
    throw new Error('The model did not return a JSON file manifest.');
  }

  let parsed: { files?: unknown[] };
  try {
    parsed = JSON.parse(source.slice(firstBrace, lastBrace + 1));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `The model returned a broken JSON file manifest (${message}). ` +
        'Ask it to return fenced file blocks like ```file:index.html instead.',
    );
  }
  if (!Array.isArray(parsed.files)) {
    throw new Error('The JSON response must contain a files array.');
  }

  return parsed.files.map((file: unknown) => {
    const value = file as Partial<GeneratedFile>;
    if (!value.path || typeof value.content !== 'string') {
      throw new Error('Every generated file must include path and content.');
    }
    return {
      path: value.path.replace(/\\/g, '/').replace(/^\/+/, ''),
      content: value.content,
    };
  });
}

function extractFencedFiles(raw: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const blockPattern = /```([^\n`]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(raw)) !== null) {
    const info = match[1].trim();
    const content = match[2].replace(/\s+$/, '');
    const path = readFencePath(info);
    if (!path) {
      continue;
    }
    files.push({
      path: normalizePath(path),
      content,
    });
  }

  return files;
}

function readFencePath(info: string) {
  const direct = info.match(/^(?:file|path)[:=]([^\s]+)$/i);
  if (direct?.[1]) {
    return direct[1];
  }

  const named = info.match(/\b(?:file|path)=["']?([^"'\s]+)["']?/i);
  if (named?.[1]) {
    return named[1];
  }

  const barePath = info.match(/^([^\s]+\.(?:html|css|js|jsx|ts|tsx|json|md|svg|txt))$/i);
  return barePath?.[1] ?? '';
}

function normalizePath(value: string) {
  return value.replace(/\\/g, '/').replace(/^\/+/, '');
}

export function createFallbackApp(brief: string, designNotes: string): GeneratedFile[] {
  const safeBrief = brief.trim() || 'A generated local application';
  const escapedBrief = escapeHtml(safeBrief);
  const escapedNotes = escapeHtml(designNotes.trim() || 'No OpenDesign output yet.');

  return [
    {
      path: 'index.html',
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapedBrief}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <p class="kicker">Local build</p>
        <h1>${escapedBrief}</h1>
        <p class="lede">This app was generated locally from the current design brief. Connect a custom LLM endpoint to replace this starter with model-built files.</p>
        <div class="actions">
          <button id="primaryAction">Run flow</button>
          <button class="quiet" id="secondaryAction">Inspect state</button>
        </div>
      </section>
      <section class="panel">
        <h2>Design notes</h2>
        <pre>${escapedNotes}</pre>
      </section>
      <section class="grid" id="cards"></section>
    </main>
    <script src="./app.js"></script>
  </body>
</html>`,
    },
    {
      path: 'styles.css',
      content: `:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #151817;
  background: #f4f7f2;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    linear-gradient(90deg, rgba(22, 93, 102, 0.08) 1px, transparent 1px),
    linear-gradient(rgba(22, 93, 102, 0.08) 1px, transparent 1px),
    #f4f7f2;
  background-size: 28px 28px;
}

button {
  border: 0;
  border-radius: 6px;
  padding: 0.78rem 1rem;
  font: inherit;
  font-weight: 760;
  cursor: pointer;
  background: #f05a4f;
  color: white;
}

button.quiet {
  background: #15272b;
}

.shell {
  width: min(1120px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 48px 0;
}

.hero,
.panel,
.card {
  border: 1px solid #cad6cf;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 18px 50px rgba(21, 24, 23, 0.08);
}

.hero {
  padding: clamp(28px, 5vw, 72px);
}

.kicker {
  margin: 0 0 16px;
  color: #165d66;
  font-weight: 860;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

h1 {
  margin: 0;
  max-width: 850px;
  font-size: clamp(2.25rem, 8vw, 6rem);
  line-height: 0.92;
  letter-spacing: 0;
}

.lede {
  max-width: 680px;
  color: #41514d;
  font-size: 1.08rem;
  line-height: 1.65;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

.panel {
  margin-top: 18px;
  padding: 24px;
}

pre {
  white-space: pre-wrap;
  color: #40504c;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
  margin-top: 18px;
}

.card {
  padding: 20px;
  min-height: 140px;
}

.card strong {
  display: block;
  margin-bottom: 8px;
}`,
    },
    {
      path: 'app.js',
      content: `const cards = [
  ['Input', 'Capture the real user goal and design source.'],
  ['Generate', 'Use the OpenDesign pass as visual direction.'],
  ['Code', 'Let the selected endpoint turn the concept into files.'],
  ['Preview', 'Run and inspect the app locally.']
];

document.getElementById('cards').innerHTML = cards
  .map(([title, body]) => \`<article class="card"><strong>\${title}</strong><span>\${body}</span></article>\`)
  .join('');

document.getElementById('primaryAction').addEventListener('click', () => {
  alert('Your local generated app is interactive.');
});

document.getElementById('secondaryAction').addEventListener('click', () => {
  console.table(cards);
});`,
    },
  ];
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
