class Data {
  constructor(len) {
    this.hr = new Array(20);
    this.reset();
  }
  get last() {
    return this.hr[this.idx];
  }
  get length() {
    return this.hr.length;
  }
  get max() {
    return Math.max.apply(
      null,
      this.hr.filter((x) => x > 0)
    );
  }
  get min() {
    return Math.min.apply(
      null,
      this.hr.filter((x) => x > 0)
    );
  }
  push(value) {
    this.idx = (this.idx + 1) % this.hr.length;
    this.hr[this.idx] = value;
  }
  reset() {
    this.hr.fill(0);
    this.idx = 0;
  }
  get values() {
    return this.hr;
  }
}

function renderGraph(l) {
  require("graph").drawLine(g, l.data.values, {
    gridx: Math.floor(l.w / l.data.length),
    height: l.h,
    maxy: l.data.max,
    miny: l.data.min,
    width: l.w,
    x: l.x,
    y: l.y,
  });
}

const Layout = require("Layout");
const NA = "n/a";
const INTERVAL = 10e3;
let dataHr = new Data(20);
let deviceCurrent = { id: null };
let scanIntervalId = -1;

const layout = new Layout({
  type: "v",
  c: [
    { type: "txt", font: "20%", label: "0", id: "heartrate" },
    { type: "txt", font: "6x8", label: NA, id: "name" },
    {
      type: "custom",
      render: renderGraph,
      id: "graph",
      bgCol: g.theme.bg,
      fillx: 1,
      filly: 1,
      data: dataHr,
    },
  ],
});

function connect(device) {
  return () => {
    console.log("new closest device", device.id);
    dataHr.reset();

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

          dataHr.push(hr);
          drawData({ data: dataHr, name: deviceCurrent.name });
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
  layout.heartrate.label = args.data.last;
  layout.name.label = args.name || NA;
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
      const isSameDevice = deviceCurrent.id !== deviceClosest.id;

      if (isSameDevice) {
        console.log("new closest device name is", deviceClosest.id);
        Bangle.emit("closestdevicechanged", deviceClosest);
      } else {
        console.log("closes device is the same");
      }
    },
    { filters: [{ services: ["180d"] }] }
  );
}

function startScanning() {
  clearInterval(scanIntervalId);
  scanIntervalId = setInterval(scanNearbyDevices, INTERVAL);
  g.clear();
  E.showMessage("Scanning...");
  scanNearbyDevices();
}

Bangle.on("closestdevicechanged", (device) => {
  deviceCurrent = device;
  disconnect(deviceCurrent).then(connect(device));
});

Bangle.on("lcdPower", (isOn) => {
  if (isOn) {
    startScanning();
  } else {
    disconnect(deviceCurrent);
    clearInterval(scanIntervalId);
    scanIntervalId = -1;
  }
});

Bangle.setLCDTimeout(30);

if (Bangle.isLCDOn()) {
  startScanning();
}
