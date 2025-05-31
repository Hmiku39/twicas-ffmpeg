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
app.use(express.static(path.join(__dirname, 'views'))); // views/index.html からフォームを提供

// ルート画面（フォーム）
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// ツイキャスURLからm3u8を取得する関数
function getM3U8Url(twicasPageUrl, callback) {
  exec(`yt-dlp -g "${twicasPageUrl}"`, (error, stdout, stderr) => {
    if (error) {
      console.error("yt-dlp エラー:", stderr);
      return callback(error, null);
    }
    const m3u8Url = stdout.trim();
    callback(null, m3u8Url);
  });
}
//ツイキャスURLからタイトルを取得
function getTitle(twicasUrl, callback) {
  exec(`yt-dlp --get-title "${twicasUrl}"`, (error, stdout, stderr) => {
    if (error) {
      console.error("タイトル取得失敗:", stderr);
      return callback(error, null);
    }
    const title = stdout.trim();
    callback(null, title);
  });
}


//ダウンロード
app.post('/download', (req, res) => {
  const twicasUrl = req.body.url;
  const datetime = req.body.datetime;

  if (!twicasUrl || !datetime) {
    return res.status(400).send('URLと日時は必須です。');
  }

  // まずタイトルを取得
  getTitle(twicasUrl, (titleErr, rawTitle) => {
    if (titleErr || !rawTitle) {
      return res.send("❌ タイトルの取得に失敗しました。");
    }

    // 次に m3u8 を取得
    getM3U8Url(twicasUrl, (err, m3u8Url) => {
      if (err || !m3u8Url) {
        return res.send("⚠️ m3u8の取得に失敗しました。URLが間違っているかもしれません。");
      }

      // ファイル名整形
      const safeDatetime = datetime.replace(/[^0-9a-zA-Z_\-]/g, '_');
      const safeTitle = rawTitle.normalize("NFC").replace(/[\/\\:*?"<>|]/g, '_');
      const filename = `${safeDatetime}_${safeTitle}.mp4`;
      const outputPath = path.join(__dirname, 'videos', filename);

      if (!fs.existsSync(path.join(__dirname, 'videos'))) {
        fs.mkdirSync(path.join(__dirname, 'videos'));
      }

      const cmd = `ffmpeg -i "${m3u8Url}" -c copy -bsf:a aac_adtstoasc "${outputPath}"`;

      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          console.error("ffmpeg エラー:", stderr);
          return res.send(`❌ ダウンロード失敗<br><pre>${stderr}</pre>`);
        }

        const downloadLink = `/videos/${filename}`;
        res.send(`✅ ダウンロード完了！<br><a href="${downloadLink}">${filename}</a>`);
      });
    });
  });
});


app.listen(PORT, () => {
  console.log(`✅ サーバー起動完了: http://localhost:${PORT}`);
});

app.post('/download', (req, res) => {
  const twicasUrl = req.body.url;
  const datetime = req.body.datetime;
  const title = req.body.title;

  if (!twicasUrl || !datetime || !title) {
    return res.status(400).send('全ての項目を入力してください。');
  }

  // ファイル名を安全に整形
  const safeDatetime = datetime.replace(/[^0-9a-zA-Z_\-]/g, '_');
  const safeTitle = title.normalize("NFC").replace(/[\/\\:*?"<>|]/g, '_');
  const filename = `${safeDatetime}_${safeTitle}.mp4`;
  const outputPath = path.join(__dirname, 'videos', filename);

  // videosフォルダがなければ作る
  if (!fs.existsSync(path.join(__dirname, 'videos'))) {
    fs.mkdirSync(path.join(__dirname, 'videos'));
  }

  // yt-dlpでm3u8 URLを取得
  getM3U8Url(twicasUrl, (err, m3u8Url) => {
    if (err || !m3u8Url) {
      return res.send("⚠️ m3u8の取得に失敗しました。URLが間違っているかもしれません。");
    }

    const cmd = `ffmpeg -i "${m3u8Url}" -c copy -bsf:a aac_adtstoasc "${outputPath}"`;

    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error("ffmpeg エラー:", stderr);
        return res.send(`❌ ダウンロード失敗<br><pre>${stderr}</pre>`);
      }

      const downloadLink = `/videos/${filename}`;
      res.send(`✅ ダウンロード完了！<br><a href="${downloadLink}">${filename}</a>`);
    });
  });
});

app.listen(PORT, () => {
  console.log(`✅ サーバー起動完了: http://localhost:${PORT}`);
});