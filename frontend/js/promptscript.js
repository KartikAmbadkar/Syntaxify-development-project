'use strict';

/*
   Syntaxify: prompt page script

   1. Settings  
   2. Explainer engine    
   3. Page behaviour       */

/* 1. SETTINGS */

const API_URL = '/api/explain';

const MAX_CHARS = 8000;

/* 2. EXPLAINER ENGINE*/

const LANG_LABELS = {
  python: 'Python',
  javascript: 'JavaScript',
  java: 'Java',
  cpp: 'C++',
  generic: 'Code',
};

const NOT_FUNCTION_NAMES = new Set([
  'if', 'for', 'while', 'switch', 'return', 'else', 'catch', 'sizeof', 'new', 'delete', 'throw',
]);

const CONCEPT_INFO = {
  'Functions': 'A named block of code you can run whenever you need it. It can take input and give a result back.',
  'Arrow functions': 'A shorter way to write a function in JavaScript, using =>.',
  'Classes': 'A blueprint for creating objects that bundle data and the actions that work on it.',
  'Loops': 'Code that repeats, either a set number of times or while a condition stays true.',
  'Conditionals': 'if / else checks that let the program choose between different paths.',
  'Return values': 'The result a function hands back to the code that called it.',
  'Output': 'Showing text or results on the screen.',
  'Variables': 'Named places that store values so the code can use them later.',
  'Lists': 'An ordered collection of items that can grow as the program runs.',
  'Imports': 'Bringing in code from a library or another file so you can reuse it.',
  'Function calls': 'Running a function by writing its name followed by its input.',
  'Error handling': 'Catching problems while the program runs so it can respond instead of crashing.',
  'Context managers': 'A with block that sets something up and cleans it up automatically afterwards.',
  'Recursion': 'A function that calls itself to solve a smaller version of the same problem. It needs a stopping case.',
  'Tuple unpacking': 'Assigning several variables in one line, for example a, b = b, a + b.',
  'Destructuring': 'Pulling values out of a list or object into separate variables in one step.',
  'List comprehension': 'A compact way to build a new list from another one in a single line.',
  'Lambda functions': 'A small unnamed function written inline.',
  'Async / await': 'Code that can wait for slow work, such as a network request, without freezing the program.',
  'Basic statements': 'Simple instructions that run one after another, from top to bottom.',
};

/* small text helpers*/

const clip = (s, n = 48) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const tick = (s) => '`' + clip(s.trim()) + '`';

function describeParams(raw) {
  const list = (raw || '').split(',').map((p) => p.trim()).filter(Boolean);
  if (!list.length) return 'takes no input';
  return 'takes ' + list.map(tick).join(', ') + ' as input';
}

