import mqtt from "mqtt";
const urls = [
  "wss://public:public@public.cloud.shiftr.io",
  "wss://test.mosquitto.org/mqtt",
  "wss://broker.emqx.io:8084/mqtt",
  "wss://broker.hivemq.com:8884/mqtt",
  "wss://test.mosquitto.org:8081/mqtt",
  "wss://mqtt.eclipseprojects.io/mqtt",
];
await Promise.all(
  urls.map(
    (url) =>
      new Promise((resolve) => {
        const c = mqtt.connect(url, {
          connectTimeout: 8000,
          reconnectPeriod: 0,
        });
        const t = setTimeout(() => finish("timeout"), 10000);
        function finish(msg) {
          clearTimeout(t);
          console.log(url, msg);
          c.end(true);
          resolve();
        }
        c.on("connect", () => finish("connected"));
        c.on("error", (e) => finish(e.message));
      }),
  ),
);
