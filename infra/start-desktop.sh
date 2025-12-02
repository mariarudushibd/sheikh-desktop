#!/bin/bash
set -e

export DISPLAY=:1

# start xvfb
Xvfb :1 -screen 0 1280x800x24 >/tmp/xvfb.log 2>&1 &
sleep 1

# start xfce session
startxfce4 &>/tmp/xfce4.log &
sleep 2

# start x11vnc (serve display)
x11vnc -display :1 -nopw -forever -shared -listen 0.0.0.0 &>/tmp/x11vnc.log &

# start noVNC (websockify)
cd /opt/noVNC && ./utils/novnc_proxy --vnc localhost:5900 --listen 6080 &>/tmp/novnc.log &

# start the agent
/usr/local/bin/agent &>/tmp/agent.log &

# Keep container alive
tail -f /dev/null
