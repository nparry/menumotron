var AWS = require('aws-sdk');
var s3 = new AWS.S3();
var mimelib = require('mimelib');

var bucketName = 'menumotron.nparry.com';

function extractMenu(buffer) {
  var data = buffer.utf8Slice();
  var boundary = data.match(/boundary="([^"]+)"/)[1];
  var encodedMenu = data.split('--' + boundary)[1];
  if (encodedMenu.includes('Content-Transfer-Encoding: base64')) {
    var lines = encodedMenu.split(/[\r\n]/).filter(function(l) { return l.length > 0 && !l.includes(' '); });
    return mimelib.decodeBase64(lines.join(''));
  }
  else {
    return mimelib.decodeQuotedPrintable(encodedMenu);
  }
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

function determineOffice(sesNotification) {
  if (sesNotification.mail.destination[0] == process.env.CLEVELAND_OFFICE_EMAIL) {
    return 'Cleveland';
  }
  else {
    return 'Columbus';
  }
}

function saveMenu(office, data, callback) {
  var menu = extractMenu(data);
  console.log("Successfully extracted menu");

  var menuName = determineMenuName(menu);
  console.log("Found menuName of " + menuName);

  s3.putObject({
    Bucket: bucketName,
    Key: 'menumessages/' + office + '/' + menuName,
    Body: menu
  }, function(err, data) {
    if (err) {
      console.log("Failed to save menu " + menuName);
      console.log(err, err.stack);
      callback(menuName, "Failed");
    } else {
      console.log("Saved menu " + menuName);
      callback(null, menuName);
    }
  });
}

exports.handler = function(event, context, callback) {
  var sesNotification = event.Records[0].ses;
  var msgId = sesNotification.mail.messageId;
  console.log("Triggered to process message " + msgId);

  var office = determineOffice(sesNotification);
  console.log("Message " + msgId + " is for office " + office);

  s3.getObject({
    Bucket: bucketName,
    Key: 'menuemail/' + msgId
  }, function(err, data) {
    if (err) {
      console.log("Failed to fetch " + msgId);
      console.log(err, err.stack);
      callback(msgId, "Failed");
    } else {
      console.log("Processing " + msgId);
      saveMenu(office, data.Body, callback);
    }
  });
};
