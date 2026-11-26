// One-time helper: run locally to get the YT_REFRESH_TOKEN secret.
//   YT_CLIENT_ID=... YT_CLIENT_SECRET=... node tools/get_youtube_token.mjs
// In Google Cloud, create an OAuth client of type "Desktop app" and add http://localhost:53682 as a redirect.
import http from 'node:http';
import { google } from 'googleapis';

const { YT_CLIENT_ID, YT_CLIENT_SECRET } = process.env;
if (!YT_CLIENT_ID || !YT_CLIENT_SECRET) throw new Error('Set YT_CLIENT_ID and YT_CLIENT_SECRET first');

const redirect = 'http://localhost:53682';
const auth = new google.auth.OAuth2(YT_CLIENT_ID, YT_CLIENT_SECRET, redirect);
const url = auth.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/youtube.upload'],
});
console.log('Open this URL in your browser and approve access:\n\n' + url + '\n');

const server = http
  .createServer(async (req, res) => {
    const code = new URL(req.url, redirect).searchParams.get('code');
    if (!code) return res.end('Waiting for code...');
    const { tokens } = await auth.getToken(code);
    res.end('Done. You can close this tab and return to the terminal.');
    console.log('YT_REFRESH_TOKEN =', tokens.refresh_token);
    server.close();
  })
  .listen(53682);
