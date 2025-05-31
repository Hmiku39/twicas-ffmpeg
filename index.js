const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

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
app.post('/download', (req, res) => {
  const twicasUrl = req.body.url;

  if (!twicasUrl) {
    return res.status(400).send('URLは必須です。');
  }

  getVideoMetadata(twicasUrl, (err, meta) => {
    if (err || !meta) {
      return res.send('❌ メタデータ取得に失敗しました。');
    }

    const safeTitle = meta.title.normalize('NFC').replace(/[\/\\:*?"<>|]/g, '_');
    const safeDate = meta.date.replace(/[^0-9a-zA-Z_\-]/g, '_');
    const filename = `${safeDate}_${safeTitle}.mp4`;
    const outputPath = path.join(__dirname, 'videos', filename);

    if (!fs.existsSync(path.join(__dirname, 'videos'))) {
      fs.mkdirSync(path.join(__dirname, 'videos'));
    }

    const cmd = `ffmpeg -i "${meta.m3u8}" -c copy -bsf:a aac_adtstoasc "${outputPath}"`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error('ffmpeg error:', stderr);
        return res.send(`❌ ダウンロード失敗<br><pre>${stderr}</pre>`);
      }
      res.send(`✅ ダウンロード完了！<br><a href="/videos/${filename}">${filename}</a>`);
    });
  });
});

app.listen(PORT, () => {
  console.log(`✅ サーバー起動中: http://localhost:${PORT}`);
});
