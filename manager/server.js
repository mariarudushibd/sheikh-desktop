const express = require('express');
const Docker = require('dockerode');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs/promises');
const net = require('net');

const docker = new Docker(); // uses /var/run/docker.sock
const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..', 'web-ui')));

const IMAGE = 'sheikh/desktop:local';
const sessions = {};

// Helper to send JSON-RPC requests to the agent's unix socket
async function sendAgentRequest(sessionId, method, params) {
  const session = sessions[sessionId];
  if (!session) throw new Error('Session not found');
  const socketPath = path.join(session.hostSocketDir, 'agent.sock');

  return new Promise((resolve, reject) => {
    const client = net.createConnection({ path: socketPath });
    const request = {
      method: `Agent.${method}`,
      params: [params],
      id: 1, // A simple ID for this single request
    };

    client.on('connect', () => {
      client.write(JSON.stringify(request));
    });

    let responseData = '';
    client.on('data', (data) => {
      responseData += data.toString();
      // Basic check to see if we have a full JSON object.
      // A more robust solution would handle streaming JSON.
      try {
        const responseObject = JSON.parse(responseData);
        if (responseObject.error) {
          reject(new Error(responseObject.error));
        } else {
          resolve(responseObject.result);
        }
        client.end();
      } catch (e) {
        // Incomplete data, wait for more.
      }
    });

    client.on('error', (err) => reject(err));
    client.on('end', () => {
      if (!responseData) {
        reject(new Error('No response from agent'));
      }
    });
  });
}


async function createContainer(sid) {
  const hostSocketDir = await fs.mkdtemp(`/tmp/sheikh-session-${sid}-`);

  const container = await docker.createContainer({
    Image: IMAGE,
    ExposedPorts: { '6080/tcp': {}, '5900/tcp': {} },
    HostConfig: {
      AutoRemove: true,
      PortBindings: {
        '6080/tcp': [{ HostPort: '' }],
        '5900/tcp': [{ HostPort: '' }]
      },
      Binds: [`${hostSocketDir}:/tmp`],
      Memory: 1024 * 1024 * 1024,
      CpuShares: 512,
      // Use gVisor runtime for enhanced security.
      // Note: gVisor must be installed and configured on the host Docker daemon.
      Runtime: 'gvisor'
    }
  });
  await container.start();
  const info = await container.inspect();
  const port = info.NetworkSettings.Ports['6080/tcp'][0].HostPort;
  return { id: info.Id, port, hostSocketDir };
}

app.post('/sessions', async (req, res) => {
  const sid = crypto.randomBytes(8).toString('hex');
  try {
    const { id, port, hostSocketDir } = await createContainer(sid);
    sessions[sid] = { containerId: id, port, hostSocketDir, created: Date.now() };
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
    await fs.rm(s.hostSocketDir, { recursive: true, force: true });
    delete sessions[req.params.sid];
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Updated exec endpoint to use the agent's unix socket
app.post('/sessions/:sid/exec', async (req, res) => {
  const s = sessions[req.params.sid];
  if (!s) return res.status(404).json({ error: 'session not found' });
  const { cmd = '', timeout = 60 } = req.body;
  if (!cmd) return res.status(400).json({ error: 'cmd required' });

  try {
    const result = await sendAgentRequest(req.params.sid, 'Exec', { Cmd: cmd, Timeout: timeout });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


app.get('/sessions', (req, res) => res.json(Object.keys(sessions)));

// Screenshot endpoint
app.post('/sessions/:sid/screenshot', async (req, res) => {
  if (!sessions[req.params.sid]) return res.status(404).json({ error: 'session not found' });
  const { quality = 90 } = req.body;

  try {
    const result = await sendAgentRequest(req.params.sid, 'Screenshot', { Quality: quality });
    // The agent now returns a base64 encoded string, so we can just pass it through.
    res.json({ image: result.Image });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// UI Click endpoint
app.post('/sessions/:sid/ui/click', async (req, res) => {
    if (!sessions[req.params.sid]) return res.status(404).json({ error: 'session not found' });
    const { x, y } = req.body;
    if (x === undefined || y === undefined) return res.status(400).json({ error: 'x and y coordinates are required' });

    try {
        await sendAgentRequest(req.params.sid, 'UIClick', { X: x, Y: y });
        res.status(204).send();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// UI Keys endpoint - NOTE: We'll need to add this method to the agent.
app.post('/sessions/:sid/ui/keys', async (req, res) => {
    if (!sessions[req.params.sid]) return res.status(404).json({ error: 'session not found' });
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });

    try {
        await sendAgentRequest(req.params.sid, 'UIKeys', { Text: text });
        res.status(204).send();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});


app.listen(4000, () => console.log('Manager running on http://localhost:4000'));
