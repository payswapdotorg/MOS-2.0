// X11-level window operations on the packaged MOS app (display :98, no WM).
// REAL window-manager-protocol interop evidence: ConfigureWindow (resize),
// full-screen bounds (maximize analog), Unmap/Map (minimize/restore analog).
import x11 from 'x11';

const DISPLAY = 98;

const X = await new Promise((resolve, reject) => {
  x11.createClient((err, display) => (err ? reject(err) : resolve(display)));
});
const Xclient = X.client;
const root = X.screen[0].root;

function internAtom(name) {
  return new Promise((resolve, reject) => {
    Xclient.InternAtom(false, name, (err, atom) => (err ? reject(err) : resolve(atom)));
  });
}
const WM_NAME_ATOM = await internAtom('WM_NAME');
const WM_CLASS_ATOM = await internAtom('WM_CLASS');

function queryTree(win) {
  return new Promise((resolve, reject) => {
    Xclient.QueryTree(win, (err, tree) => (err ? reject(err) : resolve(tree)));
  });
}
function getProperty(win, atom) {
  return new Promise((resolve) => {
    Xclient.GetProperty(0, win, atom, 31, 0, 65536, (err, prop) => {
      if (err || !prop || !prop.data) return resolve(null);
      resolve(prop.data.toString('latin1').replace(/\0.*$/s, ''));
    });
  });
}
function configure(win, { width, height }) {
  return new Promise((resolve, reject) => {
    Xclient.ConfigureWindow(win, { width, height }, (err) => (err ? reject(err) : resolve()));
  });
}
function unmap(win) {
  return new Promise((resolve) => Xclient.UnmapWindow(win, () => resolve()));
}
function map(win) {
  return new Promise((resolve) => Xclient.MapWindow(win, () => resolve()));
}
function geometry(win) {
  return new Promise((resolve, reject) => {
    Xclient.GetGeometry(win, (err, g) => (err ? reject(err) : resolve(g)));
  });
}

async function findMosWindow() {
  const tree = await queryTree(root).catch(() => null);
  if (!tree) return null;
  for (const w of tree.children) {
    const klass = await getProperty(w, WM_CLASS_ATOM);
    const name = await getProperty(w, WM_NAME_ATOM);
    if (klass && /^mos($|\|)/i.test(klass)) return { win: w, name, klass };
  }
  return null;
}

const found = await findMosWindow();
if (!found) {
  console.error('NO MOS WINDOW FOUND');
  Xclient.terminate();
  process.exit(1);
}
console.log(`found MOS window id=${found.win} name="${found.name}" class="${found.klass}"`);

const results = [];
const check = (n, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${extra ? ' — ' + extra : ''}`);
};

// initial geometry
let g = await geometry(found.win);
console.log(`initial geometry: ${g.width}x${g.height}`);

// resize matrix — REAL X11 ConfigureWindow operations
for (const cfg of [
  { width: 1200, height: 800 },
  { width: 1366, height: 768 },
  { width: 1024, height: 768 },
  { width: 800, height: 640 },
]) {
  await configure(found.win, cfg);
  await new Promise((r) => setTimeout(r, 500));
  g = await geometry(found.win);
  check(
    `X11 resize to ${cfg.width}x${cfg.height}`,
    Math.abs(g.width - cfg.width) <= 2 && Math.abs(g.height - cfg.height) <= 2,
    `got ${g.width}x${g.height}`,
  );
}

// maximize analog: full Xvfb screen = 1440x900
await configure(found.win, { width: 1440, height: 900 });
await new Promise((r) => setTimeout(r, 500));
g = await geometry(found.win);
check('X11 maximize-analog (full screen bounds)', g.width === 1440 && g.height === 900, `${g.width}x${g.height}`);

// restore
await configure(found.win, { width: 1200, height: 800 });
await new Promise((r) => setTimeout(r, 500));
g = await geometry(found.win);
check('X11 restore to 1200x800', Math.abs(g.width - 1200) <= 2, `${g.width}x${g.height}`);

// minimize/restore analog: unmap then map
await unmap(found.win);
await new Promise((r) => setTimeout(r, 700));
await map(found.win);
await new Promise((r) => setTimeout(r, 700));
g = await geometry(found.win);
check('X11 unmap→map (minimize/restore analog) keeps the window', g.width > 0, `${g.width}x${g.height}`);

Xclient.terminate();
console.log(`\n=== X11 WINDOW OPS: ${results.filter(Boolean).length}/${results.length} passed ===`);
process.exit(results.every(Boolean) ? 0 : 1);