function describeValue(value) {
  const v = value.trim().replace(/;$/, '');
  if (/^-?\d+(\.\d+)?$/.test(v)) return 'the number ' + v;
  if (/^(["'`]).*\1$/.test(v)) return 'the text ' + tick(v);
  if (/^(true|false|True|False)$/.test(v)) return 'the value ' + v;
  if (/^(null|None|undefined|nullptr)$/.test(v)) return 'an empty value (' + v + ')';
  if (/^(\[\s*\]|list\(\))$/.test(v)) return 'an empty list';
  if (/^(\{\s*\}|dict\(\))$/.test(v)) return 'an empty collection';
  if (/^\[.*\]$/.test(v)) return 'the list ' + tick(v);
  return 'the result of ' + tick(v);
}

function describeRange(expr) {
  const m = expr.trim().match(/^range\((.*)\)$/);
  if (!m) return null;
  const args = m[1].split(',').map((s) => s.trim());
  if (args.length === 1) return { times: args[0] };
  return { span: 'from ' + tick(args[0]) + ' up to (not including) ' + tick(args[1]) };
}

/*language detection */

function detectLanguage(code) {
  const score = { python: 0, javascript: 0, java: 0, cpp: 0 };

  if (/^\s*def\s+\w+\s*\(.*\)\s*:/m.test(code)) score.python += 3;
  if (/^\s*(elif|except|from\s+\w+\s+import|import\s+\w+\s*$)/m.test(code)) score.python += 2;
  if (/\bprint\(/.test(code)) score.python += 1;
  if (/:\s*$/m.test(code) && !/[{};]\s*$/m.test(code)) score.python += 1;

  if (/\b(const|let|var)\s+\w+/.test(code) || /=>/.test(code)) score.javascript += 3;
  if (/console\.log|\bfunction\b|===/.test(code)) score.javascript += 2;

  if (/System\.out\.print|public\s+(static\s+)?(class|void|int|String)|String\[\]/.test(code)) score.java += 4;

  if (/#include|std::|cout\s*<<|using\s+namespace|\bint\s+main\s*\(/.test(code)) score.cpp += 4;

  const best = Object.keys(score).reduce((a, b) => (score[b] > score[a] ? b : a));
  return score[best] > 0 ? best : 'generic';
}

/* ----------------------------------------------------------
   RULES
   Each rule explains one kind of line. The first rule that matches wins.
     re      regular expression tested against the line
     langs   languages the rule applies to (omit = all)
     kind    used for the summary (func, loop, cond, print)
     concept name shown on the "Concepts used" tab
     plain   the plain-English explanation shown for the line
   ---------------------------------------------------------- */

const PRINT_CALL = /^\s*(?:print|console\.(?:log|error|warn|info)|System\.out\.print(?:ln)?|printf)\s*\((.*)\)\s*;?\s*$/;

const RULES = [
  // --- imports and includes ---
  {
    re: /^\s*#include\s*[<"](.+?)[>"]/, concept: 'Imports',
    plain: (m) => `Brings in the ${tick(m[1])} library so its features can be used below.`,
  },
  {
    re: /^\s*from\s+(\S+)\s+import\s+(.+)$/, langs: ['python'], concept: 'Imports',
    plain: (m) => `Loads ${tick(m[2])} from the ${tick(m[1])} module.`,
  },
  {
    re: /^\s*import\s+(.+?);?\s*$/, concept: 'Imports',
    plain: (m) => `Loads ${tick(m[1])} so the code below can use it.`,
  },
  {
    re: /^\s*using\s+(.+?);\s*$/, langs: ['cpp'], concept: 'Imports',
    plain: (m) => `Lets the code use names from ${tick(m[1])} without typing the full prefix.`,
  },

  // --- comments ---
  {
    re: /^\s*(?:#(?!include)|\/\/|\/\*|\*)/,
    plain: () => 'A comment. The computer ignores it; it is a note for people reading the code.',
  },

  // --- classes and functions ---
  {
    re: /^\s*(?:(?:public|private|protected|abstract|final|static|export)\s+)*class\s+(\w+)/, concept: 'Classes',
    plain: (m) => `Defines a class named ${tick(m[1])}, a blueprint for making objects.`,
  },
  {
    re: /^\s*(async\s+)?def\s+(\w+)\s*\((.*?)\)/, langs: ['python'], kind: 'func', concept: 'Functions',
    fn: (m) => m[2],
    plain: (m) => `Defines a function named ${tick(m[2])} that ${describeParams(m[3])}. Its body is the indented lines below.`,
  },
  {
    re: /^\s*(?:export\s+)?(async\s+)?function\s*\*?\s*(\w+)\s*\((.*?)\)/, langs: ['javascript'], kind: 'func', concept: 'Functions',
    fn: (m) => m[2],
    plain: (m) => `Defines a function named ${tick(m[2])} that ${describeParams(m[3])}.`,
  },
  {
    re: /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(async\s+)?(?:\((.*?)\)|(\w+))\s*=>/, langs: ['javascript'],
    kind: 'func', concept: 'Arrow functions',
    fn: (m) => m[1],
    plain: (m) => `Creates a function named ${tick(m[1])} that ${describeParams(m[3] || m[4])}.`,
  },
  {
    re: /^\s*(?:(?:public|private|protected|static|final|inline|virtual|const|unsigned|extern)\s+)*([\w:<>,\[\]\*&]+)\s+\**(\w+)\s*\(([^)]*)\)\s*(?:const)?\s*(?:throws\s+[\w, ]+)?\s*\{?\s*$/,
    langs: ['java', 'cpp'], kind: 'func', concept: 'Functions',
    guard: (m) => !NOT_FUNCTION_NAMES.has(m[2]) && !NOT_FUNCTION_NAMES.has(m[1]),
    fn: (m) => m[2],
    plain: (m) => (m[2] === 'main'
      ? 'The starting point of the program. Execution begins here.'
      : `Defines a function named ${tick(m[2])} that ${describeParams(m[3])} and ${m[1] === 'void' ? 'gives nothing back' : 'gives back a value of type ' + tick(m[1])}.`),
  },

  // --- loops ---
  {
    re: /^\s*for\s+(\w+)\s+in\s+(.+?)\s*:\s*$/, langs: ['python'], kind: 'loop', concept: 'Loops',
    plain: (m) => {
      const r = describeRange(m[2]);
      if (r && r.times) return `Repeats the indented lines below ${tick(r.times)} times.`;
      if (r) return `Repeats the indented lines below, counting ${tick(m[1])} ${r.span}.`;
      return `Goes through ${tick(m[2])} one item at a time, calling each item ${tick(m[1])}.`;
    },
  },
  {
    re: /^\s*(?:\}\s*)?for\s*\((.*)\)\s*\{?\s*$/, kind: 'loop', concept: 'Loops',
    plain: (m) => {
      const each = m[1].match(/^(?:[\w<>\[\],:\*&]+\s+)*?(\w+)\s*(?:of|in|:)\s*(.+)$/);
      if (!m[1].includes(';') && each) return `Goes through ${tick(each[2])} one item at a time, calling each item ${tick(each[1])}.`;
      const [init = '', cond = '', step = ''] = m[1].split(';').map((s) => s.trim());
      return `Repeats the block below. It starts with ${tick(init)}, keeps going while ${tick(cond)}, and runs ${tick(step)} after each round.`;
    },
  },
  {
    re: /^\s*(?:\}\s*)?while\s*\(?(.+?)\)?\s*[:{;]?\s*$/, kind: 'loop', concept: 'Loops',
    plain: (m) => `Keeps repeating the block as long as ${tick(m[1])} is true.`,
  },
  {
    re: /^\s*(break|continue|pass)\s*;?\s*$/, concept: 'Loops',
    plain: (m) => ({ break: 'Stops the loop right away.', continue: 'Skips the rest of this round and jumps to the next one.', pass: 'Does nothing. It is a placeholder.' }[m[1]]),
  },

  // --- conditions ---
  {
    re: /^\s*(?:\}\s*)?if\s*\((.+?)\)\s*((?:return|break|continue|throw)\b[^{]*|[^{]+;)\s*$/, kind: 'cond', concept: 'Conditionals',
    plain: (m) => {
      const act = m[2].replace(/;\s*$/, '').trim();
      const ret = act.match(/^return\b\s*(.*)$/);
      if (ret) return `Checks whether ${tick(m[1])}. If so, ${ret[1] ? 'sends ' + tick(ret[1]) + ' back right away' : 'ends the function right away'}.`;
      if (act === 'break') return `Checks whether ${tick(m[1])}. If so, stops the loop.`;
      if (act === 'continue') return `Checks whether ${tick(m[1])}. If so, skips to the next round.`;
      return `Checks whether ${tick(m[1])}. If so, runs ${tick(act)}.`;
    },
  },
  {
    re: /^\s*(?:\}\s*)?(?:else\s+if|elif)\s*\(?(.+?)\)?\s*[:{]?\s*$/, kind: 'cond', concept: 'Conditionals',
    plain: (m) => `Otherwise, checks whether ${tick(m[1])}. If so, runs the block below.`,
  },
  {
    re: /^\s*(?:\}\s*)?else\s*[:{]?\s*$/, concept: 'Conditionals',
    plain: () => 'Runs when none of the conditions above were true.',
  },
  {
    re: /^\s*(?:\}\s*)?if\s*\(?(.+?)\)?\s*[:{]?\s*$/, kind: 'cond', concept: 'Conditionals',
    plain: (m) => `Checks whether ${tick(m[1])}. If it is true, the block below runs.`,
  },

  // --- errors ---
  {
    re: /^\s*(?:\}\s*)?try\s*[:{]\s*$/, concept: 'Error handling',
    plain: () => 'Starts a block of code that might fail. Errors inside it can be caught.',
  },
  {
    re: /^\s*(?:\}\s*)?(?:except|catch)\b\s*\(?(.*?)\)?\s*(?:as\s+\w+)?\s*[:{]\s*$/, concept: 'Error handling',
    plain: (m) => (m[1] ? `Runs if the block above fails with ${tick(m[1])}.` : 'Runs if the block above fails.'),
  },
  {
    re: /^\s*(?:\}\s*)?finally\s*[:{]\s*$/, concept: 'Error handling',
    plain: () => 'Always runs afterwards, whether or not there was an error.',
  },
  {
    re: /^\s*(?:raise|throw)\b\s*(.*?);?\s*$/, concept: 'Error handling',
    plain: (m) => `Deliberately signals an error${m[1] ? ': ' + tick(m[1]) : ''}.`,
  },
  {
    re: /^\s*with\s+(.+?)\s+as\s+(\w+)\s*:\s*$/, langs: ['python'], concept: 'Context managers',
    plain: (m) => `Opens ${tick(m[1])} as ${tick(m[2])} and closes it automatically when the block ends.`,
  },

  // --- return and output ---
  {
    re: /^\s*return\b\s*(.*?);?\s*$/, concept: 'Return values',
    plain: (m) => (m[1] ? `Sends ${tick(m[1])} back to whoever called this function, then stops the function.` : 'Ends the function without giving back a value.'),
  },
  {
    re: PRINT_CALL, kind: 'print', concept: 'Output',
    plain: (m) => `Shows ${tick(m[1])} on the screen.`,
  },
  {
    re: /^\s*(?:std::)?cout\s*<<\s*(.+?);\s*$/, langs: ['cpp'], kind: 'print', concept: 'Output',
    plain: (m) => `Shows ${tick(m[1].split(/\s*<<\s*/).filter((x) => x !== 'endl').join(', '))} on the screen.`,
  },

  // --- assignments ---
  {
    re: /^\s*\[\s*(\w+(?:\s*,\s*\w+)+)\s*\]\s*=\s*\[(.+)\]\s*;?\s*$/, langs: ['javascript'], concept: 'Destructuring',
    plain: (m) => `Updates ${tick(m[1])} together in one step. The right side is worked out first using the old values.`,
  },
  {
    re: /^\s*(?:const|let|var|final|static|int|long|float|double|char|bool|boolean|auto)\s+(\w+)\s*=\s*([^,]+?)\s*,\s*(\w+)\s*=\s*(.+?);?\s*$/, concept: 'Variables',
    plain: (m) => `Creates ${tick(m[1])} set to ${tick(m[2])}, and ${tick(m[3])} set to ${tick(m[4])}.`,
  },
  {
    re: /^\s*(\w+\s*(?:,\s*\w+\s*)+)=\s*(.+?)\s*$/, langs: ['python'], concept: 'Tuple unpacking',
    plain: (m) => `Updates ${tick(m[1])} together in one step. The right side is worked out first using the old values.`,
  },
  {
    re: /^\s*(\w+)\s*(\+\+|--)\s*;?\s*$/, concept: 'Variables',
    plain: (m) => `${m[2] === '++' ? 'Increases' : 'Decreases'} ${tick(m[1])} by 1.`,
  },
  {
    re: /^\s*([\w.]+)\.(append|push|add)\((.*)\)\s*;?\s*$/, concept: 'Lists',
    plain: (m) => `Adds ${tick(m[3])} to the end of ${tick(m[1])}.`,
  },
  {
    re: /^\s*(?:(?:const|let|var|final|static|auto)\s+|[\w<>\[\],:\*&]+\s+)?([\w.\[\]]+)\s*(\+=|-=|\*=|\/=|%=|=(?!=))\s*(.+?);?\s*$/,
    concept: 'Variables',
    guard: (m) => !NOT_FUNCTION_NAMES.has(m[1]),
    plain: (m) => {
      const name = tick(m[1]);
      const val = tick(m[3]);
      switch (m[2]) {
        case '+=': return `Adds ${val} to ${name}.`;
        case '-=': return `Subtracts ${val} from ${name}.`;
        case '*=': return `Multiplies ${name} by ${val}.`;
        case '/=': return `Divides ${name} by ${val}.`;
        case '%=': return `Sets ${name} to the remainder after dividing by ${val}.`;
        default:   return `Stores ${describeValue(m[3])} in ${name}.`;
      }
    },
  },

  // --- plain calls and block ends ---
  {
    re: /^\s*([\w.]+)\((.*)\)\s*;?\s*$/, concept: 'Function calls',
    plain: (m) => `Calls ${tick(m[1])}${m[2].trim() ? ' with ' + tick(m[2]) : ''}.`,
  },
  {
    re: /^\s*[})\]]+\s*;?\s*$/,
    plain: () => 'Marks the end of the block above.',
  },
  {
    re: /^\s*\{\s*$/,
    plain: () => 'Opens a block of code.',
  },
];

/*ANALYSIS */

function indentOf(raw) {
  return raw.match(/^\s*/)[0].replace(/\t/g, '    ').length;
}

function findRule(raw, lang) {
  for (const rule of RULES) {
    if (rule.langs && lang !== 'generic' && !rule.langs.includes(lang)) continue;
    const m = raw.match(rule.re);
    if (m && (!rule.guard || rule.guard(m))) return { rule, m };
  }
  return null;
}

function isRecursive(rows, def) {
  const call = new RegExp('\\b' + def.name + '\\s*\\(');
  for (let i = def.index + 1; i < rows.length; i++) {
    const text = rows[i].trim();
    if (!text || text === '{') continue;
    if (indentOf(rows[i]) <= def.indent) break;
    if (call.test(text)) return true;
  }
  return false;
}

function listWords(items) {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

function plural(n, word) {
  return n + ' ' + word + (n === 1 ? '' : 's');
}

function buildSummary(info) {
  const { lang, codeLines, funcs, loops, conds, prints, recursive, nested } = info;
  const lead = lang === 'generic' ? `This code has ${plural(codeLines, 'line')}.` : `This is ${LANG_LABELS[lang]} code with ${plural(codeLines, 'line')}.`;

  const parts = [];
  if (funcs.length) parts.push(`It defines ${listWords(funcs.map((f) => '`' + f.name + '`'))}.`);
  const flow = [];
  if (loops) flow.push(`${plural(loops, 'loop')} to repeat work`);
  if (conds) flow.push(`${plural(conds, 'condition')} to choose between paths`);
  if (flow.length) parts.push(`It uses ${listWords(flow)}.`);
  if (recursive.length) parts.push(`${listWords(recursive.map((f) => '`' + f + '`'))} calls itself, which is called recursion, so it needs a stopping case.`);
  if (prints) parts.push('It prints a result to the screen.');
  if (nested) parts.push('Nested loops usually mean the work grows quickly with the input size, often about O(n²).');
  if (!parts.length) parts.push('It is a short list of statements that run from top to bottom.');

  return [lead, ...parts].join(' ');
}

function localAnalyse(code, choice) {
  const lang = choice === 'auto' ? detectLanguage(code) : choice;
  const rows = code.replace(/\r\n/g, '\n').split('\n');

  const lines = [];
  const concepts = new Set();
  const funcs = [];
  const loopIndents = [];
  let loops = 0, conds = 0, prints = 0, nested = false;

  rows.forEach((raw, index) => {
    if (!raw.trim()) return;
    const indent = indentOf(raw);

    // keep track of which loops are still open (by indentation)
    while (loopIndents.length && indent <= loopIndents[loopIndents.length - 1]) loopIndents.pop();

    const found = findRule(raw, lang);
    let text;

    if (found) {
      const { rule, m } = found;
      text = rule.plain(m);
      if (rule.concept) concepts.add(rule.concept);
      if (rule.kind === 'func') funcs.push({ name: rule.fn(m), index, indent });
      if (rule.kind === 'cond') conds++;
      if (rule.kind === 'print') prints++;
      if (rule.kind === 'loop') {
        loops++;
        if (loopIndents.length) nested = true;
        loopIndents.push(indent);
      }
    } else {
      text = `Runs the statement ${tick(raw)}.`;
    }

    lines.push({ n: index + 1, code: raw.trim(), text });
  });

  const recursive = funcs.filter((f) => isRecursive(rows, f)).map((f) => f.name);
  if (recursive.length) concepts.add('Recursion');
  if (/\[[^\]]+\bfor\b[^\]]+\bin\b[^\]]+\]/.test(code)) concepts.add('List comprehension');
  if (/\blambda\b/.test(code)) concepts.add('Lambda functions');
  if (/\b(async|await)\b/.test(code)) concepts.add('Async / await');

  const conceptList = [...concepts];
  return {
    language: lang,
    concepts: conceptList,
    lines,
    summary: buildSummary({ lang, codeLines: lines.length, funcs, loops, conds, prints, recursive, nested }),
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function analyse(code, language) {
  if (API_URL) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, language }),
    });
    if (!res.ok) throw new Error('Request failed with status ' + res.status);
    return res.json();
  }
  await wait(450); // short pause so the loading state is visible
  return localAnalyse(code, language);
}

