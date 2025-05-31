const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

function generateFileListHTML(folderUrl, fileList, title) {
  const listItems = fileList.map(file => {
    const url = `${folderUrl}/${encodeURIComponent(file)}`;
    return `
      <li class="mb-3">
        <strong>${file}</strong><br>
        <video src="${url}" controls width="320" class="mt-1"></video><br>
        <a href="${url}" class="btn btn-sm btn-outline-primary mt-1" download>ダウンロード</a>
      </li>
    `;
  });

  return `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <title>${title} 一覧</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
      <style>body { padding: 2rem; }</style>
    </head>
    <body>
      <div class="container">
        <h1 class="mb-4">${title} 保存動画一覧</h1>
        <ul class="list-unstyled">
          ${listItems.join('\n')}
        </ul>
        <a href="/" class="btn btn-secondary mt-4">← トップに戻る</a>
      </div>
    </body>
    </html>
  `;
}


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
        const outputPath = path.join('/mnt/video_storage/twicasting', filename);

        const twicasDir = '/mnt/video_storage/twicasting';
        if (!fs.existsSync(twicasDir)) {
            fs.mkdirSync(twicasDir, { recursive: true });
        }


        await new Promise((resolve, reject) => {
          const cmd = `ffmpeg -i "${meta.m3u8}" -c copy -bsf:a aac_adtstoasc "${outputPath}"`;
          exec(cmd, (error) => {
            if (error) return reject(`ffmpeg失敗：${url}`);
            console.log("エラー:", error);
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

// YouTube UIページ
app.get('/youtube', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'youtube.html'));
});

// YouTube動画を保存するディレクトリを公開
app.use('/videos_youtube', express.static(path.join(__dirname, 'videos_youtube')));

// YouTube複数ダウンロード処理
app.post('/youtube-download-multi', (req, res) => {
  const rawText = req.body.urls;
  if (!rawText) return res.status(400).send('URLが空です');

  const urls = rawText.split('\n').map(u => u.trim()).filter(Boolean);
  if (urls.length === 0) return res.status(400).send('URLが見つかりません');

  let results = [];

  // 非同期IIFEで1件ずつ順次処理
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
              resolve({ title, date: formattedDate });
            } catch (e) {
              reject(`JSONエラー：${url}`);
            }
          });
        });

        const safeTitle = meta.title.normalize("NFC").replace(/[\/\\:*?"<>|]/g, '_');
        const safeDate = meta.date.replace(/[^0-9a-zA-Z_\-]/g, '_');
        const filename = `${safeDate}_${safeTitle}.%(ext)s`;

        const outputDir = path.join('/mnt/video_storage/youtube');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }


        const cmd = `yt-dlp -f bestvideo+bestaudio --merge-output-format mp4 -o "${path.join(outputDir, filename)}" "${url}"`;

        await new Promise((resolve, reject) => {
          exec(cmd, (error) => {
            if (error) return reject(`yt-dlp失敗：${url}`);
            resolve();
          });
          console.log("エラー:", error);
        });

        results.push(`<li>✅ <a href="/videos_youtube/${safeDate}_${safeTitle}.mp4">${safeDate}_${safeTitle}.mp4</a></li>`);
      } catch (errMsg) {
        results.push(`<li>❌ ${errMsg}</li>`);
      }
    }

    res.send(`
      <h2>YouTubeダウンロード結果</h2>
      <ul>${results.join('')}</ul>
      <a href="/youtube" class="btn btn-secondary mt-3">← 戻る</a>
    `);
  })();
});

// ツイキャス動画一覧
app.get('/videos/twicasting-list', (req, res) => {
  const dir = path.join(__dirname, 'videos');
  fs.readdir(dir, (err, files) => {
    if (err) return res.send('ディレクトリ読み込みエラー');

    const videoFiles = files.filter(f =>
      f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv')
    );

    res.send(generateFileListHTML('/videos', videoFiles, 'TwitCasting'));
  });
});


// YouTube動画一覧
app.get('/videos_youtube/list', (req, res) => {
  const dir = path.join(__dirname, 'videos_youtube');
  fs.readdir(dir, (err, files) => {
    if (err) return res.send('ディレクトリ読み込みエラー');

    const videoFiles = files.filter(f =>
      f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv')
    );

    res.send(generateFileListHTML('/videos_youtube', videoFiles, 'YouTube'));
  });
});


app.listen(PORT, () => {
  console.log(`✅ サーバー起動中: http://localhost:${PORT}`);
});
