require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  SESSION_SECRET,
  ALLOWED_LOG_DISCORD_IDS = '',
  PORT = 3000
} = process.env;

const ALLOWED_LOG_IDS = ALLOWED_LOG_DISCORD_IDS.split(',').map(s => s.trim()).filter(Boolean);

// ---------- tiny JSON "database" ----------
const DB_PATH = path.join(__dirname, 'data.json');
function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ vacations: [], logs: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}
function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ---------- auth helpers ----------
function getUser(req) {
  try {
    const token = req.cookies.session;
    if (!token) return null;
    return jwt.verify(token, SESSION_SECRET);
  } catch (e) {
    return null;
  }
}
function requireAuth(req, res, next) {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Not logged in.' });
  req.user = user;
  next();
}
function isLogAdmin(user) {
  return !!user && ALLOWED_LOG_IDS.includes(user.id);
}

// ---------- Discord OAuth ----------
app.get('/auth/login', (req, res) => {
  const url = new URL('https://discord.com/api/oauth2/authorize');
  url.searchParams.set('client_id', DISCORD_CLIENT_ID);
  url.searchParams.set('redirect_uri', DISCORD_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify');
  res.redirect(url.toString());
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code from Discord.');

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('Discord token exchange failed:', tokenData);
      return res.status(400).send('Login failed. Try again.');
    }

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const discordUser = await userRes.json();

    const sessionToken = jwt.sign(
      { id: discordUser.id, username: discordUser.username, avatar: discordUser.avatar },
      SESSION_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.redirect('/');
  } catch (e) {
    console.error(e);
    res.status(500).send('Something went wrong during login.');
  }
});

app.get('/auth/logout', (req, res) => {
  res.clearCookie('session');
  res.redirect('/');
});

app.get('/api/me', (req, res) => {
  const user = getUser(req);
  if (!user) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, id: user.id, username: user.username, isLogAdmin: isLogAdmin(user) });
});

// ---------- Vacations API ----------
app.get('/api/vacations', requireAuth, (req, res) => {
  const db = readDB();
  res.json(db.vacations);
});

app.post('/api/vacations', requireAuth, (req, res) => {
  const { name, discordId, amount, unit, department, rank } = req.body;
  if (!name || !discordId || !amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Missing or invalid fields.' });
  }
  const unitMs = { hours: 3600000, days: 86400000, weeks: 604800000 };
  if (!unitMs[unit]) return res.status(400).json({ error: 'Invalid unit.' });
  const dept = ['police', 'sheriff'].includes(department) ? department : 'police';
  const rnk = ['officer', 'member'].includes(rank) ? rank : 'officer';

  const db = readDB();
  const start = Date.now();
  const end = start + Number(amount) * unitMs[unit];
  const entry = {
    id: 'v_' + start + '_' + Math.random().toString(36).slice(2, 8),
    name: String(name).slice(0, 80),
    discordId: String(discordId).slice(0, 40),
    department: dept,
    rank: rnk,
    start,
    end,
    manuallyEnded: false,
    createdBy: { id: req.user.id, username: req.user.username }
  };
  db.vacations.push(entry);
  db.logs.push({
    id: 'l_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    ts: Date.now(),
    action: 'added',
    actorId: req.user.id,
    actorUsername: req.user.username,
    targetName: entry.name,
    targetDiscordId: entry.discordId,
    note: `Added a ${amount} ${unit} vacation (${dept}, ${rnk})`
  });
  writeDB(db);
  res.json(entry);
});

app.patch('/api/vacations/:id/end', requireAuth, (req, res) => {
  const db = readDB();
  const entry = db.vacations.find(v => v.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found.' });
  entry.manuallyEnded = true;
  db.logs.push({
    id: 'l_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    ts: Date.now(),
    action: 'ended',
    actorId: req.user.id,
    actorUsername: req.user.username,
    targetName: entry.name,
    targetDiscordId: entry.discordId,
    note: 'Vacation ended manually'
  });
  writeDB(db);
  res.json(entry);
});

app.delete('/api/vacations/:id', requireAuth, (req, res) => {
  const db = readDB();
  const entry = db.vacations.find(v => v.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found.' });
  db.vacations = db.vacations.filter(v => v.id !== req.params.id);
  db.logs.push({
    id: 'l_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    ts: Date.now(),
    action: 'deleted',
    actorId: req.user.id,
    actorUsername: req.user.username,
    targetName: entry.name,
    targetDiscordId: entry.discordId,
    note: 'Entry removed'
  });
  writeDB(db);
  res.json({ ok: true });
});

// ---------- Logs API (restricted) ----------
app.get('/api/logs', requireAuth, (req, res) => {
  if (!isLogAdmin(req.user)) {
    return res.status(403).json({ error: 'You do not have access to view logs.' });
  }
  const db = readDB();
  res.json(db.logs.slice().reverse());
});

app.listen(PORT, () => console.log(`Off-duty log running on port ${PORT}`));
