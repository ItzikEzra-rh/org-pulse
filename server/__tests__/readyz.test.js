import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

const { createReadyzHandler } = require('../readyz')

function createMockRes() {
  var statusCode = 200
  var body = null
  return {
    status(code) { statusCode = code; return this },
    json(data) { body = data },
    get statusCode() { return statusCode },
    get body() { return body }
  }
}

describe('readyz', () => {
  var tmpDir

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readyz-test-'))
  })

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns 200 when data directory is readable and writable', () => {
    var handler = createReadyzHandler({ DATA_DIR: tmpDir })
    var res = createMockRes()
    handler({}, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.sha).toBeDefined()
    expect(res.body.upSince).toBeDefined()
  })

  it('returns 503 when data directory does not exist', () => {
    var handler = createReadyzHandler({ DATA_DIR: path.join(tmpDir, 'nonexistent') })
    var res = createMockRes()
    handler({}, res)

    expect(res.statusCode).toBe(503)
    expect(res.body.status).toBe('error')
    expect(res.body.reasons).toContain('data directory not readable/writable')
  })

  it('uses FIXTURES_DIR when DATA_DIR is not set', () => {
    var handler = createReadyzHandler({ FIXTURES_DIR: tmpDir })
    var res = createMockRes()
    handler({}, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.sha).toBeDefined()
    expect(res.body.upSince).toBeDefined()
  })

  it('returns 503 when FIXTURES_DIR does not exist', () => {
    var handler = createReadyzHandler({ FIXTURES_DIR: path.join(tmpDir, 'nonexistent') })
    var res = createMockRes()
    handler({}, res)

    expect(res.statusCode).toBe(503)
    expect(res.body.status).toBe('error')
  })

  it('returns 503 when data directory is read-only', (ctx) => {
    // Root bypasses file permissions (chmod does not block root writes), so
    // the read-only precondition cannot be exercised in a root container.
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      ctx.skip()
    }
    var roDir = path.join(tmpDir, 'readonly')
    fs.mkdirSync(roDir)
    fs.chmodSync(roDir, 0o444)

    var handler = createReadyzHandler({ DATA_DIR: roDir })
    var res = createMockRes()
    handler({}, res)

    expect(res.statusCode).toBe(503)
    expect(res.body.reasons).toContain('data directory not readable/writable')

    fs.chmodSync(roDir, 0o755)
  })
})