/*3. PAGE BEHAVIOUR */

const $ = (id) => document.getElementById(id);

const els = {
  workspace: $('workspace'),
  code: $('code'),
  gutterInner: $('gutter-inner'),
  band: $('line-band'),
  language: $('language'),
  explainBtn: $('explain-btn'),
  clearBtn: $('clear-btn'),
  msg: $('form-msg'),
  panel: $('explain-panel'),
  loading: $('loading'),
  result: $('result'),
  summary: $('summary'),
  concepts: $('concepts'),
  lines: $('lines'),
  badge: $('lang-badge'),
  note: $('note'),
  tabs: $('tabs'),
  tabBtns: document.querySelectorAll('#tabs [role="tab"]'),
  status: $('status'),
};

const state = { analysis: null, activeLine: null, busy: false };
let gutterCount = 0;

/* editor: line numbers + highlighted line  */

function lineHeightPx() {
  return parseFloat(getComputedStyle(els.code).lineHeight) || 26;
}

function padTopPx() {
  return parseFloat(getComputedStyle(els.code).paddingTop) || 0;
}

function positionBand() {
  if (!state.activeLine) { els.band.style.display = 'none'; return; }
  const top = padTopPx() + (state.activeLine - 1) * lineHeightPx() - els.code.scrollTop;
  els.band.style.display = 'block';
  els.band.style.top = top + 'px';
}

