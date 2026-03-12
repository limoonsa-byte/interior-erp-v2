const { spawn } = require('child_process');
const path = require('path');
const open = require('open');

const cwd = path.join(__dirname, '..');
const waitOn = spawn('npx', ['wait-on', 'http://localhost:3000', '-t', '60000'], {
  stdio: 'inherit',
  shell: true,
  cwd,
});

waitOn.on('close', (code) => {
  if (code === 0) open('http://localhost:3000');
});
