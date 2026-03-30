#!/usr/bin/env python3

import argparse
import http.client
import json
import os
import socket
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse


class OllamaProxyHandler(BaseHTTPRequestHandler):
  protocol_version = 'HTTP/1.1'

  def do_GET(self):
    self._proxy()

  def do_POST(self):
    self._proxy()

  def do_PUT(self):
    self._proxy()

  def do_DELETE(self):
    self._proxy()

  def do_HEAD(self):
    self._proxy()

  def log_message(self, fmt, *args):
    sys.stderr.write('[ollama-proxy] ' + (fmt % args) + '\n')

  def _proxy(self):
    parsed = self.server.upstream
    connection_cls = http.client.HTTPSConnection if parsed.scheme == 'https' else http.client.HTTPConnection
    body = None

    length = self.headers.get('Content-Length')
    if length:
      body = self.rfile.read(int(length))

    upstream_headers = {}
    for key, value in self.headers.items():
      lower_key = key.lower()
      if lower_key in ('host', 'connection', 'content-length'):
        continue
      upstream_headers[key] = value

    upstream_headers['Host'] = parsed.netloc
    upstream_headers['Connection'] = 'close'
    if body is not None:
      upstream_headers['Content-Length'] = str(len(body))

    target_path = self.path
    conn = connection_cls(parsed.hostname, parsed.port, timeout=600)

    try:
      conn.request(self.command, target_path, body=body, headers=upstream_headers)
      response = conn.getresponse()

      self.send_response(response.status, response.reason)

      for key, value in response.getheaders():
        lower_key = key.lower()
        if lower_key in ('transfer-encoding', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'upgrade'):
          continue
        self.send_header(key, value)

      self.send_header('Connection', 'close')
      self.end_headers()

      while True:
        chunk = response.read(64 * 1024)
        if not chunk:
          break
        self.wfile.write(chunk)
      self.wfile.flush()
    except Exception as exc:
      self.send_response(502, 'Bad Gateway')
      self.send_header('Content-Type', 'application/json')
      payload = json.dumps({'error': 'proxy_failed', 'message': str(exc)}).encode('utf-8')
      self.send_header('Content-Length', str(len(payload)))
      self.send_header('Connection', 'close')
      self.end_headers()
      self.wfile.write(payload)
      self.wfile.flush()
    finally:
      conn.close()


def parse_args():
  parser = argparse.ArgumentParser(description='Expose a remote Ollama server on a local port.')
  parser.add_argument('--listen-host', default=os.environ.get('LOCAL_OLLAMA_PROXY_HOST', '127.0.0.1'))
  parser.add_argument('--listen-port', type=int, default=int(os.environ.get('LOCAL_OLLAMA_PROXY_PORT', '11434')))
  parser.add_argument('--upstream', default=os.environ.get('DEEPSEEK_BASE_URL', 'http://192.168.20.24:11434'))
  return parser.parse_args()


def main():
  args = parse_args()
  upstream = urlparse(args.upstream)
  if not upstream.scheme or not upstream.hostname or not upstream.port:
    raise SystemExit(f'Invalid upstream URL: {args.upstream}')

  server = ThreadingHTTPServer((args.listen_host, args.listen_port), OllamaProxyHandler)
  server.upstream = upstream

  sys.stderr.write(
    f'[ollama-proxy] listening on http://{args.listen_host}:{args.listen_port} -> {args.upstream}\n'
  )

  try:
    server.serve_forever()
  except KeyboardInterrupt:
    pass
  finally:
    server.server_close()


if __name__ == '__main__':
  main()
