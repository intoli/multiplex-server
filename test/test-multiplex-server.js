import assert from 'assert';
import http from 'http';
import https from 'https';

import defaultAxios from 'axios';
import getPort from 'get-port';
import selfsigned from 'selfsigned';

import MultiplexServer from '../src';


describe('MultiplexServer', () => {
  let axios;

  let httpPort;
  let httpsPort;

  let httpServer;
  let httpsServer;

  let multiplexPortForwardingPort;
  let multiplexPortForwardingServer;
  let multiplexDirectConnectionPort;
  let multiplexDirectConnectionServer;

  before(async () => {
    // Create an axios instance that ignores certificate errors.
    axios = defaultAxios.create({
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
    });

    // Start an HTTP server.
    httpPort = await getPort();
    httpServer = http.createServer((request, response) => {
      response.writeHead(200);
      response.end('httpServer');
    });
    await new Promise((resolve, reject) => {
      httpServer.listen(httpPort, error => error ? reject(error) : resolve());
    });

    // Generate self-signed certificates.
    const { cert, private: key } = selfsigned.generate();

    // Start an HTTPS server.
    httpsPort = await getPort();
    httpsServer = https.createServer({
      cert,
      key,
    }, (request, response) => {
      response.writeHead(200);
      response.end('httpsServer');
    });
    await new Promise((resolve, reject) => {
      httpsServer.listen(httpsPort, error => error ? reject(error) : resolve());
    });

    // Start a multiplex server to forward request to ports.
    multiplexPortForwardingPort = await getPort();
    multiplexPortForwardingServer = new MultiplexServer({
      http: httpPort,
      https: httpsPort,
    });
    await new Promise((resolve, reject) => {
      multiplexPortForwardingServer.listen(multiplexPortForwardingPort, error => error ? reject(error) : resolve());
    });

    // Start a multiplex server to directly connect sockets to the servers.
    multiplexDirectConnectionPort = await getPort();
    multiplexDirectConnectionServer = new MultiplexServer({
      http: httpServer,
      https: httpsServer,
    });
    await new Promise((resolve, reject) => {
      multiplexDirectConnectionServer.listen(multiplexDirectConnectionPort, error => error ? reject(error) : resolve());
    });
  });

  after(async () => {
    await Promise.all([
      new Promise((resolve, reject) => {
        httpServer.close(error => error ? reject(error) : resolve());
      }),
      new Promise((resolve, reject) => {
        httpsServer.close(error => error ? reject(error) : resolve());
      }),
      new Promise((resolve, reject) => {
        multiplexPortForwardingServer.close(error => error ? reject(error) : resolve());
      }),
    ]);
  });

  it('forward an HTTP request to the HTTP port', async () => {
    const response = await axios.get(`http://localhost:${multiplexPortForwardingPort}/`);
    assert(response.status === 200);
    assert(response.data === 'httpServer')
  });

  it('forward an HTTPS request to the HTTPS port', async () => {
    const response = await axios.get(`https://localhost:${multiplexPortForwardingPort}/`);
    assert(response.status === 200);
    assert(response.data === 'httpsServer')
  });

  it('connect an HTTP request socket to the HTTP server', async () => {
    const response = await axios.get(`http://localhost:${multiplexDirectConnectionPort}/`);
    assert(response.status === 200);
    assert(response.data === 'httpServer')
  });

  it('connect an HTTP request socket to the HTTPS server', async () => {
    const response = await axios.get(`https://localhost:${multiplexDirectConnectionPort}/`);
    assert(response.status === 200);
    assert(response.data === 'httpsServer')
  });
});
