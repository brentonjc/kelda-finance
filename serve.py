import http.server, os, socketserver

os.chdir('/Users/brentoncharnley/Documents/Claude/PFM App')
PORT = 8080
Handler = http.server.SimpleHTTPRequestHandler
Handler.extensions_map.update({
    '.js':   'application/javascript',
    '.css':  'text/css',
    '.json': 'application/json',
    '.html': 'text/html',
    '.webmanifest': 'application/manifest+json',
})
print('Kelda Finance running at:')
print('  Local:   http://localhost:' + str(PORT))
print('Press Ctrl+C to stop.')
with socketserver.TCPServer(('', PORT), Handler) as httpd:
    httpd.serve_forever()
