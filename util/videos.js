const { CustomActivityTypes } = require('../classes/CustomActivityTypes');

module.exports = class Video {
  constructor(data, channelId) {
    this.channelId = channelId;
    this.data = data;
  }

  formatVideo() {
    if (!this.data) return;

    const results = {
      channelData: {},
      type: CustomActivityTypes.Video,
    };

    switch (this.channelId) {
      case 'WEB':
        results.channelData.videoUrl = this.data;
        return results;
      case 'LNE':
      case 'LIN':
        results.channelData.videoUrl = this.data;
        return results;
      case 'MSG':
        results.channelData.attachmentUrl = this.data;
        return results;
      default:
        console.log(`Not supported video on this channel ${this.channelId}`);
        break;
    }

    return results;
  }
};
