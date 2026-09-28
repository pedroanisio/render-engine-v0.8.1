/** Synchronous decoder bridge used only for evicted sequence frames. The
 * verified source bytes arrive on stdin; the path only names the format. */
import { readFileSync } from 'node:fs';
import { decodeImage } from './decode.js';
const path = String(process.argv[2]),
  attributes = JSON.parse(String(process.argv[3]));
const { surface } = await decodeImage(readFileSync(0), attributes, 1, path);
process.stdout.write(Buffer.from(surface.data.buffer));
