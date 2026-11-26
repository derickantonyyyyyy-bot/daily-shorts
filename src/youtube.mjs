// Uploads out/video.mp4 to YouTube using an OAuth refresh token. Skips quietly if secrets are missing.
import fs from 'node:fs';
import { google } from 'googleapis';

const { YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN } = process.env;
if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) {
  console.log('YouTube secrets not set, skipping YouTube upload.');
  process.exit(0);
}

const s = JSON.parse(fs.readFileSync('work/script.json', 'utf8'));
const auth = new google.auth.OAuth2(YT_CLIENT_ID, YT_CLIENT_SECRET);
auth.setCredentials({ refresh_token: YT_REFRESH_TOKEN });
const youtube = google.youtube({ version: 'v3', auth });

const r = await youtube.videos.insert({
  part: ['snippet', 'status'],
  requestBody: {
    snippet: {
      title: `${s.title} #Shorts`.slice(0, 100),
      description: `${s.description}\n\n#Shorts`,
      tags: s.tags,
      categoryId: '27', // Education
    },
    status: {
      // Unverified API projects are forced to private by YouTube. Set repo variable YT_PRIVACY=public once verified.
      privacyStatus: process.env.YT_PRIVACY || 'private',
      selfDeclaredMadeForKids: false,
    },
  },
  media: { body: fs.createReadStream('out/video.mp4') },
});
console.log('Uploaded to YouTube:', r.data.id);
