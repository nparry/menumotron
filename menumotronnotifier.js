var AWS = require('aws-sdk');
var s3 = new AWS.S3();

var Hipchatter = require('hipchatter');
var hipchatter = new Hipchatter(process.env.HIPCHAT_AUTH_TOKEN, 'https://covermymeds.hipchat.com/v2/');

var bucketName = 'menumotron.nparry.com';

function sendHipchatMessage(message, callback) {
  hipchatter.notify('Menumotron', {
    message: message,
    color: 'green',
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
  var today = new Date().toISOString().split('T')[0];
  s3.getObject({
    Bucket: bucketName,
    Key: 'menus/' + today
  }, function(err, data) {
    if (err) {
      console.log("Failed to fetch menu for " + today);
      console.log(err, err.stack);
      sendHipchatMessage("No menu found for " + today, callback);
    } else {
      console.log("Fetched menu for " + today);
      sendHipchatMessage(data.Body.utf8Slice(), callback);
    }
  });
};

