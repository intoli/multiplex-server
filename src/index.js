import net from 'net';


class MultiplexServer extends net.Server {
  constructor({ http, https, ...options}) {
    super(options);
    this.http = http;
    this.https = https;

    this.on('connection', this.handleConnection);
  }

  handleConnection = (connection) => {
    connection.once('data', (data) => {
      // SSL v3 and TLS v1 start with 0x16.
      // SSL v2 starts with the record size, likely 0x80 or 0x00.
      const isHttps = [0x16, 0x80, 0x00].includes(data[0]);
      const config = isHttps ? this.https : this.http;

      // Forward the request to another port.
      const port = (config || {}).port || config;
      const host = (config || {}).host || 'localhost';
      if (typeof port === 'number') {
        const upstreamConnection = net.createConnection(port, host, () => {
          upstreamConnection.write(data);
          connection.pipe(upstreamConnection);
          upstreamConnection.pipe(connection);
        });
        return;
      }

      // Connect the socket directly to another server.
      const server = config;
      if (server instanceof net.Server) {
        connection.pause();
        server.emit('connection', connection);
        connection.unshift(data);
        connection.resume();
        return;
      }

      this.emit('error', new Error('No valid configuration to forward the connection.'));
    });
  };
}


export default MultiplexServer;
