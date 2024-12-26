const fs = require('fs');

const filePath = './flow.json';
const flowfolder = './flows/';

module.exports = {
  readFlowFromFile: async (botId) => {
    if (!botId) {
      console.log(`BOT ID IS EMPTY => CAN NOT GET FLOW FROM FILE`);
      return;
    }
    try {
      let flows = await fs.readFileSync(filePath, 'utf8');
      flows = JSON.parse(flows);

      let flow = flows.find((f) => f.botId == botId);

      if (!flow) {
        console.log(`CAN NOT FIND ANY FLOW WITH BOT ID: ${botId}`);
        return;
      }

      let fileName = flow.fileName;

      if (!fileName.includes('.json')) fileName = fileName + '.json';

      const flowfile = await fs.readFileSync(flowfolder + fileName, 'utf8');

      if (!flowfile) {
        console.log(`CAN NOT FIND ANY FLOW WITH BOT ID: ${botId}`);
        return;
      }

      return { ...flow, jsonFormat: JSON.parse(flowfile) };
    } catch (err) {
      console.log(`CAN NOT FIND ANY FLOW WITH BOT ID: ${botId} - Error: ${err.message}`);
      console.error(err.stack);
      return;
    }
  },
};