function syncGutter() {
  const count = els.code.value.split('\n').length;
  if (count !== gutterCount) {
    gutterCount = count;
    els.gutterInner.textContent = Array.from({ length: count }, (_, i) => i + 1).join('\n');
  }
  els.gutterInner.style.transform = `translateY(${-els.code.scrollTop}px)`;
  positionBand();
}

function setActiveLine(n) {
  state.activeLine = state.activeLine === n ? null : n;

  if (state.activeLine) {
    const lh = lineHeightPx();
    const top = (n - 1) * lh;
    const visible = els.code.clientHeight - padTopPx() * 2;
    if (top < els.code.scrollTop || top + lh > els.code.scrollTop + visible) {
      els.code.scrollTop = Math.max(0, top - lh * 2);
    }
  }

  els.lines.querySelectorAll('.line-btn').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(Number(btn.dataset.line) === state.activeLine));
  });
  syncGutter();
}

/* tabs*/

function selectTab(name, moveFocus = false) {
  els.tabBtns.forEach((btn) => {
    const on = btn.dataset.tab === name;
    btn.setAttribute('aria-selected', String(on));
    btn.tabIndex = on ? 0 : -1;
    $('pane-' + btn.dataset.tab).hidden = !on;
    if (on && moveFocus) btn.focus();
  });
  document.querySelector('.explain-body').scrollTop = 0;
}

