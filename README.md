# Sheikh Desktop Sandbox

This repository contains an MVP for the Sheikh Desktop Sandbox: ephemeral desktop sandboxes (Xfce + noVNC) managed by a Node manager and runnable locally using Docker.

## Quickstart

1. Build the desktop image:

```bash
docker build -t sheikh/desktop:local -f infra/Dockerfile.desktop .
```

2. Start the manager:

```bash
cd manager
npm install
node server.js
```

3. Open `http://localhost:4000` and create a session.

## Next steps

* Replace Docker runtime with Firecracker or gVisor for production isolation
* Add agent unix-socket JSON-RPC and manager -> agent secure channel
* Implement screenshot endpoint and automation actions
* Add auth, audit logs, and RAG memory integration
