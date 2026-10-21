import { EventEmitter } from 'node:events';

// HTTP lifecycle doubles: no listener, socket, application or database is started.
export function incoming(ip = '203.0.113.5', headers = {}, url = '/', method = 'GET') {
  return Object.assign(new EventEmitter(), { socket: { remoteAddress: ip }, headers: { host: 'internal:3000', ...headers }, url, method });
}

export class HttpResponse extends EventEmitter {
  statusCode = 200;
  headersSent = false;
  headers = new Map();
  body;
  destroyed = false;
  writableEnded = false;
  setHeader(name, value) { this.headers.set(name.toLowerCase(), value); }
  getHeader(name) { return this.headers.get(name.toLowerCase()); }
  writeHead(code, headers = {}) {
    this.statusCode = code;
    for (const [name, value] of Object.entries(headers)) this.setHeader(name, value);
    this.headersSent = true;
  }
  write(body, encoding, callback) {
    this.headersSent = true;
    if (typeof encoding === 'function') encoding();
    else callback?.();
    return true;
  }
  end(body, encoding, callback) {
    this.body = body;
    this.writableEnded = true;
    this.headersSent = true;
    if (typeof body === 'function') body();
    else if (typeof encoding === 'function') encoding();
    else callback?.();
    this.emit('finish'); this.emit('close');
    return this;
  }
  destroy() { this.destroyed = true; this.emit('close'); }
}
