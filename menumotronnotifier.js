var AWS = require('aws-sdk');
var s3 = new AWS.S3();

var Hipchatter = require('hipchatter');
var hipchatter = new Hipchatter(process.env.HIPCHAT_AUTH_TOKEN, 'https://covermymeds.hipchat.com/v2/');

var bucketName = 'menumotron.nparry.com';

function sendHipchatMessage(office, message, color, callback) {
  console.log('Sending ' + color + ' message to hipchat');
  hipchatter.notify('Menumotron', {
    message: office ? office + '\n' + message : message,
    color: color,
    message_format: 'text',
    token: process.env.HIPCHAT_ROOM_TOKEN,
    notify: true
  }, function(err) {
    if (err == null) {
      console.log('Sent hipchat notification');
    }
    else {
      console.log('Failed to send hipchat notification');
      console.log(err, err.stack);
    }

    callback(office);
  });
}

function sendHipchatMessageForOffice(office, menuName, color, callback) {
  s3.getObject({
    Bucket: bucketName,
    Key: 'menus/' + office + '/' + menuName
  }, function(err, data) {
    if (err) {
      console.log('Failed to fetch ' + office + ' menu for ' + menuName);
      console.log(err, err.stack);
      sendHipchatMessage(office, 'No menu found for ' + menuName, 'yellow', callback);
    } else {
      console.log('Fetched ' + office + ' menu for ' + menuName);
      sendHipchatMessage(office, data.Body.utf8Slice(), color, callback);
    }
  });
}

function produceHandlerResult(offices) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 'results': offices })
  };
}

exports.handler = function(event, context, callback) {
  var today = new Date();
  var menuName = today.toISOString().split('T')[0];
  var isWeekend = (today.getDay() % 6) == 0;

  if (isWeekend) {
    console.log('Skipping S3 lookup since ' + menuName + ' is the weekend');
    sendHipchatMessage(null, 'Sorry, you have to figure out your own lunch on the weekend', 'gray', function(ignored) {
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
      sendHipchatMessageForOffice(office, menuName, offices[office], handlerCallback);
    });
  }
};

