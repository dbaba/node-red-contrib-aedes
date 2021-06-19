/**
 * Copyright 2013,2014 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function (RED) {
  'use strict';
  const mongoPersistence = require('aedes-persistence-mongodb');
  const aedes = require('aedes');
  const net = require('net');
  const tls = require('tls');
  const http = require('http');
  const https = require('https');
  const ws = require('websocket-stream');

  let serverUpgradeAdded = false;
  const listenerNodes = {};

  function handleServerUpgrade (request, socket, head) {
    const pathname = new URL(request.url, 'http://example.org').pathname;
    if (Object.prototype.hasOwnProperty.call(listenerNodes, pathname)) {
      listenerNodes[pathname].server.handleUpgrade(request, socket, head, function done (conn) {
        listenerNodes[pathname].server.emit('connection', conn, request);
      });
    }
  }

  function AedesBrokerNode (config) {
    RED.nodes.createNode(this, config);
    this.mqtt_port = parseInt(config.mqtt_port, 10);
    this.mqtt_ws_port = parseInt(config.mqtt_ws_port, 10);
    this.mqtt_ws_path = '' + config.mqtt_ws_path;
    this.mqtt_ws_bind = config.mqtt_ws_bind;
    this.usetls = config.usetls;

    if (this.mqtt_ws_bind === 'path') {
      this.mqtt_ws_port = 0;
    } else {
      this.mqtt_ws_path = '';
    }

    if (this.credentials) {
      this.username = this.credentials.username;
      this.password = this.credentials.password;
      this.cert = this.credentials.certdata || '';
      this.key = this.credentials.keydata || '';
    }

    if (typeof this.usetls === 'undefined') {
      this.usetls = false;
    }

    const node = this;

    const aedesSettings = {};
    const serverOptions = {};

    if (config.dburl) {
      aedesSettings.persistence = mongoPersistence({
        url: config.dburl
      });
      node.log('Start persistence to MongeDB');
    }

    if ((this.cert) && (this.key) && (this.usetls)) {
      serverOptions.cert = this.cert;
      serverOptions.key = this.key;
    }

    const broker = new aedes.Server(aedesSettings);
    let server;
    let wss = null;
    let httpServer = null;

    function startServer () {
      if (broker.closed) {
        return;
      }
      if (node.usetls) {
        server = tls.createServer(serverOptions, broker.handle);
      } else {
        server = net.createServer(broker.handle);
      }

      if (node.mqtt_ws_port) {
        // Awkward check since http or ws do not fire an error event in case the port is in use
        const testServer = net.createServer();
        testServer.once('error', function (err) {
          if (err.code === 'EADDRINUSE') {
            node.error('Error: Port ' + config.mqtt_ws_port + ' is already in use');
          } else {
            node.error('Error creating net server on port ' + config.mqtt_ws_port + ', ' + err.toString());
          }
        });
        testServer.once('listening', function () {
          testServer.close();
        });

        testServer.once('close', function () {
          if (node.usetls) {
            httpServer = https.createServer(serverOptions);
          } else {
            httpServer = http.createServer();
          }
          wss = ws.createServer({
            server: httpServer
          }, broker.handle);
          httpServer.listen(config.mqtt_ws_port, function () {
            node.log('Binding aedes mqtt server on ws port: ' + config.mqtt_ws_port);
          });
        });
        testServer.listen(config.mqtt_ws_port, function () {
          node.log('Checking ws port: ' + config.mqtt_ws_port);
        });
      }

      if (node.mqtt_ws_path !== '') {
        if (!serverUpgradeAdded) {
          RED.server.on('upgrade', handleServerUpgrade);
          serverUpgradeAdded = true;
        }

        let path = RED.settings.httpNodeRoot || '/';
        path = path + (path.slice(-1) === '/' ? '' : '/') + (node.mqtt_ws_path.charAt(0) === '/' ? node.mqtt_ws_path.substring(1) : node.mqtt_ws_path);
        node.fullPath = path;

        if (Object.prototype.hasOwnProperty.call(listenerNodes, path)) {
          node.error(RED._('websocket.errors.duplicate-path', { path: node.mqtt_ws_path }));
          return;
        }
        listenerNodes[node.fullPath] = node;
        const serverOptions_ = {
          noServer: true
        };
        if (RED.settings.webSocketNodeVerifyClient) {
          serverOptions_.verifyClient = RED.settings.webSocketNodeVerifyClient;
        }

        node.server = ws.createServer({
          noServer: true
        }, broker.handle);

        node.log('Binding aedes mqtt server on ws path: ' + node.fullPath);
      }

      server.once('error', function (err) {
        if (err.code === 'EADDRINUSE') {
          node.error('Error: Port ' + config.mqtt_port + ' is already in use');
          node.status({ fill: 'red', shape: 'ring', text: 'node-red:common.status.disconnected' });
          setTimeout(startServer, 1000);
        } else {
          node.error('Error: Port ' + config.mqtt_port + ' ' + err.toString());
          node.status({ fill: 'red', shape: 'ring', text: 'node-red:common.status.disconnected' });
        }
      });

      if (node.mqtt_port) {
        server.listen(node.mqtt_port, function () {
          node.log('Binding aedes mqtt server on port: ' + config.mqtt_port);
          node.status({ fill: 'green', shape: 'dot', text: 'node-red:common.status.connected' });
        });
      }
    }
    startServer();

    if (this.credentials && this.username && this.password) {
      const authenticate = function (client, username, password, callback) {
        const authorized = (username === node.username && password.toString() === node.password);
        if (authorized) { client.user = username; }
        callback(null, authorized);
      };

      broker.authenticate = authenticate;
    }

    broker.on('client', function (client) {
      const msg = {
        topic: 'client',
        payload: {
          client: client
        }
      };
      node.send(msg);
    });

    broker.on('clientReady', function (client) {
      const msg = {
        topic: 'clientReady',
        payload: {
          client: client
        }
      };
      node.status({ fill: 'green', shape: 'dot', text: RED._('aedes-mqtt-broker.status.connected', { count: broker.connectedClients }) });
      node.send(msg);
    });

    broker.on('clientDisconnect', function (client) {
      const msg = {
        topic: 'clientDisconnect',
        payload: {
          client: client
        }
      };
      node.send(msg);
      node.status({ fill: 'green', shape: 'dot', text: RED._('aedes-mqtt-broker.status.connected', { count: broker.connectedClients }) });
    });

    broker.on('clientError', function (client, err) {
      const msg = {
        topic: 'clientError',
        payload: {
          client: client,
          err: err
        }
      };
      node.send(msg);
      node.status({ fill: 'green', shape: 'dot', text: RED._('aedes-mqtt-broker.status.connected', { count: broker.connectedClients }) });
    });

    broker.on('connectionError', function (client, err) {
      const msg = {
        topic: 'connectionError',
        payload: {
          client: client,
          err: err
        }
      };
      node.send(msg);
      node.status({ fill: 'green', shape: 'dot', text: RED._('aedes-mqtt-broker.status.connected', { count: broker.connectedClients }) });
    });

    broker.on('keepaliveTimeout', function (client) {
      const msg = {
        topic: 'keepaliveTimeout',
        payload: {
          client: client
        }
      };
      node.send(msg);
      node.status({ fill: 'green', shape: 'dot', text: RED._('aedes-mqtt-broker.status.connected', { count: broker.connectedClients }) });
    });

    broker.on('subscribe', function (subscription, client) {
      const msg = {
        topic: 'subscribe',
        payload: {
          topic: subscription.topic,
          qos: subscription.qos,
          client: client
        }
      };
      node.send(msg);
    });

    broker.on('unsubscribe', function (subscription, client) {
      const msg = {
        topic: 'unsubscribe',
        payload: {
          topic: subscription.topic,
          qos: subscription.qos,
          client: client
        }
      };
      node.send(msg);
    });

    /*
    broker.on('publish', function (packet, client) {
      var msg = {
        topic: 'publish',
        payload: {
          packet: packet,
          client: client
        }
      };
      node.send(msg);
    });
     */

    broker.on('closed', function () {
      node.debug('Closed event');
    });

    broker.on('close', function (done) {
      broker.close(function () {
        node.log('Unbinding aedes mqtt server from port: ' + config.mqtt_port);
        server.close(function () {
          node.debug('after server.close(): ');
          if (node.mqtt_ws_path !== '') {
            node.log('Unbinding aedes mqtt server from ws path: ' + node.fullPath);
            delete listenerNodes[node.fullPath];
            node.server.close();
          }
          if (wss) {
            node.log('Unbinding aedes mqtt server from ws port: ' + config.mqtt_ws_port);
            wss.close(function () {
              node.debug('after wss.close(): ');
              httpServer.close(function () {
                node.debug('after httpServer.close(): ');
                done();
              });
            });
          } else {
            done();
          }
        });
      });
    });

    this.on('close', function () {
      if (broker.connectedClients < 1) {
        broker.emit('close', function () {
          node.debug('after broker.close(): ');
        });
      } else {
        let forceShutdownTimer = setTimeout(function () {
          if (forceShutdownTimer) {
            forceShutdownTimer = null;
            broker.emit('close', function () {
              node.debug('after broker.close(): ');
            });
          }
        }, 1000); // timeout in mills
        broker.on('clientDisconnect', function () {
          if (broker.connectedClients < 1 && forceShutdownTimer) {
            clearTimeout(forceShutdownTimer);
            forceShutdownTimer = null;
            broker.emit('close', function () {
              node.debug('after broker.close(): ');
            });
          }
        });
      }
    });
  }

  RED.nodes.registerType('aedes broker', AedesBrokerNode, {
    credentials: {
      username: { type: 'text' },
      password: { type: 'password' },
      certdata: { type: 'text' },
      keydata: { type: 'text' }
    }
  });
};
