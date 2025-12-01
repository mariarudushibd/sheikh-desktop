const express = require('express');
const Docker = require('dockerode');
const crypto =require('crypto');
const docker = new Docker(); // assumes /var/run/docker.sock
const app = express();
app.use(express.json());

const IMAGE = 'sheikh/desktop:local';
const sessions = {};

async function createContainer() {
  const container = await docker.createContainer({
    Image: IMAGE,
    ExposedPorts: { "6080/tcp": {}, "5900/tcp": {} },
    HostConfig: {
      AutoRemove: true,
      PortBindings: {
        "6080/tcp": [{ HostPort: "" }],
        "5900/tcp": [{ HostPort: "" }]
      },
      Memory: 1024 * 1024 * 1024, // 1GB
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

app.listen(4000, () => console.log('Manager running on http://localhost:4000'));