els.tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => selectTab(btn.dataset.tab));
});


els.tabs.addEventListener('keydown', (e) => {
  const tabs = [...els.tabBtns];
  const i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  let next = null;
  if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
  if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
  if (e.key === 'Home') next = tabs[0];
  if (e.key === 'End') next = tabs[tabs.length - 1];
  if (next) {
    e.preventDefault();
    selectTab(next.dataset.tab, true);
  }
});

/*rendering */
function rich(el, text) {
  el.textContent = '';
  text.split('`').forEach((part, i) => {
    if (!part) return;
    if (i % 2) {
      const code = document.createElement('code');
      code.textContent = part;
      el.appendChild(code);
    } else {
      el.appendChild(document.createTextNode(part));
    }
  });
}

function renderResult() {
  const a = state.analysis;
  if (!a) return;

  rich(els.summary, a.summary);
  els.badge.textContent = LANG_LABELS[a.language] || a.language;

  els.concepts.textContent = '';
  (a.concepts.length ? a.concepts : ['Basic statements']).forEach((name) => {
    const li = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = name;
    const about = document.createElement('span');
    about.textContent = CONCEPT_INFO[name] || '';
    li.append(title, about);
    els.concepts.appendChild(li);
  });

  els.lines.textContent = '';
  a.lines.forEach((item) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'line-btn';
    btn.dataset.line = item.n;
    btn.setAttribute('aria-pressed', String(item.n === state.activeLine));
    btn.setAttribute('aria-label', 'Highlight line ' + item.n + ' in your code');

    const num = document.createElement('span');
    num.className = 'line-num';
    num.textContent = item.n;

    const body = document.createElement('span');
    const code = document.createElement('code');
    code.className = 'line-code';
    code.textContent = item.code;
    const text = document.createElement('p');
    text.className = 'line-text';
    rich(text, item.text);
    body.append(code, text);

    btn.append(num, body);
    li.appendChild(btn);
    els.lines.appendChild(li);
  });

  els.loading.hidden = true;
  els.result.hidden = false;
  els.tabs.hidden = false;
  selectTab('summary');
}

