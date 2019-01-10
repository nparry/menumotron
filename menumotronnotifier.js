var AWS = require('aws-sdk');
var request = require('request')
var s3 = new AWS.S3();
var qs = require('querystring');

var Hipchatter = require('hipchatter');
var hipchatter = new Hipchatter(process.env.HIPCHAT_AUTH_TOKEN, 'https://covermymeds.hipchat.com/v2/');

var bucketName = 'menumotron.nparry.com';

function messageDeliveryFinished(err, office, chatSystem, callback) {
  if (err == null) {
    console.log('Sent ' + chatSystem + ' notification');
  }
  else {
    console.log('Failed to send ' + chatSystem + ' notification');
  }

  callback(office);
}

function sendHipchatMessage(event, office, message, color, callback) {
  // Semi-hack: Don't spam Hipchat if someone on Slack typed /lunch
  if (getSlackResponseUrl(event)) {
    callback(office);
    return;
  }

  hipchatter.notify('Menumotron', {
    message: office ? office + '\n' + message : message,
    color: color,
    message_format: 'text',
    token: process.env.HIPCHAT_ROOM_TOKEN,
    notify: true
  }, function(err) {
    messageDeliveryFinished(err, office, 'hipchat', callback);
  });
}

function sendSlackMessage(event, office, message, color, callback) {
  var json = {};
  if (office) {
    var colors = {
      green: '#36a64f',
      purple: '#770077',
      gray: '#777777'
    };

    json['attachments'] = [{
      fallback: message,
      color: colors[color],
      author_name: 'The Culinary Team',
      author_link: 'https://confluence.covermymeds.com/x/DQAf',
      title: office,
      title_link: process.env[office.toUpperCase() + '_MENU_HISTORY'],
      text: '```' + message + '```',
      mrkdwn: true
    }];
  }
  else {
    json['text'] = message;
  }

  var slackUrl = getSlackResponseUrl(event) || process.env.SLACK_WEBHOOK_URL;
  request.post(slackUrl, {
    json: json
  }, function(err, res, body) {
    messageDeliveryFinished(err, office, 'slack', callback);
  });
}

function sendMessages(event, office, message, color, callback) {
  if (message == null) {
    callback(office);
    return;
  }

  var chatSystemDeliveryMethods = [ sendHipchatMessage, sendSlackMessage ];

  var results = [];
  function messageDeliveredCallback(delivered) {
    results.push(delivered);
    if (results.length == chatSystemDeliveryMethods.length) {
      callback(office);
    }
  }

  chatSystemDeliveryMethods.forEach(function (deliverer) {
    deliverer(event, office, message, color, messageDeliveredCallback);
  });
}

function fetchMenu(office, menuName, callback) {
  s3.getObject({
    Bucket: bucketName,
    Key: 'menus/' + office + '/' + menuName
  }, function(err, data) {
    if (err) {
      console.log('Failed to fetch ' + office + ' menu for ' + menuName);
      console.log(err, err.stack);
      if (office == 'Columbus') {
        // Hack to amuse people
        callback('Something delicious (shrug)');
      }
      else {
        callback(null);
      }
    } else {
      console.log('Fetched ' + office + ' menu for ' + menuName);
      callback(data.Body.utf8Slice());
    }
  });
}

function produceHandlerResult(offices) {
  return {
    statusCode: 200
  };
}

function getSlackResponseUrl(event) {
  var slackResponseUrl = event['body'] ? qs.parse(event['body'])['response_url'] : null;
  return slackResponseUrl;
}

exports.handler = function(event, context, callback) {
  var today = new Date();
  var menuName = today.toISOString().split('T')[0];
  var isWeekend = (today.getDay() % 6) == 0;

  if (isWeekend) {
    console.log('Skipping S3 lookup since ' + menuName + ' is the weekend');
    sendMessages(event, null, 'Sorry, you have to figure out your own lunch on the weekend', 'gray', function(ignored) {
      callback(null, produceHandlerResult([]));
    });
  }
  else {
    var offices = {
      'Columbus': 'green',
      'Cleveland': 'purple'
    };

    var results = [];
    function handlerCallback(office) {
      results.push(office);
      if (results.length == Object.keys(offices).length) {
        callback(null, produceHandlerResult(results));
      }
    }

    Object.keys(offices).forEach(function (office) {
      fetchMenu(office, menuName, function(message) {
        sendMessages(event, office, message, offices[office], handlerCallback);
      });
    });
  }
};

