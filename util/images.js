const { CustomActivityTypes } = require('../classes/CustomActivityTypes');

module.exports = class Image {
  constructor(data, channelId) {
    this.channelId = channelId;
    this.data = data;
  }

  formatImage() {
    if (!this.data) return;

    const results = {
      channelData: {},
      type: CustomActivityTypes.Image,
    };

    switch (this.channelId) {
      case 'WEB':
      case '382':
        results.channelData.imageUrl = this.data;
        return results;
      case 'LNE':
      case 'LIN':
        results.channelData.imageUrl = this.data;
        return results;
      case 'MSG':
        results.channelData.attachmentUrl = this.data;
        return results;
      default:
        console.log(`Not supported image on this channel ${this.channelId}`);
        break;
    }

    return results;
  }
};