/*panel open / close  */

function openPanels() {
  els.workspace.classList.add('is-active');
  els.panel.inert = false;
  requestAnimationFrame(() => setTimeout(syncGutter, 650));
}

function closePanels() {
  els.workspace.classList.remove('is-active');
  els.panel.inert = true;
  els.result.hidden = true;
  els.tabs.hidden = true;
  els.loading.hidden = true;
  state.analysis = null;
  state.activeLine = null;
  setTimeout(syncGutter, 650);
}

function showMessage(text) {
  els.msg.textContent = text;
  els.msg.hidden = !text;
}

/* main action  */

async function onExplain() {
  if (state.busy) return;

  const code = els.code.value;
  if (!code.trim()) {
    showMessage('Paste some code first, then press Explain code.');
    els.code.focus();
    return;
  }
  if (code.length > MAX_CHARS) {
    showMessage(`That is too long. Keep it under ${MAX_CHARS.toLocaleString()} characters.`);
    return;
  }

  showMessage('');
  state.busy = true;
  state.activeLine = null;
  els.explainBtn.disabled = true;
  els.explainBtn.textContent = 'Explaining…';
  openPanels();
  els.result.hidden = true;
  els.tabs.hidden = true;
  els.loading.hidden = false;
  els.status.textContent = 'Reading your code.';

  try {
    state.analysis = await analyse(code, els.language.value);
    renderResult();
    els.status.textContent = 'Explanation ready.';
  } catch (err) {
    console.error(err);
    if (!state.analysis) closePanels();
    showMessage('Could not explain this code. Check your connection and try again.');
  } finally {
    state.busy = false;
    els.explainBtn.disabled = false;
    els.explainBtn.textContent = 'Explain code';
  }
}

/* events */

els.explainBtn.addEventListener('click', onExplain);

els.code.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    onExplain();
  }
});

els.code.addEventListener('input', () => {
  state.activeLine = null;
  showMessage('');
  els.workspace.classList.toggle('has-code', els.code.value.trim() !== '');
  els.lines.querySelectorAll('.line-btn').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  syncGutter();
});

els.code.addEventListener('scroll', syncGutter);
window.addEventListener('resize', syncGutter);

els.clearBtn.addEventListener('click', () => {
  els.code.value = '';
  els.workspace.classList.remove('has-code');
  showMessage('');
  closePanels();
  syncGutter();
  els.code.focus();
});

els.lines.addEventListener('click', (e) => {
  const btn = e.target.closest('.line-btn');
  if (btn) setActiveLine(Number(btn.dataset.line));
});

/*start */

els.note.hidden = Boolean(API_URL);
syncGutter();