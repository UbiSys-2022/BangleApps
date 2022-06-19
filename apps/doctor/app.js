const Layout = require("Layout");
const layout = new Layout({
  type: "v",
  c: [
    { type: "txt", font: "20%", label: "0", id: "heartrate" },
    { type: "txt", font: "6x8", label: "n/a", id: "name" },
  ],
});
const INTERVAL = 10e3;
let deviceCurrent = { id: null };

function connect(device) {
  return () => {
    console.log("new closest device", device.id);

    return device.gatt
      .connect()
      .then((g) => {
        gattCurrent = g;
        console.log("device name:", device.name);

        return g.startBonding();
      })
      .then(() => {
        console.log("acquiring service");

        return gattCurrent.getPrimaryService("180d");
      })
      .then((svc) => {
        console.log("querying service");

        return svc.getCharacteristic("2a37");
      })
      .then((char) => {
        console.log("connect to characteristic");

        char.on("characteristicvaluechanged", (e) => {
          const hr = e.target.value.getUint8(1);

          drawData({ name: deviceCurrent.name, heartrate: hr });
        });

        return char.startNotifications();
      })
      .catch(console.log);
  };
}

function disconnect(device) {
  if (device.connected) {
    console.log("disconnecting the previous device");
    return device.gatt.disconnect();
  } else {
    return Promise.resolve();
  }
}

function drawData(args) {
  layout.heartrate.label = args.heartrate;
  layout.name.label = args.name;
  g.clear();
  layout.render();
}

function scanNearbyDevices() {
  NRF.findDevices(
    (deviceList) => {
      const deviceClosest = deviceList.reduce(
        (closest, device) => (closest.rssi > device.rssi ? closest : device),
        {}
      );

      console.log("closest device name is", deviceClosest.id);

      if (deviceCurrent.id !== deviceClosest.id) {
        Bangle.emit("closestdevicechanged", deviceClosest);
      }
    },
    { filters: [{ services: ["180d"] }] }
  );
}

Bangle.on("closestdevicechanged", (device) => {
  deviceCurrent = device;
  disconnect(deviceCurrent).then(connect(device));
});

setInterval(scanNearbyDevices, INTERVAL);
scanNearbyDevices();
g.clear();

