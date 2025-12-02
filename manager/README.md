# Sheikh Desktop Manager

This Node service manages desktop sandbox sessions using Docker. It exposes simple endpoints to create and destroy sessions and to run shell commands inside a session.

Run locally:

```bash
cd manager
npm install
node server.js
```

Create a session (example):

```bash
curl -X POST http://localhost:4000/sessions
```

Then open the returned `url` in your browser.
