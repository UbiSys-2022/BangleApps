class Data {
  constructor(len) {
    this.hr = new Array(len);
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
const RSSI_MARGIN = 6;

let dataHr = new Data(20);
let deviceCurrent = {};
let isLcdForceOn = false;
let scanIntervalId = -1;

function forceLcdOn(l) {
  isLcdForceOn = !isLcdForceOn;

  console.log("force LCD on:", isLcdForceOn);

  if (isLcdForceOn) {
    Bangle.setLCDPower(1);
    Bangle.setLCDTimeout(0);
    layout.b[0].col = "#77ff77";
  } else {
    Bangle.setLCDTimeout(LCD_TIMEOUT);
    layout.b[0].col = "#777777";
  }

  layout.render(layout.b[0]);
}

function resetRequest() {
  layout.b[1].col = "#777777";
  layout.render(layout.b[1]);
  renderLabel(layout.min);
  renderLabel(layout.avg);
  renderLabel(layout.max);
}

function requestStatsFromCurrent() {
  console.log("request current device stats");

  if (deviceCurrent.gatt.connected) {
    console.log("request stats from", deviceCurrent.name);
    layout.b[1].col = "#77ff77";
    layout.render(layout.b[1]);
    renderLabel(layout.avg, "requesting...");

    deviceCurrent.gatt
      .getPrimaryService("180d")
      .then((svc) => {
        return svc.getCharacteristic("2a8d");
      })
      .then((char) => {
        return char.readValue();
      })
      .then((value) => {
        const min = value.getUint8(0);
        const avg = value.getUint8(1);
        const max = value.getUint8(2);

        renderLabel(layout.min, `min ${min}`);
        renderLabel(layout.avg, `avg ${avg}`);
        renderLabel(layout.max, `max ${max}`);
        setTimeout(resetRequest, INTERVAL);
      })
      .catch(resetRequest);
  }
}

const layout = new Layout(
  {
    type: "v",
    c: [
      {
        type: "txt",
        font: "10%",
        label: "not connected",
        col: "#00afff",
        id: "name",
      },
      { type: "txt", font: "20%", label: "---", id: "heartrate" },
      {
        type: "h",
        c: [
          {
            type: "txt",
            font: "7%",
            label: "min ---",
            col: "#07dfae",
            id: "min",
            pad: 4,
          },
          {
            type: "txt",
            font: "7%",
            label: "avg ---",
            col: "#07dfae",
            id: "avg",
            pad: 4,
          },
          {
            type: "txt",
            font: "7%",
            label: "max ---",
            col: "#07dfae",
            id: "max",
            pad: 4,
          },
        ],
      },
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
  },
  {
    btns: [
      { type: "btn", label: "lcd", col: "#777777", cb: forceLcdOn },
      {
        type: "btn",
        label: "stats",
        col: "#aaaaaa",
        cb: requestStatsFromCurrent,
      },
    ],
  }
);

function renderLabel(obj, value) {
  layout.clear(obj);
  obj.label = "";

  if (value) {
    obj.label = value;
    layout.render(obj);
  }
}

function connect(device) {
  return () => {
    deviceCurrent = device;
    renderLabel(layout.name, device.name);

    console.log("new closest device", device.id);
    device.on("gattserverdisconnected", () => {
      deviceCurrent = {};
      console.log(device.name, "disconnected");
      renderLabel(layout.name);
      dataHr.reset();
      renderLabel(layout.heartrate, dataHr.last);
      layout.render(layout.graph);
    });

    return device.gatt
      .connect()
      .then((gatt) => {
        gattCurrent = gatt;
        console.log("device name:", device.name);

        return gatt.startBonding();
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
          renderLabel(layout.heartrate, dataHr.last);
          layout.render(layout.graph);
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
  resetRequest();
  renderLabel(layout.name, "Scanning...");

  scanNearbyDevices();
}

Bangle.on("closestdevicechanged", (device) => {
  disconnect(deviceCurrent).then(connect(device));
});

Bangle.on("lcdPower", (isOn) => {
  if (isOn) {
    layout.render();
    startScanning();
  } else {
    disconnect(deviceCurrent);
    clearInterval(scanIntervalId);
    scanIntervalId = -1;
  }
});

Bangle.setLCDTimeout(LCD_TIMEOUT);
g.clear();
layout.render();

if (Bangle.isLCDOn()) {
  startScanning();
}
