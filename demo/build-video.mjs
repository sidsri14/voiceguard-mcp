import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const rawVideo = resolve(root, 'demo/voiceguard-demo.webm');
const narration = resolve(root, 'demo/voiceguard-narration.wav');
const narratedVideo = resolve(root, 'demo/voiceguard-demo-narrated.mp4');
const finalVideo = resolve(root, 'demo/voiceguard-demo.mp4');
const narrationText = [
  'VoiceGuard M C P is a simulated Alexa Plus safety checkpoint running over a real Streamable H T T P M C P server.',
  'Low value allowlisted requests pass immediately.',
  'High value actions pause for explicit user confirmation.',
  'Documented injection phrases are blocked, and every decision enters an S H A two fifty six hash linked audit trail.',
  'This demo executes the actual local M C P flow. It does not process audio or payments.'
].join(' ');

function runFfmpeg(args) {
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ffmpeg exited with status ${result.status}`);
}

runFfmpeg([
  '-f', 'lavfi',
  '-i', `flite=text='${narrationText}':voice=slt`,
  '-ar', '48000',
  '-ac', '1',
  narration
]);

runFfmpeg([
  '-i', rawVideo,
  '-i', narration,
  '-filter_complex', '[0:v]tpad=stop_mode=clone:stop_duration=8[v];[1:a]afade=t=out:st=26.5:d=0.8[a]',
  '-map', '[v]',
  '-map', '[a]',
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-crf', '21',
  '-pix_fmt', 'yuv420p',
  '-c:a', 'aac',
  '-b:a', '128k',
  '-movflags', '+faststart',
  '-shortest',
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
