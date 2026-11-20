import { Aedes } from "aedes";
import { WebSocketServer, createWebSocketStream } from "ws";
const broker = await Aedes.createBroker();
const server = new WebSocketServer({ port: 18889 });
server.on("connection", (socket) =>
  broker.handle(createWebSocketStream(socket)),
);
console.log("Test MQTT broker: ws://localhost:18889");
