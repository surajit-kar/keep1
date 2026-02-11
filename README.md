# Org Keep (Google Keep-style Notes App)

A lightweight Google Keep-inspired note-taking web app for organizations, with:

- Rich note cards (title/content/color/pinned)
- Labels for organization-level categorization
- Search across title, content, and labels
- File attachment upload/download per note
- REST API + single-page web UI

## Tech Stack

- Node.js built-in HTTP server (no external runtime dependencies)
- Custom multipart parser for attachment uploads
- JSON file persistence (`data/notes.json`)
- Vanilla HTML/CSS/JS frontend

## Run Locally

```bash
npm install
npm start
```

Open: `http://localhost:3000`

## API Endpoints

- `GET /api/health`
- `GET /api/notes?search=<text>&label=<name>`
- `POST /api/notes` (multipart form, accepts `attachments` files)
- `PUT /api/notes/:id`
- `DELETE /api/attachments/:attachmentId`
- `DELETE /api/notes/:id`

---

## AWS Ubuntu Server Deployment (Step-by-Step)

This section is a practical, production-oriented setup for deploying this app on an AWS EC2 Ubuntu server.

## Prerequisites

- AWS account access
- Domain name (recommended for HTTPS)
- SSH key pair (`.pem`) for EC2 login

## Step 1: Launch EC2 instance

1. Go to AWS Console → EC2 → **Launch instance**.
2. Choose:
   - **AMI:** Ubuntu Server 22.04 LTS
   - **Instance type:** `t3.small` (minimum recommended for small team use)
3. Create/select a key pair and download the `.pem` file.
4. Configure Security Group inbound rules:
   - `22` (SSH) from your office IP only
   - `80` (HTTP) from `0.0.0.0/0`
   - `443` (HTTPS) from `0.0.0.0/0`
5. Launch instance.
6. Allocate and attach an **Elastic IP** (recommended) so public IP doesn’t change.

## Step 2: SSH into the server

From your local machine:

```bash
chmod 400 /path/to/your-key.pem
ssh -i /path/to/your-key.pem ubuntu@<EC2_PUBLIC_IP>
```

## Step 3: Update OS and install Node.js + Nginx

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git
node -v
npm -v
nginx -v
```

## Step 4: (Optional but recommended) enable firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```

## Step 5: Deploy app code

```bash
cd /home/ubuntu
git clone <your-repo-url> org-keep
cd org-keep
npm install --omit=dev
```

## Step 6: Start app once for a quick validation

```bash
PORT=3000 node server.js
```

Open another terminal and test:

```bash
curl http://127.0.0.1:3000/api/health
```

Expected output:

```json
{"ok":true}
```

Press `Ctrl+C` to stop the manual run.

## Step 7: Create systemd service (run app in background)

```bash
sudo tee /etc/systemd/system/org-keep.service >/dev/null <<'SERVICE'
[Unit]
Description=Org Keep App
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/org-keep
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable org-keep
sudo systemctl start org-keep
sudo systemctl status org-keep --no-pager
```

Useful service commands:

```bash
sudo systemctl restart org-keep
sudo systemctl stop org-keep
sudo journalctl -u org-keep -f
```

## Step 8: Configure Nginx as reverse proxy

```bash
sudo tee /etc/nginx/sites-available/org-keep >/dev/null <<'NGINX'
server {
    listen 80;
    server_name _;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/org-keep /etc/nginx/sites-enabled/org-keep
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl status nginx --no-pager
```

Now browse:

```text
http://<EC2_PUBLIC_IP>
```

## Step 9: Configure domain (recommended)

In your DNS provider:

- Create `A` record for `yourdomain.com` → `<EC2_ELASTIC_IP>`
- Create `A` record for `www.yourdomain.com` → `<EC2_ELASTIC_IP>`

Then update Nginx config `server_name`:

```nginx
server_name yourdomain.com www.yourdomain.com;
```

Apply changes:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Step 10: Enable HTTPS (Let’s Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Validate auto-renew:

```bash
sudo certbot renew --dry-run
```

## Step 11: Verify app end-to-end

From server:

```bash
curl -I http://127.0.0.1:3000/api/health
curl -I http://127.0.0.1
```

From your laptop/browser:

- Open `https://yourdomain.com`
- Create a note
- Upload an attachment
- Search note by title/label

## Step 12: Backup and operations

Critical data paths:

- `/home/ubuntu/org-keep/data/notes.json`
- `/home/ubuntu/org-keep/uploads/`

Simple backup example (daily cron to tar and copy elsewhere):

```bash
tar -czf org-keep-backup-$(date +%F).tar.gz data uploads
```

## Common issues and fixes

1. **502 Bad Gateway in Nginx**
   - App may be down. Check:
     ```bash
     sudo systemctl status org-keep
     sudo journalctl -u org-keep -n 100 --no-pager
     ```

2. **Attachment upload fails**
   - Verify `client_max_body_size` in Nginx.
   - Check writable permissions on `uploads/`.

3. **Cannot access site publicly**
   - Check EC2 Security Group rules for 80/443.
   - If UFW enabled, ensure `Nginx Full` is allowed.

4. **SSL certificate issue**
   - DNS may not be pointing correctly to your EC2 public IP.
   - Re-run `sudo certbot --nginx -d ...` after DNS propagates.

## Limitations / Next hardening steps

For production at larger organization scale, add:

- SSO (Google Workspace / Azure AD / Okta)
- Role-based access control and audit logs
- Virus scanning for attachments
- S3 object storage instead of local disk
- Database (PostgreSQL) with migrations
- Redis caching and background workers
- Full-text search indexing
- WAF + rate limiting + centralized monitoring

