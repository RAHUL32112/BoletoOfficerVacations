# Off-Duty Log

A shared vacation tracker for GTA RP server cops. Everyone logs in with Discord to
add or end vacations; only Discord IDs you approve can view the activity log.

## What you need to do (step by step)

### 1. Create a Discord Application (for login)
1. Go to https://discord.com/developers/applications → **New Application** → give it any name.
2. Left sidebar → **OAuth2** → copy the **Client ID** and **Client Secret**.
3. Still on the OAuth2 page, under **Redirects**, click **Add Redirect** and add:
   `https://YOUR-DOMAIN-OR-RENDER-URL/auth/callback`
   (You can add the temporary Render URL now and add your real domain later — you can have multiple redirects listed.)

### 2. Put your project on GitHub
Hosting platforms deploy from a Git repository.
1. Create a free GitHub account if you don't have one: https://github.com
2. Create a new repository, then upload this whole `vacation-tracker` folder to it
   (GitHub's website lets you drag-and-drop files if you don't want to use git commands).

### 3. Deploy on Render (free to start)
1. Go to https://render.com and sign up (you can sign in with GitHub).
2. **New** → **Web Service** → connect the repository you just created.
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Under **Environment**, add these variables (values from Step 1 and your own choices):
   - `DISCORD_CLIENT_ID`
   - `DISCORD_CLIENT_SECRET`
   - `DISCORD_REDIRECT_URI` → `https://YOUR-RENDER-URL.onrender.com/auth/callback` at first
   - `SESSION_SECRET` → any long random string
   - `ALLOWED_LOG_DISCORD_IDS` → comma-separated Discord user IDs allowed to view logs
     (To get someone's Discord ID: Discord Settings → Advanced → enable Developer Mode,
     then right-click their name → Copy User ID)
5. Click **Deploy**. Render will give you a URL like `https://off-duty-log.onrender.com`.
6. Test it — visit the URL, log in with Discord, add a test vacation.

### 4. Connect your own domain
1. Buy a domain from any registrar (Namecheap, Cloudflare, Google Domains, etc.) if you don't have one yet.
2. In Render, go to your service → **Settings** → **Custom Domain** → add your domain.
   Render will show you a DNS record (usually a CNAME) to add at your registrar.
3. Add that record in your domain's DNS settings. It can take up to a few hours to activate.
4. Once your domain works, go back to your Discord Application's OAuth2 redirects and
   add: `https://yourdomain.com/auth/callback`, then update the `DISCORD_REDIRECT_URI`
   environment variable in Render to match your real domain, and redeploy.

## ⚠️ Important: about data persistence
This project stores data in a simple file (`data.json`) for simplicity. On Render's
**free** tier, the disk is wiped whenever the service restarts or redeploys — meaning
your roster and logs could reset unexpectedly.

To make data permanent, do **one** of these:
- Upgrade to a Render paid instance and add a **Persistent Disk** (a few dollars/month), or
- Ask me to switch the storage to a free hosted database (e.g. Supabase's free Postgres),
  which keeps data safe regardless of restarts — this is the more reliable option long-term
  and doesn't cost anything at this scale.

I'd recommend the Supabase option if this is going to be a real tool your server relies on —
just let me know and I'll wire it in.

## Running it locally to test first (optional)
```
npm install
cp .env.example .env   # then fill in your real values
npm start
```
Visit http://localhost:3000
