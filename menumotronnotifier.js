const util = require('util');
const qs = require('querystring');

const request = require('request');
const postRequest = util.promisify(request.post);

const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const getS3Object = util.promisify(s3.getObject);

const Hipchatter = require('hipchatter');
const hipchatter = new Hipchatter(process.env.HIPCHAT_AUTH_TOKEN, 'https://covermymeds.hipchat.com/v2/');
const notifyHipchat = util.promisify(hipchatter.notify);

const bucketName = 'menumotron.nparry.com';

const colors = {
  green: '#36a64f',
  purple: '#770077',
  gray: '#777777'
};

async function fetchMenus(offices) {
  const today = new Date();
  const menuName = today.toISOString().split('T')[0];
  const isWeekend = (today.getDay() % 6) == 0;

  if (isWeekend) {
    return weekendMenu();
  }

  const menus = await weekdayMenus(offices, menuName);
  return menus;
}

function weekendMenu() {
  return [{
    office: null,
    color: 'gray',
    menu: 'Sorry, you have to figure out your own lunch on the weekend'
  }];
}

async function weekdayMenus(offices, menuName) {
  const menus = await Promise.all(Object.keys(offices).map(async office => {
    const menu = await weekdayMenu(office, menuName, offices[office]);
    return menu;
  }));
  return [].concat(...menus);
}

async function weekdayMenu(office, menuName, color) {
  const menu = await fetchMenu(office, menuName);
  if (menu) {
    return [{
      office: office,
      color: color,
      menu: menu
    }];
  }

  return [];
}

async function fetchMenu(office, menuName) {
  try {
    const data = await getS3Object.call(s3, {
      Bucket: bucketName,
      Key: 'menus/' + office + '/' + menuName
    });

    console.log('Fetched ' + office + ' menu for ' + menuName);
    return data.Body.utf8Slice();
  } catch (e) {
    console.log('Failed to fetch ' + office + ' menu for ' + menuName);
    if (office == 'Columbus') {
      // Hack to amuse people
      return 'Something delicious (shrug)';
    }

    return null;
  }
}

function createNotifiers(event, menus, chatSystemFactories) {
  const notifiers = chatSystemFactories.map(factory => factory(event, menus));
  return [].concat(...notifiers);
}

function hipchatNotifierFactory(event, menus) {
  // Semi-hack: Don't spam Hipchat if someone on Slack typed /lunch
  if (getSlackResponseUrl(event)) {
    return [];
  }

  return menus.map(menu => async function(response) {
    await notifyHipchat.call(hipchatter, 'Menumotron', hipchatMessageParams(menu));
  });
}

function hipchatMessageParams(menu) {
  return {
    message: menu.office ? menu.office + '\n' + menu.menu : menu.menu,
    color: menu.color,
    message_format: 'text',
    token: process.env.HIPCHAT_ROOM_TOKEN,
    notify: true
  };
}

function slackNotifierFactory(event, menus) {
  const slackMessage = slackMessageParams(menus);

  if (getSlackResponseUrl(event)) {
    // Someone typed /lunch, we can return a response to the API call
    return async function(response) {
      response['headers'] = { "Content-Type": "application/json" };
      response['body'] = JSON.stringify(slackMessage);
    };
  }

  // We are not responding to /lunch, post to the room via a webhook
  return async function(response) {
    await postRequest(process.env.SLACK_WEBHOOK_URL, { json: slackMessage });
  };
}

function slackMessageParams(menus) {
  return {
    response_type: 'in_channel',
    attachments: menus.map(menu => slackAttachmentParams(menu))
  };
}

function slackAttachmentParams(menu) {
  const attachment = {
    author_name: 'The Culinary Team',
    author_link: 'https://confluence.covermymeds.com/x/DQAf',
    fallback: menu.menu,
    text: '```' + menu.menu + '```',
    color: colors[menu.color],
    mrkdwn: true
  };

  if (menu.office) {
    attachment['title'] = menu.office;
    attachment['title_link'] = process.env[menu.office.toUpperCase() + '_MENU_HISTORY'];
  }

  return attachment;
}

function getSlackResponseUrl(event) {
  return event['body'] ? qs.parse(event['body'])['response_url'] : null;
}

async function handleEvent(event) {
  const menus = await fetchMenus({
    Columbus: 'green',
    Cleveland: 'purple'
  });

  const notifiers = createNotifiers(event, menus, [
    hipchatNotifierFactory,
    slackNotifierFactory
  ]);

  const response = {
    statusCode: 200
  };

  await Promise.all(notifiers.map(async notifier => await notifier(response)));

  return response;
}

exports.handler = function(event, context, callback) {
  handleEvent(event).then(result => callback(null, result));
};
