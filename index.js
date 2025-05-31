// index.js
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
            if (error) return reject(`yt-dlpエラー：${url}\n${error.message}`);
            try {
              const json = JSON.parse(stdout);
              const title = json.title || 'no_title';
              const rawDate = json.upload_date || '00000000';
              const formattedDate = `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6)}`;
              const m3u8Url = json.url;
              resolve({ title, date: formattedDate, m3u8: m3u8Url });
            } catch (e) {
              reject(`JSONエラー：${url}\n${e.message}`);
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
            if (error) return reject(`ffmpeg失敗：${url}\n${error.message}`);
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
            if (error) return reject(`yt-dlpエラー：${url}\n${error.message}`);
            try {
              const json = JSON.parse(stdout);
              const title = json.title || 'no_title';
              const rawDate = json.upload_date || '00000000';
              const formattedDate = `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6)}`;
              resolve({ title, date: formattedDate });
            } catch (e) {
              reject(`JSONエラー：${url}\n${e.message}`);
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
            if (error) return reject(`yt-dlp失敗：${url}\n${error.message}`);
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


app.listen(PORT, () => console.log(`✅ 動画DLサーバー稼働中：http://localhost:${PORT}`));
