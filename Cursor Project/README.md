# YourFit House

Premium streetwear & activewear brand website with admin panel.

## Live locally

```bash
./start.sh
```

- **Store:** http://localhost:3000  
- **Admin:** http://localhost:3000/admin/  
- **Login:** `admin` / `yourfithouse`

## Stack

- Static storefront (`index.html`, `css/`, `js/`)
- Node.js server (`server/standalone.js`)
- SQLite database (`data/yourfit.db`) — products, collections, sessions

## Admin

1. Sign in at `/admin/`
2. **Shop items** → products on the homepage
3. **Collections** → collection cards on the homepage

## Requirements

- Node.js 22+ (built-in SQLite support)

Optional: copy `.env.example` to `.env` to change admin password and port.

## GitHub

Repository: **[github.com/shivtumca12/YourFit](https://github.com/shivtumca12/YourFit)**

### Push to GitHub

```bash
cd "/Users/shivyadav/Documents/Cursor Project"
git remote add origin https://github.com/shivtumca12/YourFit.git
git branch -M main
git push -u origin main
```

(If `origin` already exists: `git remote set-url origin https://github.com/shivtumca12/YourFit.git`)

### GitHub Pages (storefront preview)

After pushing, enable **Pages**: **Settings → Pages → Build and deployment → GitHub Actions**.

Preview URL: **https://shivtumca12.github.io/YourFit/**

> **Note:** GitHub Pages shows the storefront design only. Admin, login, and saving items need the Node server (use [Render](https://render.com), [Railway](https://railway.app), or run `./start.sh` locally).
