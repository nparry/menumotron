var AWS = require('aws-sdk');
var s3 = new AWS.S3();
var mimelib = require('mimelib');

var bucketName = 'menumotron.nparry.com';

function extractMenu(buffer) {
  var data = buffer.utf8Slice();
  var boundary = data.match(/boundary="([^"]+)"/)[1];
  var encodedMenu = data.split('--' + boundary)[1];
  return mimelib.decodeQuotedPrintable(encodedMenu);
}

function determineMenuName(menu) {
  var startOfWeekAsGiven = menu.match(/week\s+(of\s+)?([0-9.-]+)/i)[2];
  var parts = startOfWeekAsGiven.split(/[.-]/);

  var year = parseInt(parts[2]);
  var month = parseInt(parts[0]);
  var day = parseInt(parts[1]);

  return [
    (year < 2000 ? '20' : '') + year,
    (month < 10 ? '0' : '') + month,
    (day < 10 ? '0' : '') + day
  ].join('-');
}

function saveMenu(data) {
  var menu = extractMenu(data);
  console.log("Successfully extracted menu");

  var menuName = determineMenuName(menu);
  console.log("Found menuName of " + menuName);

  s3.putObject({
    Bucket: bucketName,
    Key: 'menumessages/' + menuName,
    Body: menu
  }, function(err, data) {
    if (err) {
      console.log("Failed to save menu " + menuName);
      console.log(err, err.stack);
    } else {
      console.log("Saved menu " + menuName);
    }
  });
}

exports.handler = function(event, context, callback) {
  var sesNotification = event.Records[0].ses;
  var msgId = sesNotification.mail.messageId;
  console.log("Triggered to process message " + msgId);

  s3.getObject({
    Bucket: bucketName,
    Key: 'menuemail/' + msgId
  }, function(err, data) {
    if (err) {
      console.log("Failed to fetch " + msgId);
      console.log(err, err.stack);
    } else {
      console.log("Processing " + msgId);
      saveMenu(data.Body);
    }
  });
};
