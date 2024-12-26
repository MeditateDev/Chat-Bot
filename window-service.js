// npm i node-windows
const path = require("path");
var Service = require("node-windows").Service;

// Create a new service object
var svc = new Service({
  name: "Call Flow Bot",
  description: "The call flow bot",
  script: path.join(__dirname, 'index.js'),
  nodeOptions: ["--harmony", "--max_old_space_size=4096"],
  //, workingDirectory: '...'
  //, allowServiceLogon: true
//   logpath: "Logs",
});

// Listen for the "install" event, which indicates the
// process is available as a service.
svc.on("install", function () {
  svc.start();
});

svc.uninstall();