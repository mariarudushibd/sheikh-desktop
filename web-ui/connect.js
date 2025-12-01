async function createSession() {
  const res = await fetch('/sessions', { method: 'POST' });
  if (!res.ok) {
    const t = await res.text();
    document.getElementById('out').innerText = 'Error: ' + t;
    return;
  }
  const j = await res.json();
  const url = j.url + '?resize=screen&autoconnect=true';
  const win = window.open(url, '_blank');
  if (!win) document.getElementById('out').innerText = 'Opened URL: ' + url;
}

document.getElementById('create').addEventListener('click', createSession);
