const UserInfo = require('../models/userInfo');
const utils = require('../util/helper');
var users = [];
var waitingUsers = [];

const add = (activity) => {
  var index = users.findIndex((item) => item.id === activity.conversation.id);
  if (index < 0) {
    var user = new UserInfo(activity);
    users.push(user);
    return user;
  }
  users[index].activity = activity;
  return users[index];
};

const newUser = (activity) => {
  var index = users.findIndex((item) => item.id === activity.conversation.id);
  var user = new UserInfo(activity);
  if (index >= 0) {
    users[index] = user;
  } else {
    users.push(user);
  }
  user.newUser = true;
  return user;
};

const update = (user) => {
  var index = users.findIndex((item) => item.id === user.id);
  if (index >= 0) {
    users.splice(index, 1, user);
  } else {
    users.push(user);
  }
};

const find = (userId) => users.find((user) => user.id == userId);

const findByActivity = (activity) => {
  return users.find((user) => activity.conversation.id == user.id);
};

const findByConversationID = (id) => users.find((user) => user.activity.conversation.id == id);

const copyInfoFromContactMessage = (user, cm, attributes) => {
  if (cm) {
    user.id = cm.SenderID;
    if (!user.name) user.name = cm.SenderName;
    if (!user.phone) user.phone = utils.getPhoneNumber(cm.PhoneNumber);
    user.isRepeat = true;
    user.vdn = cm.VDN || user.vdn;
    if (!user.reason) user.reason = cm.ReasonContact;

    attributes.name = user.name;
    attributes.phone = user.phone;
    attributes.reason = user.reason;
  }
};

const getWaitingUser = (id) => waitingUsers.find((user) => user.id === id);

const addWaitingUser = (id) => {
  var waitingUser = waitingUsers.find((user) => user.id == id);
  console.log('add waiting user: ' + id);
  if (waitingUser) {
    if (waitingUser.wait30s) {
      clearTimeout(waitingUser.wait30s);
    }
    if (waitingUser.wait1m) {
      clearTimeout(waitingUser.wait1m);
    }
  } else {
    waitingUser = {
      id,
    };
    waitingUsers.push(waitingUser);
  }
  return waitingUser;
};

const removeWaitingUser = (id) => {
  var index = waitingUsers.findIndex((user) => user.id == id);
  if (index >= 0) {
    console.log('remove waiting user: ' + id);
    let waitingUser = waitingUsers[index];
    if (waitingUser.wait30s) {
      clearTimeout(waitingUser.wait30s);
      waitingUser.wait30s = null;
    }
    if (waitingUser.wait1m) {
      clearTimeout(waitingUser.wait1m);
      waitingUser.wait1m = null;
    }
    waitingUsers.slice(index, 1);
  }
};

const clearUserData = () => {
  for (let i = 0; i < waitingUsers.length; i++) {
    clearTimeout(waitingUsers[i].wait30s);
    clearTimeout(waitingUsers[i].wait1m);
  }
  waitingUsers = [];
  users = [];
};

const removeUser = (activity) => {
  var index = users.findIndex((item) => item.id === activity.conversation.id);
  if (index >= 0) {
    users.splice(index, 1);
  }
};

const getUsers = () => users;

module.exports = {
  add,
  newUser,
  update,
  find,
  findByActivity,
  findByConversationID,
  copyInfoFromContactMessage,
  getWaitingUser,
  addWaitingUser,
  removeWaitingUser,
  clearUserData,
  removeUser,
  getUsers,
};
