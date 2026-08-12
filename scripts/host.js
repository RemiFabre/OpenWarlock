// Host a game on the public internet: starts the server, then opens a tunnel.
//   npm run host            -> cloudflared quick tunnel (if installed) or localtunnel
// The printed https URL can be opened by anyone in the world.

import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

// 1) start the game server in this process group
const server = spawn(process.execPath, [path.join(__dirname, '../server/index.js')], {
  stdio: 'inherit',
  env: { ...process.env, PORT: String(PORT) },
});

function has(cmd) {
  try { execSync(`command -v ${cmd}`, { stdio: 'ignore', shell: '/bin/sh' }); return true; }
  catch { return false; }
}

function banner(url, via) {
  console.log('\n  ────────────────────────────────────────────────');
  console.log(`  PUBLIC URL (share this with your friends):`);
  console.log(`\n      ${url}\n`);
  console.log(`  tunnel: ${via} · game stays up while this runs (Ctrl-C stops it)`);
  console.log('  ────────────────────────────────────────────────\n');
}

setTimeout(() => {
  if (has('cloudflared')) {
    const tun = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`]);
    const scan = (buf) => {
      const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && !scan.done) { scan.done = true; banner(m[0], 'cloudflare quick tunnel'); }
    };
    tun.stdout.on('data', scan);
    tun.stderr.on('data', scan);
    tun.on('exit', (c) => { console.error(`cloudflared exited (${c})`); });
    process.on('exit', () => tun.kill());
  } else {
    console.log('  cloudflared not found; falling back to localtunnel (npx).');
    console.log('  For a smoother tunnel: brew install cloudflared\n');
    const tun = spawn('npx', ['-y', 'localtunnel', '--port', String(PORT)], { shell: false });
    tun.stdout.on('data', (buf) => {
      const m = String(buf).match(/https:\/\/[a-z0-9-]+\.loca\.lt/);
      if (m) {
        banner(m[0], 'localtunnel');
        console.log('  note: visitors may see a one-time "tunnel password" page;');
        console.log('  the password is your public IP (curl ifconfig.me).\n');
      }
    });
    tun.stderr.on('data', (b) => process.stderr.write(b));
    process.on('exit', () => tun.kill());
  }
}, 800);

process.on('SIGINT', () => { server.kill(); process.exit(0); });
server.on('exit', (code) => process.exit(code ?? 0));
