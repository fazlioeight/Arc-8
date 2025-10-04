// Creates a small shim file at node_modules/react-router-dom/dist/index.mjs
// if it does not already exist. This helps avoid source-map resolution errors
// from tools that try to open `index.mjs` even though the package ships `index.js`.

const fs = require('fs');
const path = require('path');

try {
  const distDir = path.join(process.cwd(), 'node_modules', 'react-router-dom', 'dist');
  const target = path.join(distDir, 'index.mjs');
  if (!fs.existsSync(target)) {
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(target, "// Generated shim: re-export from index.js\nexport * from './index.js';\n", 'utf8');
    console.log('Created react-router-dom/dist/index.mjs shim.');
  }
} catch (err) {
  // Don't fail install if this can't be created (e.g. in read-only installs).
  console.error('postinstall-shim failed:', err && err.message ? err.message : err);
}
