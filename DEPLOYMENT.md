# Deploying Booking Platform on a VM (PM2 + Nginx)

This guide assumes an **Ubuntu 22.04+ VM** with SSH access and a public IP.
The backend is a NestJS app that listens on **port 3000** and needs
**PostgreSQL** and **Redis**.

---

## 1. SSH into the VM

```bash
ssh <user>@<YOUR_SERVER_IP>
```

## 2. Install system dependencies

```bash
# Update
sudo apt update && sudo apt upgrade -y

# Node.js 20 LTS (NestJS needs Node 18+)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Build tools, git, nginx
sudo apt install -y git build-essential nginx

# PostgreSQL + Redis
sudo apt install -y postgresql redis-server
sudo systemctl enable --now postgresql redis-server

# PM2 (global)
sudo npm install -g pm2
```

## 3. Create the database

```bash
sudo -u postgres psql <<'SQL'
CREATE DATABASE booking_platform;
CREATE USER booking WITH ENCRYPTED PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE booking_platform TO booking;
ALTER DATABASE booking_platform OWNER TO booking;
SQL
```

## 4. Clone the repo

```bash
cd ~
git clone https://github.com/RAJAT1402/Booking_Platform.git
cd Booking_Platform
```

## 5. Configure environment

```bash
cp .env.example .env
nano .env
```

Set production values (the `.env` is git-ignored, so it stays only on the VM):

```env
DATABASE_URL="postgresql://booking:CHANGE_ME_STRONG_PASSWORD@localhost:5432/booking_platform?schema=public"

GOOGLE_CLIENT_ID=<your-id>
GOOGLE_CLIENT_SECRET=<your-secret>
# Use your server IP (or domain) here, NOT localhost:
GOOGLE_CALLBACK_URL=http://<YOUR_SERVER_IP>/auth/google/callback
FRONTEND_URL=http://<YOUR_FRONTEND_HOST>/auth/callback

JWT_SECRET=<long-random-string>   # generate: openssl rand -hex 32
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=30

REDIS_URL=redis://localhost:6379
```

## 6. Install, migrate, build

```bash
npm ci                          # clean install from package-lock
npx prisma generate             # generate Prisma client
npx prisma migrate deploy       # apply migrations to the DB
npm run seed                    # optional: seed data
npm run build                   # compiles to dist/
```

## 7. Start with PM2

```bash
pm2 start ecosystem.config.js --env production
pm2 save                        # persist the process list
pm2 startup                     # prints a command — run it to enable boot-start
```

Useful PM2 commands:

```bash
pm2 status
pm2 logs booking-api
pm2 restart booking-api
pm2 reload booking-api          # zero-downtime restart
```

## 8. Configure Nginx as a reverse proxy

This puts your app on port **80** so people reach it at `http://<YOUR_SERVER_IP>`
instead of `:3000`.

```bash
sudo nano /etc/nginx/sites-available/booking-api
```

Paste (replace the IP/domain):

```nginx
server {
    listen 80;
    server_name <YOUR_SERVER_IP>;   # or your domain

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/booking-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default   # remove the default welcome page
sudo nginx -t                                 # test config
sudo systemctl reload nginx
```

## 9. Open the firewall

```bash
# If using ufw:
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

> If your VM is on a cloud provider (AWS/GCP/Azure/etc.), also open **port 80**
> (and 443 if you add HTTPS) in the cloud security group / firewall rules.

## 10. Verify

```bash
curl http://localhost:3000        # direct to app
curl http://<YOUR_SERVER_IP>      # through nginx
```

Visit `http://<YOUR_SERVER_IP>` in a browser.

---

## Redeploying after code changes

```bash
cd ~/Booking_Platform
git pull
npm ci
npx prisma migrate deploy
npm run build
pm2 reload booking-api
```

## Optional: HTTPS with a domain

If you point a domain at the IP, add free TLS:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```
