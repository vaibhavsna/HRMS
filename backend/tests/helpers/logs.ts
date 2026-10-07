import { Writable } from 'node:stream';

/** A log destination that keeps everything written to it, so a test can read what the app logged. */
export function collectLogs(): { stream: Writable; text: () => string; lines: () => string[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  const text = () => chunks.join('');
  return {
    stream,
    text,
    lines: () =>
      text()
        .split('\n')
        .filter((line) => line !== ''),
  };
}
