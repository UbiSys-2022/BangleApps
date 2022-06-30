/* DEFINITIONS */

// store heart rate data
//substitute name of patient in filename later!
var file = require("Storage").open("HR_patient_name.csv", "a");

let averageBPM = 0;
let currentBPM = 0;
let minimumBPM = 0;
let maximumBPM = 0;

// a function to show current time & date
function drawTimeDate() {
  var d = new Date();
  var h = d.getHours(),
    m = d.getMinutes(),
    day = d.getDate(),
    month = d.getMonth(),
    weekDay = d.getDay();

  if (h < 10) {
    h = "0" + h;
  }

  if (m < 10) {
    m = "0" + m;
  }

  var daysOfWeek = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  var hours = (" " + h).substr(-2);
  var mins = ("0" + m).substr(-2);
  var date = `${daysOfWeek[weekDay]}|${day}|${("0" + (month + 1)).substr(-2)}`;

  // Reset the state of the graphics library
  g.reset();
  // Set color
  g.setColor("#2ecc71");
  // draw the current time (4x size 7 segment)
  g.setFont("6x8", 3);
  g.setFontAlign(-1, 0); // align right bottom
  g.drawString(hours + ":", 25, 25, true /*clear background*/);
  g.drawString(mins, 80, 25, true /*clear background*/);

  // draw the date (2x size 7 segment)
  g.setFont("6x8", 3);
  g.setFontAlign(-1, 0); // align right bottom
  g.drawString(date, 25, 70, true /*clear background*/);
}

// give power to the heart rate monitor of the watch
Bangle.setHRMPower(1);

// a function to show the beats per minute
function drawHRM() {
  g.reset();
  g.setFont("6x8", 3).setFontAlign(0, 0);
  g.drawString("BPM", 50, 120, true);
  g.setColor("#663F46");
  heartRate = currentBPM;
  g.setColor("#5299D3");
  if (heartRate) g.drawString(heartRate, 120, 120, true);
  else {
    //while loading
    g.drawString("--", 120, 120, true);
  }
  g.setFont("6x8", 2).setFontAlign(0, 0);
  g.setColor("#F7AEF8");
  // console.log(heartRate);
  /* Tachycardia
  Heart rate excees normal resting rate */
  if (heartRate > 120) g.drawString("Pulse too high!", 120, 200, true);
  /* Bradycardia
  Slow, resting heart rate and commonly normal during sleep, or for resting athletes. More tricky do detect, because if loop checks for pulse under 60, every sleeping person might trigger an alarm. For testing check for values lower than 40. */
  if (heartRate < 40) g.drawstring("Pulse too low!", 120, 200, true);
}

function fileWrite(bpm) {
  // data to store in file
  var csv = [
    0 | getTime(), // Time to the nearest second
    (currentBPM = bpm),
  ];
  // write data here
  file.write(csv.join(",") + "\n");
  // read data
  var f = require("Storage").open("HR_patient_name.csv", "r");
  var l = f.readLine();
  while (l !== undefined) {
    console.log(l);
    l = f.readLine();
  }
}

/* START APP */

g.clear(); /*clear bg at start*/

// set up a Hear Rate Profile
NRF.setServices(
  {
    "180d": {
      "2a37": {
        notify: true,
        value: [0x00, 255],
      },
      "2a8d": {
        readable: true,
        value: [minimumBPM, averageBPM, maximumBPM],
      },
    },
  },
  { advertise: ["180d"] }
);

function updateData(heartrate) {
  averageBPM = Math.round((averageBPM + heartrate) / 2);
  maximumBPM = Math.max(heartrate, maximumBPM);
  minimumBPM = Math.min(heartrate, minimumBPM);

  NRF.updateServices({
    "180d": {
      "2a37": {
        notify: true,
        value: [0x00, heartrate],
      },
      "2a8d": {
        readable: true,
        value: [minimumBPM, averageBPM, maximumBPM],
      },
    },
  });
}

// show the information on clock & BPM
drawTimeDate();
drawHRM();
//fileWrite(currentBPM);

var secondInterval = setInterval(() => {
  drawTimeDate();
  // fileWrite(currentBPM);
}, 1000);

// Stop updates when LCD is off, restart when on
Bangle.on("lcdPower", (on) => {
  if (on) {
    secondInterval = setInterval(() => {
      drawTimeDate();
    }, 15000);
    //Screen on
    g.reset();
    g.clear();
    drawHRM();
    drawTimeDate();
    // fileWrite(currentBPM);
  } else {
    //Screen off
    clearInterval(secondInterval);
  }
});

// store the value for bpm from built-in method
Bangle.on("HRM", function (hrm) {
  currentBPM = hrm.bpm;
  drawHRM();
  updateData(hrm.bpm);
});
