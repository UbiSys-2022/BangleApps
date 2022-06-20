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
const INTERVAL = 3e3;
const LCD_TIMEOUT = 30;
const NA = "n/a";
const RSSI_MARGIN = 6;

let dataHr = new Data(20);
let deviceCurrent = {};
let isLcdForceOn = false;
let scanIntervalId = -1;

const layout = new Layout({
  type: "v",
  c: [
    { type: "txt", font: "6x8", label: "", col: "#7beeff", id: "lcd" },
    { type: "txt", font: "20%", label: "0", id: "heartrate" },
    { type: "txt", font: "6x8", label: NA, col: "#00afff", id: "name" },
    {
      type: "custom",
      render: renderGraph,
      id: "graph",
      bgCol: g.theme.bg,
      col: "#ff0808",
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
          drawData();
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

function drawData() {
  layout.lcd.label = isLcdForceOn ? "lcd on" : "lcd auto";
  layout.heartrate.label = dataHr.last;
  layout.name.label = deviceCurrent.name || NA;
  g.clear();
  layout.render();
}

function forceLcdOn(e) {
  isLcdForceOn = !isLcdForceOn;

  console.log("force LCD on:", isLcdForceOn);
  drawData();

  if (isLcdForceOn) {
    Bangle.setLCDPower(1);
    Bangle.setLCDTimeout(0);
  } else {
    Bangle.setLCDTimeout(LCD_TIMEOUT);
  }
}

function scanNearbyDevices() {
  NRF.findDevices(
    (deviceList) => {
      let deviceClosest = { rssi: -Infinity };
      let currentRssi = -Infinity;

      for (const device of deviceList) {
        if (device.rssi > deviceClosest.rssi) {
          deviceClosest = device;
        }
        if (device.id === deviceCurrent.id) {
          currentRssi = device.rssi;
        }
      }

      const isExistent = Boolean(deviceClosest.id);
      const isCloser = deviceClosest.rssi + RSSI_MARGIN > currentRssi;
      const isSameDevice = deviceCurrent.id === deviceClosest.id;

      if (isExistent && isCloser && !isSameDevice) {
        console.log(
          "new closest device name is",
          deviceClosest.id,
          ", at",
          deviceClosest.rssi
        );
        Bangle.emit("closestdevicechanged", deviceClosest);
      } else {
        console.log("closest device is the same, at", deviceClosest.rssi);
      }
    },
    { filters: [{ services: ["180d"] }] /* , timeout: INTERVAL */ } // timeout seems to break scanning
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
  deviceCurrent = device || {};
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

Bangle.setLCDTimeout(LCD_TIMEOUT);

if (Bangle.isLCDOn()) {
  startScanning();
}

setWatch(forceLcdOn, BTN2, { repeat: true });
