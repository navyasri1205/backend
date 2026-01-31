import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import scheduleRouter from './routes/schedule.js';
import emailsRouter from './routes/emails.js';

const app = express();
const allowedOrigins = [...new Set(config.allowedOrigins)];
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow all origins in development to avoid CORS issues when running locally
      if (config.nodeEnv !== 'production') {
        cb(null, true);
        return;
      }
      if (!origin || allowedOrigins.includes(origin)) cb(null, true);
      else {
        // log rejected origin to aid debugging
        console.warn('CORS rejected origin:', origin);
        cb(null, false);
      }
    },
    credentials: true,
  })
);
app.use(express.json());

app.use('/api/schedule', scheduleRouter);
app.use('/api/emails', emailsRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});
