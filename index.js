const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

// ミドルウェア
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/videos', express.static(path.join(__dirname, 'videos')));

// HTMLフォームを出す
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// メタデータ取得（yt-dlp -j）
function getVideoMetadata(twicasUrl, callback) {
  exec(`yt-dlp -j "${twicasUrl}"`, (error, stdout, stderr) => {
    if (error) {
      console.error('yt-dlp error:', stderr);
      return callback(error, null);
    }
    try {
      const json = JSON.parse(stdout);
      const title = json.title || 'no_title';
      const rawDate = json.upload_date || '00000000';
      const formattedDate = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6)}`;
      const m3u8Url = json.url;
      callback(null, { title, date: formattedDate, m3u8: m3u8Url });
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr);
      callback(parseErr, null);
    }
  });
}

// ダウンロード処理
app.post('/download-multi', (req, res) => {
  const rawText = req.body.urls;
  if (!rawText) return res.status(400).send('URLが空です');

  const urls = rawText.split('\n').map(u => u.trim()).filter(Boolean);
  if (urls.length === 0) return res.status(400).send('URLが見つかりません');

  let results = [];

  // 直列で1件ずつ処理
  (async function processUrls() {
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

        const safeTitle = meta.title.normalize("NFC").replace(/[\/\\:*?"<>|]/g, '_');
        const safeDate = meta.date.replace(/[^0-9a-zA-Z_\-]/g, '_');
        const filename = `${safeDate}_${safeTitle}.mp4`;
        const outputPath = path.join(__dirname, 'videos', filename);

        if (!fs.existsSync(path.join(__dirname, 'videos'))) {
          fs.mkdirSync(path.join(__dirname, 'videos'));
        }

        await new Promise((resolve, reject) => {
          const cmd = `ffmpeg -i "${meta.m3u8}" -c copy -bsf:a aac_adtstoasc "${outputPath}"`;
          exec(cmd, (error) => {
            if (error) return reject(`ffmpeg失敗：${url}`);
            resolve();
          });
        });

        results.push(`<li>✅ <a href="/videos/${filename}">${filename}</a></li>`);
      } catch (errMsg) {
        results.push(`<li>❌ ${errMsg}</li>`);
      }
    }

    // 処理完了後、一覧を表示
    res.send(`
      <h2>ダウンロード結果</h2>
      <ul>${results.join('')}</ul>
      <a href="/">← 戻る</a>
    `);
  })();
});


app.listen(PORT, () => {
  console.log(`✅ サーバー起動中: http://localhost:${PORT}`);
});
