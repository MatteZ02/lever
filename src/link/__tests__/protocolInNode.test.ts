// The driver link package must run in plain Node (type stripping), as
// scripts/link-probe.mjs uses it without a build step.
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

describe('driver-link-protocol in plain Node', () => {
  it('imports, encodes and decodes without a build step', () => {
    const entry = pathToFileURL(
      resolve('packages/driver-link-protocol/src/index.ts'),
    ).href;
    const script = `
      const L = await import(${JSON.stringify(entry)});
      const [d] = L.encodeDatagrams({id: 'thr-a-aaaaaaaa', seq: 1}, {type: 'bye', body: {}});
      console.log(L.decodeDatagram(d).kind);
    `;
    const output = execFileSync(
      process.execPath,
      ['--input-type=module', '--no-warnings', '-e', script],
      {encoding: 'utf8', env: {...process.env, ELECTRON_RUN_AS_NODE: '1'}},
    );
    expect(output.trim()).toBe('message');
  });
});
