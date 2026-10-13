import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { verifyFileToken } from './file-token';
import {
  UnsafeStoragePathError,
  contentTypeFor,
  localDelete,
  localSignedUrl,
  localUpload,
  openLocalFile,
  resolveInside,
} from './storage-local';
import { safeFilename } from '../files/files.controller';

describe('resolveInside (path-traversal guard)', () => {
  const root = path.resolve('/srv/ojt/storage');

  it('resolves an ordinary object path inside the root', () => {
    expect(resolveInside(root, 'documents/s1/abc.pdf')).toBe(
      path.join(root, 'documents', 's1', 'abc.pdf'),
    );
  });

  it.each([
    '../secret.txt',
    'documents/../../secret.txt',
    'documents/s1/../../../etc/passwd',
    '..',
    '.',
    './documents/a.pdf',
    '/etc/passwd',
    'C:\\Windows\\win.ini',
    'C:/Windows/win.ini',
    '\\\\server\\share\\file',
    'documents\\..\\..\\secret.txt',
    'documents/s1/a\0.pdf',
    '',
  ])('refuses %p', (objectPath) => {
    expect(() => resolveInside(root, objectPath)).toThrow(
      UnsafeStoragePathError,
    );
  });

  it('does not treat a sibling folder that shares the prefix as inside', () => {
    // "/srv/ojt/storage-old/x" starts with "/srv/ojt/storage" as a string.
    expect(() => resolveInside(root, '../storage-old/x.pdf')).toThrow(
      UnsafeStoragePathError,
    );
  });
});

describe('contentTypeFor', () => {
  it('maps the three stored types and falls back to an opaque download', () => {
    expect(contentTypeFor('a/b/c.pdf')).toBe('application/pdf');
    expect(contentTypeFor('a/b/c.JPG')).toBe('image/jpeg');
    expect(contentTypeFor('a/b/c.png')).toBe('image/png');
    expect(contentTypeFor('a/b/c.html')).toBe('application/octet-stream');
    expect(contentTypeFor('a/b/c')).toBe('application/octet-stream');
  });
});

describe('safeFilename', () => {
  it('keeps the school naming convention and strips header-breaking characters', () => {
    expect(safeFilename('2022-00145_MOA_MUNDO.pdf')).toBe(
      '2022-00145_MOA_MUNDO.pdf',
    );
    expect(safeFilename('a"b\r\nc/d\\e.pdf')).toBe('a_b__c_d_e.pdf');
    expect(safeFilename('..')).toBe('file');
  });
});

describe('local driver on disk', () => {
  let dir: string;
  const saved = { ...process.env };

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'ojt-storage-'));
    process.env.STORAGE_DIR = dir;
    process.env.FILE_URL_SECRET = 'spec-secret';
    delete process.env.FILE_URL_BASE;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    process.env = { ...saved };
  });

  it('writes under STORAGE_DIR at the object path, and never overwrites', async () => {
    await localUpload('journals/s1/photo.jpg', Buffer.from('one'));
    expect(
      readFileSync(path.join(dir, 'journals', 's1', 'photo.jpg'), 'utf8'),
    ).toBe('one');
    await expect(
      localUpload('journals/s1/photo.jpg', Buffer.from('two')),
    ).rejects.toThrow();
  });

  it('signs a relative /api/files link that verifies back to the same path', async () => {
    await localUpload('documents/s1/a.pdf', Buffer.from('%PDF'));
    const url = await localSignedUrl('documents/s1/a.pdf', 3600, 'Name.pdf');
    expect(url.startsWith('/api/files/')).toBe(true);
    const result = verifyFileToken(url.split('/').pop()!, 'spec-secret');
    expect(result).toMatchObject({
      ok: true,
      payload: { path: 'documents/s1/a.pdf', downloadName: 'Name.pdf' },
    });
  });

  it('refuses to sign a link to a file that is not there', async () => {
    await expect(localSignedUrl('documents/s1/gone.pdf', 3600)).rejects.toThrow(
      'not found',
    );
  });

  it('deletes a file, and deleting a missing one is not an error', async () => {
    await localUpload('documents/s1/a.pdf', Buffer.from('x'));
    await localDelete('documents/s1/a.pdf');
    expect(await openLocalFile('documents/s1/a.pdf')).toBeNull();
    await expect(localDelete('documents/s1/a.pdf')).resolves.toBeUndefined();
  });

  it('never reads, writes or deletes outside STORAGE_DIR', async () => {
    await expect(
      localUpload('../escape.txt', Buffer.from('x')),
    ).rejects.toThrow(UnsafeStoragePathError);
    await expect(localDelete('../../etc/hosts')).rejects.toThrow(
      UnsafeStoragePathError,
    );
    expect(await openLocalFile('../../etc/hosts')).toBeNull();
  });
});
