import { Router } from 'express';
import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';
import { config } from '../config.js';

const router = Router();

// Expect body: { access_token: string }
router.post('/google', async (req, res) => {
  try {
    const { access_token } = req.body ?? {};
    if (!access_token) return res.status(400).json({ error: 'access_token is required' });

    // Fetch userinfo from Google
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!r.ok) {
      const errText = await r.text();
      console.error('Google userinfo error', errText);
      return res.status(401).json({ error: 'Invalid Google token' });
    }
    const data = await r.json();
    const googleId = data.sub;
    const email = data.email ?? null;
    const name = data.name ?? null;
    const picture = data.picture ?? null;

    if (!googleId) return res.status(400).json({ error: 'Google token missing subject' });

    // Upsert user in DB
    const user = await prisma.user.upsert({
      where: { id: googleId },
      create: {
        id: googleId,
        googleId,
        email: email ?? `user-${googleId}@placeholder.local`,
        name,
        avatar: picture ?? null,
      },
      update: {
        email,
        name,
        avatar: picture ?? undefined,
      },
    });

    // Sign a session token
    const payload = { id: user.id };
    const token = jwt.sign(payload, config.jwtSecret || 'dev-secret', { expiresIn: '7d' });

    // Set httpOnly cookie
    res.cookie('session', token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({ user: { id: user.id, email: user.email, name: user.name, picture: user.avatar } });
  } catch (err) {
    console.error('Auth error', err);
    return res.status(500).json({ error: 'Authentication failed' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie('session');
  res.json({ ok: true });
});

export default router;
