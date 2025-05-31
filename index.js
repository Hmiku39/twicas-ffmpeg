// index.js
const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

app.use(bodyParser.urlencoded({ extended: true }));
app.use('/videos', express.static('/mnt/video_storage/twicasting'));
app.use('/videos_youtube', express.static('/mnt/video_storage/youtube'));

// トップページ
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// YouTubeページ
app.get('/youtube', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'youtube.html'));
});

// TwitCasting動画一括ダウンロード
app.post('/download-multi', (req, res) => {
  const urls = req.body.urls?.split('\n').map(u => u.trim()).filter(Boolean) || [];
  if (!urls.length) return res.status(400).send('URLが見つかりません');

  const results = [];
  (async () => {
    for (const url of urls) {
      try {
        const meta = await new Promise((resolve, reject) => {
          exec(`yt-dlp -j "${url}"`, (error, stdout) => {
            if (error) return reject(`yt-dlpエラー：${url}`);
            try {
              const json = JSON.parse(stdout);
              const title = json.title || 'no_title';
              const rawDate = json.upload_date || '00000000';
              const formattedDate = `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6)}`;
              const m3u8Url = json.url;
              resolve({ title, date: formattedDate, m3u8: m3u8Url });
            } catch (e) {
              reject(`JSONエラー：${url}`);
            }
          });
        });

        const safeTitle = meta.title.replace(/[\\/:*?"<>|]/g, '_');
        const filename = `${meta.date}_${safeTitle}.mp4`;
        const outputDir = '/mnt/video_storage/twicasting';
        const outputPath = path.join(outputDir, filename);

        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        await new Promise((resolve, reject) => {
          const cmd = `ffmpeg -i "${meta.m3u8}" -c copy -bsf:a aac_adtstoasc "${outputPath}"`;
          exec(cmd, (error) => {
            if (error) return reject(`ffmpeg失敗：${url}`);
            resolve();
          });
        });

        results.push(`<li>✅ <a href="/videos/${filename}">${filename}</a></li>`);
      } catch (e) {
        results.push(`<li>❌ ${e}</li>`);
      }
    }

    res.send(`<ul>${results.join('')}</ul><a href="/">戻る</a>`);
  })();
});

// YouTube動画一括ダウンロード
app.post('/youtube-download-multi', (req, res) => {
  const urls = req.body.urls?.split('\n').map(u => u.trim()).filter(Boolean) || [];
  if (!urls.length) return res.status(400).send('URLが見つかりません');

  const results = [];
  (async () => {
    for (const url of urls) {
      try {
        const meta = await new Promise((resolve, reject) => {
          exec(`yt-dlp -j "${url}"`, (error, stdout) => {
            if (error) return reject(`yt-dlpエラー：${url}`);
            try {
              const json = JSON.parse(stdout);
              const title = json.title || 'no_title';
              const rawDate = json.upload_date || '00000000';
              const formattedDate = `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6)}`;
              resolve({ title, date: formattedDate });
            } catch (e) {
              reject(`JSONエラー：${url}`);
            }
          });
        });

        const safeTitle = meta.title.replace(/[\\/:*?"<>|]/g, '_');
        const filename = `${meta.date}_${safeTitle}.%(ext)s`;
        const outputDir = '/mnt/video_storage/youtube';
        const outputPath = path.join(outputDir, filename);

        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const cmd = `yt-dlp -f bestvideo+bestaudio --merge-output-format mp4 -o "${outputPath}" "${url}"`;
        await new Promise((resolve, reject) => {
          exec(cmd, (error) => {
            if (error) return reject(`yt-dlp失敗：${url}`);
            resolve();
          });
        });

        results.push(`<li>✅ <a href="/videos_youtube/${meta.date}_${safeTitle}.mp4">${meta.date}_${safeTitle}.mp4</a></li>`);
      } catch (e) {
        results.push(`<li>❌ ${e}</li>`);
      }
    }

    res.send(`<ul>${results.join('')}</ul><a href="/youtube">戻る</a>`);
  })();
});

app.listen(PORT, () => console.log(`✅ 動画DLサーバー稼働中：http://localhost:${PORT}`));
