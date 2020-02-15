# node-red-contrib-aedes
MQTT Broker for Node-RED based on [Aedes](https://github.com/moscajs/aedes).

You can use MQTT-in and MQTT-out nodes without an external MQTT broker like Mosquitto.


[![Build Status](https://travis-ci.org/martin-doyle/node-red-contrib-mosca.svg?branch=master)](https://travis-ci.org/martin-doyle/node-red-contrib-mosca)

[![Dependency Status](https://david-dm.org/martin-doyle/node-red-contrib-mosca.svg)](https://david-dm.org/martin-doyle/node-red-contrib-mosca)
[![devDependency Status](https://david-dm.org/martin-doyle/node-red-contrib-mosca/dev-status.svg)](https://david-dm.org/martin-doyle/node-red-contrib-mosca#info=devDependencies)

[![Open Source Love](https://badges.frapsoft.com/os/mit/mit.svg?v=102)](https://github.com/ellerbrock/open-source-badge/)

##Background
This node was created because the original MQTT broker [node-red-contrib-mqtt-broker](https://github.com/zuhito/node-red-contrib-mqtt-broker) uses [mosca](https://github.com/moscajs/mosca) which is no longer maintained.
## Flows
Once you just put this node on Node-RED and hit deploy button, MQTT Broker will run on your Node-RED.

![flows](https://raw.githubusercontent.com/zuhito/node-red-contrib-mqtt-broker/master/flows.png)

You can set "localhost" in MQTT-in and MQTT-out properties as follows.

![setting](https://raw.githubusercontent.com/zuhito/node-red-contrib-mqtt-broker/master/setting.png)
