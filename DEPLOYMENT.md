#  XDM Turbo — Centralized License System & Production Deployment Guide

This guide provides complete instructions for deploying, managing, securing, and backing up the **XDM Turbo Centralized License Authority** and **Admin Dashboard**.

---

## 1. System Architecture & Cryptographic Security Model

The XDM Turbo licensing architecture replaces obsolete client-side secrets and offline HMAC hashing with a **Centralized Asymmetric Digital Signature Authority (Ed25519)**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   CENTRAL SERVER (license-server/)                    │
│                                                                        │
│  ┌───────────────────────┐      ┌───────────────────────────────────┐  │
│  │   Ed25519 Keypair     │      │   Relational SQLite DB            │  │
│  │   Private Key (PEM)   │      │   - Users & Privacy Consent       │  │
│  │   *Kept strictly on   │      │   - Licenses & Expiry Dates       │  │
│  │    server*            │      │   - Bound Devices & Last-Seen     │  │
│  └───────────┬───────────┘      │   - Security Audit Logs           │  │
│              │ Signs            └─────────────────┬─────────────────┘  │
│              ▼                                    │ Stores             │
│  ┌────────────────────────────────────────────────┴─────────────────┐  │
│  │       REST API & Web Admin Dashboard (Port 19685 / HTTPS)        │  │
│  │       - POST /api/v1/licenses/activate                           │  │
│  │       - POST /api/v1/licenses/heartbeat                          │  │
│  │       - GET/POST /api/v1/admin/* (Protected with Bearer Token)   │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────────────┼──────────────────────────────────┘
                                      │ HTTPS / WSS
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   CLIENT DESKTOP APP (XDM Turbo)                       │
│                                                                        │
│  ┌───────────────────────┐      ┌───────────────────────────────────┐  │
│  │   Ed25519 Public Key  │      │   Encrypted Local Storage         │  │
│  │   (Embedded & Safe)   │      │   ~/.xdm/license_v2.json          │  │
│  └───────────┬───────────┘      └─────────────────┬─────────────────┘  │
│              │ Verifies                           │ Caches             │
│              ▼                                    ▼                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │               LicenseManager.js Client Engine                    │  │
│  │  - Non-invasive Hardware ID Hash (MachineGuid/Platform/Arch)     │  │
│  │  - 30-minute Heartbeat to sync status & refresh grace window     │  │
│  │  - 7-Day Cryptographic Offline Grace Period                      │  │
│  │  - Zero download engine interruption during offline periods       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Security Guarantees:
1. **Asymmetric Key Separation:** The private key (`ed25519_private.pem`) exists **only on the hosted license server**. The client binary contains only the public key. Even if attackers decompile or modify client memory, they **cannot forge** valid license tokens.
2. **Server-Enforced Seat Limits:** Each license has an administrator-configurable `max_devices` limit. Activation on excess devices is rejected at the server level (HTTP 403).
3. **Instant Remote Revocation & Suspension:** If a key is marked as `revoked` or `suspended` in the admin dashboard, the client application automatically downgrades to Free mode on its next heartbeat, unlinking the local token file.
4. **Hardware Identification Without Intrusiveness:** The device identifier is computed using a SHA-256 hash of non-invasive system attributes (`MachineGuid`, CPU model, motherboard model). No passwords, MAC addresses, personal files, or browsing records are ever inspected or transmitted.

---

## 2. Environment Variables & Configuration

### License Server Configuration

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Set to `production` in live environments |
| `LICENSE_SERVER_PORT` | `19685` | Port the Express server listens on |
| `DATABASE_PATH` | `./data/licenses.db` | Absolute or relative path to SQLite database |
| `ED25519_KEY_DIR` | `./data` | Directory where Ed25519 PEM keys reside |
| `ED25519_PRIVATE_KEY_PATH` | `./data/ed25519_private.pem` | Path to server private signing key |
| `ED25519_PUBLIC_KEY_PATH` | `./data/ed25519_public.pem` | Path to public verification key |
| `DEFAULT_ADMIN_USER` | `admin` | Username for master administrator |
| `DEFAULT_ADMIN_PASS` | `zihan2026` | Initial password (change immediately after first login) |

### Client Desktop App Configuration

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `XDM_LICENSE_SERVER_URL` | `http://127.0.0.1:19685` | URL of the central licensing authority |
| `XDM_LICENSE_PUBLIC_KEY` | *(Built-in)* | Optional override of the Ed25519 public key |

> [!NOTE]
> End users can also change the Server URL directly inside the desktop application via **License Settings > Custom Server URL**.

---

## 3. Production Deployment Methods

### Option A: Docker & Docker Compose (Recommended)

1. **Clone or copy the `license-server/` directory to your production VPS:**
   ```bash
   scp -r license-server user@your-server-ip:/opt/xdm-license-server
   cd /opt/xdm-license-server
   ```

2. **Verify permissions and start the container:**
   ```bash
   docker compose up -d --build
   ```

3. **Check container status and logs:**
   ```bash
   docker compose ps
   docker compose logs -f
   ```

4. **Verify health endpoint:**
   ```bash
   curl http://localhost:19685/api/v1/health
   ```

---

### Option B: Linux VPS with PM2 & Systemd

Requirements: Ubuntu 22.04 / 24.04 LTS, Node.js 22+ or 24+.

1. **Install Node.js 24 and PM2:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
   sudo apt-get install -y nodejs
   sudo npm install -g pm2
   ```

2. **Deploy the application files:**
   ```bash
   sudo mkdir -p /var/www/xdm-license-server
   sudo chown -R $USER:$USER /var/www/xdm-license-server
   cp -r license-server/* /var/www/xdm-license-server/
   cd /var/www/xdm-license-server
   npm install --omit=dev
   ```

3. **Create an environment file (`.env`):**
   ```bash
   cat <<EOF > /var/www/xdm-license-server/.env
   NODE_ENV=production
   LICENSE_SERVER_PORT=19685
   DATABASE_PATH=/var/www/xdm-license-server/data/licenses.db
   ED25519_KEY_DIR=/var/www/xdm-license-server/data
   DEFAULT_ADMIN_USER=admin
   DEFAULT_ADMIN_PASS=ChangeThisSecurePassword2026!
   EOF
   ```

4. **Start and persist with PM2:**
   ```bash
   pm2 start server.js --name "xdm-license-authority" --env .env
   pm2 save
   pm2 startup
   ```

---

## 4. HTTPS & Reverse Proxy Configuration (Nginx + Let's Encrypt)

Never expose HTTP directly to the public internet for licensing. Always terminate SSL/TLS via a reverse proxy.

### 1. Nginx Virtual Host Configuration

Create `/etc/nginx/sites-available/xdm.zihan.xyz`:

```nginx
server {
    server_name xdm.zihan.xyz;

    # Rate limiting zone definition
    limit_req_zone $binary_remote_addr zone=license_limit:10m rate=30r/m;

    location / {
        proxy_pass http://127.0.0.1:19685;
        proxy_http_version 1.1;
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    # Strict rate limiting on activation endpoints
    location /api/v1/licenses/activate {
        limit_req zone=license_limit burst=10 nodelay;
        proxy_pass http://127.0.0.1:19685;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 2. Enable Site and Provision SSL Certificate

```bash
sudo ln -s /etc/nginx/sites-available/xdm.zihan.xyz /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Install Certbot and obtain free Let's Encrypt certificate
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d xdm.zihan.xyz
```

---

## 5. Database Concurrency & Automated Backups

The license authority uses Node.js 24's native `node:sqlite` engine running in Write-Ahead Logging (`WAL`) mode:
- Readers do not block writers, and writers do not block readers.
- Handles thousands of concurrent client heartbeats effortlessly with minimal CPU/RAM overhead.

### Automated Daily Backup Script

Create `/opt/scripts/backup-licenses.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/xdm-licenses"
DB_SOURCE="/var/www/xdm-license-server/data/licenses.db"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

mkdir -p "$BACKUP_DIR"

# Zero-downtime online backup using SQLite VACUUM INTO
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('$DB_SOURCE');
db.exec(\"VACUUM INTO '$BACKUP_DIR/licenses_$TIMESTAMP.db'\");
console.log('Backup created successfully.');
"

# Keep last 30 days of backups
find "$BACKUP_DIR" -name "licenses_*.db" -mtime +30 -exec rm {} \;
```

Set executable permissions and configure cron job:
```bash
chmod +x /opt/scripts/backup-licenses.sh
# Run every night at 3:00 AM
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/scripts/backup-licenses.sh > /dev/null 2>&1") | crontab -
```

---

## 6. Online & Offline Behavior Specification

| Scenario | Client Behavior | Download Engine Impact |
| :--- | :--- | :--- |
| **Initial Online Activation** | Client transmits key + device hash to server. Server verifies seat limit, registers device, and returns token signed with Ed25519. | Instant PRO upgrade (32 streams, 4K grabber unlocked). |
| **Internet Connected (Normal Operation)** | Client sends periodic heartbeat every 30 mins. Server updates `last_seen_at` and issues an updated 7-day grace window. | Fully active PRO features with live telemetry. |
| **Temporary Outage / Slow Connection** | Server unreachable. Client falls back to verifying local cryptographic token with embedded public key. If `currentTime < graceUntil`, PRO remains active. | **Zero interruption.** Ongoing downloads, queues, and PRO acceleration continue smoothly. |
| **Offline Extended Beyond 7 Days** | Cryptographic grace window expires. Client transitions to `grace_expired` mode until connection to license server is re-established. | Downgrades to Free edition (6 connections). Downloads are never deleted or corrupted. |
| **Remote Revocation by Admin** | Next online heartbeat receives HTTP 403 `revoked`. Client unlinks `license_v2.json` and resets to Free tier immediately. | Reverts to Free tier immediately upon receiving server heartbeat response. |
| **Remote Device Unbind** | Admin unbinds device in dashboard to free seat. Next heartbeat detects inactive binding and clears local license. | Frees slot on server so a new device can activate. |

> [!IMPORTANT]
> **Remote Revocation Limitation:** Remote revocation requires network connectivity. If a user permanently disconnects their PC from the internet, the application remains in PRO mode for a maximum of 7 days (the offline grace period), after which it automatically expires. Immediate revocation cannot be enforced on physically offline hardware.

---

## 7. Audit Logging & Privacy Disclosure

The license server strictly enforces privacy principles:
- **No Personal Files:** The server never inspects filesystem contents, browser history, or downloaded file names.
- **No Plain Passwords:** Admin authentication uses high-cost `scrypt` hashing with unique cryptographic salts.
- **Accurate Live-User Metrics:** Users are categorized as "Active Now" only if their device transmitted a valid heartbeat within the last **15 minutes**. Past activations without recent heartbeats are labeled as inactive.
- **Auditing:** All critical events (`activation_success`, `activation_failed`, `license_revoked`, `license_suspended`, `device_deactivated`, `admin_login`) are logged with timestamp, event type, masked identifiers, and client IP for forensic security.

---

## 8. Current Implementation Status vs. Production Prerequisites

| Feature | Local Workspace (`E:\XDM`) Status | Production Deployment Requirement |
| :--- | :--- | :--- |
| **Ed25519 Asymmetric Cryptography** |  Fully Implemented (`crypto.js`) | Ready for production. Keep private key secure. |
| **Database & Schema (`node:sqlite`)** |  Fully Implemented (`database.js`) | Ready for production. Mount persistent volume. |
| **Express License Server (Port 19685)** |  Fully Implemented (`server.js`) | Deploy behind Nginx reverse proxy with HTTPS. |
| **Web Admin Dashboard** |  Fully Implemented (`public/index.html`) | Accessible via `http://127.0.0.1:19685/admin` or domain. |
| **Desktop Client Engine** |  Fully Implemented (`LicenseManager.js`) | Configured with public key & 7-day grace period. |
| **Automated Test Suite (19 Tests)** |  100% Passed (`tests/license-system.test.js`) | Can run in CI/CD pipelines (`node --test`). |
| **Production Domain & Public DNS** |  Production Active | Configured DNS A-record on `xdm.zihan.xyz`. |
| **Public HTTPS / SSL Certificate** | Pending (Local HTTP) | Run Let's Encrypt / Certbot on production server. |

---

## 9. Verification & Quick-Start Commands

### 1. Run Automated Test Suite
```bash
node --test tests/license-system.test.js
```

### 2. Generate a License Key from Terminal
```bash
node scripts/keygen.js --count 1 --name "Customer Name" --devices 1
```

### 3. Start Local License Server
```bash
node license-server/server.js
```

### 4. Access Local Admin Dashboard
Open in your browser:
```
http://127.0.0.1:19685/admin
```
- **Default Username:** `admin`
- **Default Password:** `zihan2026`
