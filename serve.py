import http.server, os
os.chdir('/Users/brentoncharnley/Documents/Claude/PFM App')
print('Kelda Finance running at:')
print('  Local:   http://localhost:8080')
print('  Network: http://192.168.1.97:8080')
print('Press Ctrl+C to stop.')
http.server.test(HandlerClass=http.server.SimpleHTTPRequestHandler, port=8080, bind='0.0.0.0')
