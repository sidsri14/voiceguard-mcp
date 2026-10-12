import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EdgeTTS } from 'edge-tts-universal';

const root = resolve(import.meta.dirname, '..');
const rawVideo = resolve(root, 'demo/voiceguard-demo.webm');
const narration = resolve(root, 'demo/voiceguard-narration.mp3');
const narratedVideo = resolve(root, 'demo/voiceguard-demo-narrated.mp4');
const finalVideo = resolve(root, 'demo/voiceguard-demo.mp4');
const subtitles = resolve(root, 'demo/voiceguard-demo.srt');
const narrationSentences = [
  'VoiceGuard for MCP is a simulated Alexa Plus safety checkpoint.',
  'It runs over a real streamable HTTP server using the Model Context Protocol.',
  'Low value allowlisted requests pass immediately.',
  'High value actions pause for explicit user confirmation.',
  'Documented injection phrases are blocked, and every decision enters a SHA-256 hash-linked audit trail.',
  'This demo executes the actual local MCP flow. It does not process audio or payments.'
];
const narrationText = narrationSentences.join(' ');

function runFfmpeg(args) {
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ffmpeg exited with status ${result.status}`);
}

function duration(path) {
  const result = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path],
    { cwd: root, encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(`ffprobe failed for ${path}`);
  return Number(result.stdout.trim());
}

function srtTime(seconds) {
  const millis = Math.max(0, Math.round(seconds * 1000));
  const ms = millis % 1000;
  const totalSeconds = Math.floor(millis / 1000);
  const sec = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const min = totalMinutes % 60;
  const hour = Math.floor(totalMinutes / 60);
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

const tts = new EdgeTTS(narrationText, 'en-IN-NeerjaExpressiveNeural', {
  rate: '+8%',
  volume: '+0%',
  pitch: '-2Hz',
});
const result = await tts.synthesize();
writeFileSync(narration, Buffer.from(await result.audio.arrayBuffer()));

const spoken = duration(narration);
const sourceDuration = duration(rawVideo);
const tailDuration = 0.8;
const outputDuration = spoken + tailDuration;
const videoPad = Math.max(0, outputDuration - sourceDuration);
const fadeStart = Math.max(0, spoken - 0.6);

const sentenceWordCounts = narrationSentences.map((sentence) => sentence.split(/\s+/).length);
const totalWords = sentenceWordCounts.reduce((sum, count) => sum + count, 0);
let captionStart = 0.1;
const captionRows = narrationSentences.map((sentence, index) => {
  const captionEnd = index === narrationSentences.length - 1
    ? spoken
    : captionStart + spoken * (sentenceWordCounts[index] / totalWords);
  const row = `${index + 1}\n${srtTime(captionStart)} --> ${srtTime(captionEnd)}\n${sentence}`;
  captionStart = captionEnd;
  return row;
});
writeFileSync(subtitles, `${captionRows.join('\n\n')}\n`);

runFfmpeg([
  '-i', rawVideo,
  '-i', narration,
  '-filter_complex', `[0:v]tpad=stop_mode=clone:stop_duration=${videoPad.toFixed(3)}[v];[1:a]afade=t=in:st=0:d=0.2,afade=t=out:st=${fadeStart.toFixed(3)}:d=0.55,apad=pad_dur=${tailDuration}[a]`,
  '-map', '[v]',
  '-map', '[a]',
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-crf', '21',
  '-pix_fmt', 'yuv420p',
  '-c:a', 'aac',
  '-b:a', '128k',
  '-movflags', '+faststart',
  '-t', outputDuration.toFixed(3),
  narratedVideo
]);

runFfmpeg([
  '-i', narratedVideo,
  '-vf', "subtitles=demo/voiceguard-demo.srt:force_style='FontName=Arial,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00101816,BorderStyle=3,BackColour=&H9007100F,Outline=1,Shadow=0,MarginV=32'",
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-crf', '20',
  '-pix_fmt', 'yuv420p',
  '-c:a', 'copy',
  '-movflags', '+faststart',
  finalVideo
]);

console.log(`Saved narrated and captioned demo to ${finalVideo}`);
