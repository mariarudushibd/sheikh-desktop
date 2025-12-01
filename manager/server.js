const express = require('express');
const Docker = require('dockerode');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const path = require('path');

const docker = new Docker(); // uses /var/run/docker.sock
const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..', 'web-ui')));

const IMAGE = 'sheikh/desktop:local';
const sessions = {};

async function createContainer() {
  const container = await docker.createContainer({
    Image: IMAGE,
    ExposedPorts: { '6080/tcp': {}, '5900/tcp': {} },
    HostConfig: {
      AutoRemove: true,
      PortBindings: {
        '6080/tcp': [{ HostPort: '' }],
        '5900/tcp': [{ HostPort: '' }]
      },
      Memory: 1024 * 1024 * 1024,
      CpuShares: 512
    }
  });
  await container.start();
  const info = await container.inspect();
  const port = info.NetworkSettings.Ports['6080/tcp'][0].HostPort;
  return { id: info.Id, port };
}

app.post('/sessions', async (req, res) => {
  try {
    const { id, port } = await createContainer();
    const sid = crypto.randomBytes(8).toString('hex');
    sessions[sid] = { containerId: id, port, created: Date.now() };
    return res.json({ sessionId: sid, url: `http://localhost:${port}/vnc.html` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/sessions/:sid', async (req, res) => {
  const s = sessions[req.params.sid];
  if (!s) return res.status(404).send('not found');
  try {
    const c = docker.getContainer(s.containerId);
    await c.kill();
    delete sessions[req.params.sid];
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Basic command proxy: docker exec into container and run command via sh
app.post('/sessions/:sid/exec', async (req, res) => {
  const s = sessions[req.params.sid];
  if (!s) return res.status(404).json({ error: 'session not found' });
  const { cmd = '', timeout = 60000 } = req.body;
  if (!cmd) return res.status(400).json({ error: 'cmd required' });
  try {
    const container = docker.getContainer(s.containerId);
    const exec = await container.exec({ Cmd: ['bash', '-lc', cmd], AttachStdout: true, AttachStderr: true });
    const stream = await exec.start({ hijack: true, stdin: false });
    let output = '';
    stream.on('data', (chunk) => { output += chunk.toString('utf8'); });
    stream.on('end', () => {
      res.json({ exit: 0, output });
    });
    // safety: timeout fallback
    setTimeout(() => {
      try { res.json({ exit: -1, output: output + '\n[timeout]' }); } catch (_) {}
    }, timeout);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/sessions', (req, res) => res.json(Object.keys(sessions)));

app.listen(4000, () => console.log('Manager running on http://localhost:4000'));
