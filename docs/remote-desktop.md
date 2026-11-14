# Remote desktops in the browser

Users start a remote desktop (TurboVNC, TigerVNC or VirtualGL + TurboVNC) as a
job and open it in the browser with [noVNC](https://novnc.com). Nothing to
install on their machine, and compute nodes don't need to be reachable from
users' networks.

```
browser ──wss──▶ nginx /vnc-ws ──▶ websockify (127.0.0.1:6080) ──VNC──▶ compute node :59xx
                     │
                     └─ auth_request ──▶ portal /api/vnc/authorize  (does this user own the token?)
```

## How a session works

1. The job script starts the VNC server with a **random one-time password**
   (`apps/templates/remote/vnc/web_auth.sh`) and writes `<job>.web` (host,
   port, password; mode 600) in the job directory.
2. When the user clicks **Connect**, the portal reads that file *as the user*,
   creates a random token, and writes `<token>: <host>:<port>` into the token
   folder. Only the portal (root) can write there, so nobody can route a token to
   a host of their choice.
3. The browser opens `wss://<portal>/vnc-ws?token=…`. nginx asks the portal
   whether the logged-in user owns that token, then hands the connection to
   websockify, which looks the token up and connects to the node.
4. The token is removed when the job ends, and after `vnc_token_ttl_hours`
   in any case.

Remote desktops never run without a password, even if `remote_security` is
`"none"`. Traffic between websockify and the nodes is VNC (password auth, not
encrypted), so keep it on the cluster's internal network. Browser traffic is
TLS.

## Setup

### 1. Install websockify on the portal host

```bash
# RHEL/Rocky/Alma (EPEL), Fedora
dnf install -y python3-websockify
# Debian/Ubuntu
apt-get install -y websockify
```

### 2. Token folder and service user

websockify runs as its own user and reads the token folder through its group:

```bash
useradd --system --no-create-home --shell /sbin/nologin qhpc-vnc
# setgid: files the portal creates inherit the qhpc-vnc group
install -d -m 2750 -o root -g qhpc-vnc /var/lib/qhpc-portal/tmp/vnc-tokens
```

If you set `vnc_token_dir` or `tmpdir` in `config.json`, use that folder here
and in the unit file.

### 3. Run websockify

```bash
cp /opt/qhpc-portal/deploy/systemd/qhpc-websockify.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now qhpc-websockify
```

### 4. nginx

The shipped `deploy/nginx/qhpc-portal.conf` already has the `/vnc-ws` and
`/_vnc_authorize` blocks. If you wrote your own config, copy them from there.
`auth_request` needs nginx's `http_auth_request` module (included in the
distribution packages).

On SELinux systems nginx must be allowed to connect to websockify:

```bash
setsebool -P httpd_can_network_connect 1
```

### 5. Firewall

The portal host must reach the compute nodes on the VNC ports
(5900–5999 by default). Users' machines don't need access to the nodes.

### 6. Configuration

In `config.json` (defaults shown):

```jsonc
"remote": "turbovnc",           // or tigervnc, virtualgl (see apps/remotelist.json)
"vnc_websocket_url": "/vnc-ws", // where the browser connects; same origin through nginx
"vnc_token_dir": "",            // blank = <tmpdir>/vnc-tokens
"vnc_token_ttl_hours": 12
```

## Development

There is no nginx in development, so point the browser straight at websockify
(this skips the ownership check; never do it in production):

```bash
python3 -m pip install --user websockify
websockify --token-plugin TokenFile --token-source /tmp/qhpc-vnc-tokens 127.0.0.1:6080
```

```jsonc
// config/config.json
"vnc_websocket_url": "ws://localhost:6080/",
"vnc_token_dir": "/tmp/qhpc-vnc-tokens",
```

A local `Xvnc :57 -rfbauth <file> -SecurityTypes VncAuth -rfbport 5957` plus
a job record whose `<job>.web` points at `localhost:5957` is enough to try the
page at `/interactive/<jobId>/vnc`.

## Troubleshooting

| Symptom | Check |
|---|---|
| "The desktop is starting…" never ends | The job's `<job>.web` file: is the job running, did `vncserver` start (job output), is `vncpasswd` installed on the node? |
| "Connection lost." right away | `journalctl -u qhpc-websockify`: token not found (folder permissions, `vnc_token_dir`), or the node's VNC port is blocked from the portal host. |
| nginx 500 on `/vnc-ws` | `auth_request` module missing, or the portal is down. |
| "Authentication failed" | The VNC server isn't using the generated password: a site starter script that ignores `VNC_RFBAUTH`. |
