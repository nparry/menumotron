var AWS = require('aws-sdk');
var s3 = new AWS.S3();

var Hipchatter = require('hipchatter');
var hipchatter = new Hipchatter(process.env.HIPCHAT_AUTH_TOKEN, 'https://covermymeds.hipchat.com/v2/');

var bucketName = 'menumotron.nparry.com';

function sendHipchatMessage(message, color, callback) {
  console.log('Sending ' + color + ' message to hipchat');
  hipchatter.notify('Menumotron', {
    message: message,
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
    callback(null, {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: "{ }"
    });
  });
}

exports.handler = function(event, context, callback) {
  var today = new Date();
  var menuName = today.toISOString().split('T')[0];
  var isWeekend = (today.getDay() % 6) == 0;

  if (isWeekend) {
    console.log('Skipping S3 lookup since ' + menuName + ' is the weekend');
    sendHipchatMessage('Sorry, you have to figure out your own lunch on the weekend', 'gray', callback);
  }
  else {
    s3.getObject({
      Bucket: bucketName,
      Key: 'menus/' + menuName
    }, function(err, data) {
      if (err) {
        console.log('Failed to fetch menu for ' + menuName);
        console.log(err, err.stack);
        sendHipchatMessage('No menu found for ' + menuName, 'yellow', callback);
      } else {
        console.log('Fetched menu for ' + menuName);
        sendHipchatMessage(data.Body.utf8Slice(), 'green', callback);
      }
    });
  }
};

