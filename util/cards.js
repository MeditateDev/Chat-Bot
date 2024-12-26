const { CustomActivityTypes } = require('../classes/CustomActivityTypes');
const { replaceStrWithParam } = require('./helper');

module.exports = class Cards {
  constructor(cards, channelId, flowId, actionId, Output, convData, imageAspectRatio = '') {
    this.flowId = flowId;
    this.actionId = actionId;
    this.channelId = channelId;
    this.imageAspectRatio = imageAspectRatio;
    this.data = this.parseCards(cards);
    this.output = Output;
    this.convData = convData;
    this.handlePostBack();
    this.replaceData();
  }

  parseCards(cards) {
    try {
      if (!cards) throw new Error('Cards is empty!');

      let result = typeof cards === 'string' ? JSON.parse(cards) : cards;

      if (typeof result === 'object' && !Array.isArray(result)) {
        result = [result];
      }

      if (!Array.isArray(result) || !result.length) throw new Error(`Cards must be an array or cards is empty!`);

      return result;
    } catch (e) {
      console.log(`[${this.flowId} ${this.actionId}] parse cards failed : ${e.message}`);
      return;
    }
  }

  handlePostBack() {
    if (!this.data) return;

    try {
      this.data = this.data.map((e) => {
        const { buttons } = e;
        if (!Array.isArray(buttons) || !buttons.length) return { ...e };
        return {
          ...e,
          buttons: buttons.map((b) => {
            return {
              ...b,
              value:
                b.type === 'text'
                  ? JSON.stringify({
                      output: this.output,
                      value: b.value,
                      flowId: this.flowId,
                      actionId: this.actionId,
                    })
                  : b.value,
            };
          }),
        };
      });
    } catch (e) {
      console.log(`[${this.flowId} ${this.actionId}] handlePostBack cards button failed : ${e.message}`);
      return;
    }
  }

  replaceData() {
    if (!this.data) return;
    try {
      this.data = this.data.map((e) => {
        const { title, image, description, buttons } = e;

        const newData = {
          title: replaceStrWithParam(this.convData, title),
          image: replaceStrWithParam(this.convData, image),
          description: replaceStrWithParam(this.convData, description),
        };

        if (!Array.isArray(buttons) || !buttons.length) return { ...newData };

        return {
          ...newData,
          buttons: buttons.map((b) => {
            return {
              ...b,
              text: replaceStrWithParam(this.convData, b.text),
              value: replaceStrWithParam(this.convData, b.value)
            };
          }),
        };
      });
    } catch (e) {
      console.log(`[${this.flowId} ${this.actionId}] replaceData cards failed : ${e.message}`);
      return;
    }
  }

  formatCard() {
    const results = {
      channelData: {},
      type: CustomActivityTypes.Cards,
    };
    try {
      switch (this.channelId) {
        case 'WEB':
          results.channelData.imageAspectRatio = this.imageAspectRatio || 'horizontal';
          results.channelData.cards = this.formatWeb();
          break;
        case 'LIN':
        case 'LNE':
          if (this.imageAspectRatio == 'horizontal') {
            this.imageAspectRatio = 'rectangle';
          }
          results.channelData.imageAspectRatio = this.imageAspectRatio || 'rectangle';
          results.channelData.cards = this.formatLine();
          break;
        case 'MSG':
          results.channelData.imageAspectRatio = this.imageAspectRatio || 'horizontal';
          results.channelData.cards = this.formatMessenger();
          break;
        default:
          console.log(`Not supported cards on this channel ${this.channelId}`);
      }
    } catch (e) {
      console.log(`[${this.flowId} ${this.actionId}] replaceData cards failed : ${e.message}`);
    }
    return results;
  }

  formatWeb() {
    let results = [];
    if (!Array.isArray(this.data)) return results;

    this.data.forEach((card) => {
      try {
        let { title, image, description, buttons } = card;
        if (!image) {
          throw new Error('Missing parameter');
        }
        if (card.buttons) {
          const formatButtons = card.buttons && this.formatWebButton(buttons);
          card.buttons = formatButtons;
        }
        results.push(card);
      } catch (e) {
        console.log(`[formatMessenger] Format card for Messenger Channel failed: ${e.message}`);
        return;
      }
    });
    return results.slice(0, 10);
  }

  formatMessenger() {
    let results = [];
    if (!Array.isArray(this.data)) return results;

    this.data.forEach((d) => {
      try {
        const { title, image, description, buttons } = d;

        if (!image) {
          throw new Error('Missing parameter');
        }

        let card = {
          title: (title.length > 80 ? title.slice(0, 80) : title) || 'No title',
          image_url: image,
          subtitle: description.length > 80 ? description.slice(0, 80) : description,
        };

        if (d.buttons) {
          const formatButtons = d.buttons && this.formatMessengerButtons(buttons);
          card.buttons = formatButtons;
        }

        results.push(card);
      } catch (e) {
        console.log(`[formatMessenger] Format card for Messenger Channel failed: ${e.message}`);
        return;
      }
    });
    return results.slice(0, 10);
  }

  formatLine() {
    let results = [];
    if (!Array.isArray(this.data)) return results;

    this.data.forEach((d) => {
      try {
        const { title, image, description, buttons } = d;

        if (!image) {
          throw new Error('Missing parameter');
        }

        let card = {
          title: (title.length > 40 ? title.slice(0, 40) : title) || 'No title',
          thumbnailImageUrl: image,
          text: (description.length > 60 ? title.slice(0, 60) : description) || 'No description',
        };

        if (d.buttons) {
          const formatButtons = d.buttons && this.formatLineButtons(buttons);
          card.actions = formatButtons;
        }

        results.push(card);
      } catch (e) {
        console.log(`[formatLine] Format card for Line Channel failed: ${e.message}`);
        return;
      }
    });
    return results.slice(0, 10);
  }

  formatWebButton(buttons) {
    let result = [];
    if (!Array.isArray(buttons)) return result;
    buttons.forEach((button) => {
      try {
        if (button.text.length > 20) button.text = button.text.slice(0, 20);
        result.push(button);
      } catch (e) {
        console.log(`[formatMessengerButtons] Format card buttons for Facebook Messenger failed: ${e.message}`);
        return;
      }
    });
    return result.slice(0, 3);
  }

  formatMessengerButtons(buttons) {
    let result = [];
    if (!Array.isArray(buttons)) return result;
    buttons.forEach((button) => {
      try {
        let { type, text, value } = button;
        if (text.length > 20) text = text.slice(0, 20);
        switch (type) {
          case 'open-web':
            result.push({
              type: 'web_url',
              url: value,
              title: text,
            });
            break;
          case 'text':
            result.push({
              type: 'postback',
              title: text,
              payload: value.length > 1000 ? value.slice(0, 1000) : value,
            });
            break;
          case 'make-call':
            result.push({ type: 'phone_number', payload: value, title: text });
            break;
          default:
            break;
        }
      } catch (e) {
        console.log(`[formatMessengerButtons] Format card buttons for Facebook Messenger failed: ${e.message}`);
        return;
      }
    });
    return result.slice(0, 3);
  }

  formatLineButtons(buttons) {
    let result = [];
    if (!Array.isArray(buttons)) return result;
    buttons.forEach((button) => {
      try {
        let { type, text, value } = button;
        if (text.length > 20) text = text.slice(0, 20);
        switch (type) {
          case 'open-web':
            result.push({ type: 'uri', uri: value, label: text });
            break;
          case 'text':
            result.push({
              type: 'postback',
              data: value.length > 300 ? value.slice(0, 300) : value,
              label: text,
              displayText: text,
            });
            break;
          case 'make-call':
            result.push({ type: 'uri', uri: `tel:${value}`, label: text });
            break;
          default:
            break;
        }
      } catch (e) {
        console.log(`[formatLineButtons] Format card buttons for Line failed: ${e.message}`);
        return;
      }
    });
    return result.slice(0, 3);
  }
};
