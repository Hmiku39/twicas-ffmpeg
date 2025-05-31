const express = require('express');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3001;

app.use(bodyParser.urlencoded({ extended: true }));
app.use('/videos', express.static(path.join(__dirname, 'videos')));
app.use(express.static(path.join(__dirname, 'public'))); // HTMLなどを置く

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/download', (req, res) => {
  const url = req.body.url;
  const datetime = req.body.datetime;
  const title = req.body.title;

  const safeDatetime = datetime.replace(/[^0-9a-zA-Z_\-]/g, '_');
  const safeTitle = title.normalize("NFC").replace(/[\/\\:*?"<>|]/g, '_');
  const filename = `${safeDatetime}_${safeTitle}.mp4`;
  const outputPath = path.join(__dirname, 'videos', filename);

  if (!fs.existsSync(path.join(__dirname, 'videos'))) {
    fs.mkdirSync(path.join(__dirname, 'videos'));
  }

  // ffmpegをspawnで実行（進捗読み取り可能）
  const ffmpeg = spawn('ffmpeg', [
    '-i', url,
    '-c', 'copy',
    '-bsf:a', 'aac_adtstoasc',
    outputPath
  ]);

  ffmpeg.stderr.on('data', data => {
    // ffmpegはstderrに進捗を出力するのでここから拾う
    const msg = data.toString();
    // 時間部分を抽出してクライアントに送信（単純な例）
    const timeMatch = msg.match(/time=(\d+:\d+:\d+\.\d+)/);
    if (timeMatch) {
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(timeMatch[1]); // 例: 00:00:13.04
        }
      });
    }
  });

  ffmpeg.on('close', code => {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send('DONE:' + filename);
      }
    });
  });

  res.send('ダウンロードを開始しました。進捗は下で確認してください。');
});

app.listen(PORT, () => {
  console.log(`✅ Web UI: http://localhost:${PORT}`);
});
