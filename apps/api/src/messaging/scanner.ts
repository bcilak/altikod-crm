import { connect } from 'node:net';
import { parseEnv } from '../env';

export type ScanResult = { status: 'CLEAN' } | { status: 'INFECTED'; signature: string } | { status: 'UNSCANNED' };
/** Malware scanning port. Implementations throw when the scanner cannot give a verdict; callers keep the file blocked then. */
export abstract class MalwareScanner {
  abstract readonly kind: 'clamd' | 'none';
  abstract scan(bytes: Buffer): Promise<ScanResult>;
}

/** Development only (production refuses to start without clamd): files are marked UNSCANNED, never CLEAN. */
export class NoScanner extends MalwareScanner {
  readonly kind = 'none';
  async scan(): Promise<ScanResult> { return { status: 'UNSCANNED' }; }
}

/** ClamAV daemon over TCP using the INSTREAM protocol (length-prefixed chunks, zero-length terminator). */
export class ClamdScanner extends MalwareScanner {
  readonly kind = 'clamd';
  constructor(public host: string, public port: number, private readonly timeoutMs = 60_000) { super(); }
  scan(bytes: Buffer): Promise<ScanResult> {
    return new Promise((resolvePromise, reject) => {
      const socket = connect({ host: this.host, port: this.port });
      const chunks: Buffer[] = []; let settled = false;
      const finish = (error?: Error) => {
        if (settled) return; settled = true; socket.destroy();
        if (error) return reject(new Error('Malware scanner unavailable'));
        const reply = Buffer.concat(chunks).toString('utf8').replace(/\0+$/, '').trim();
        if (/^stream: OK$/.test(reply)) return resolvePromise({ status: 'CLEAN' });
        const found = /^stream: (.{1,200}) FOUND$/.exec(reply);
        if (found) return resolvePromise({ status: 'INFECTED', signature: found[1]! });
        reject(new Error('Malware scanner returned no verdict'));
      };
      socket.setTimeout(this.timeoutMs, () => finish(new Error('timeout')));
      socket.on('error', error => finish(error));
      socket.on('data', data => { chunks.push(data); if (data.includes(0)) finish(); });
      socket.on('end', () => finish());
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
          const chunk = bytes.subarray(offset, offset + 64 * 1024); const size = Buffer.alloc(4); size.writeUInt32BE(chunk.length);
          socket.write(size); socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
    });
  }
}

export function createScanner(): MalwareScanner {
  // main.ts validates the whole environment at startup (production requires clamd); only clamd needs parsed settings here.
  if ((process.env.MALWARE_SCANNER ?? 'none') === 'none') return new NoScanner();
  const env = parseEnv(process.env);
  return new ClamdScanner(env.CLAMD_HOST!, env.CLAMD_PORT);
}
