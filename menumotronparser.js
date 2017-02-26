var AWS = require('aws-sdk');
var s3 = new AWS.S3();

var bucketName = 'menumotron.nparry.com';

function addDays(date, days) {
  var result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function normalizeMenu(dailyMenu) {
  var lines = dailyMenu.split('\n');
  var result = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line.length == 0) continue;

    // If we've hit the closing lines, stop building the menu
    if (line.match(/\b(sara|week|you)\b/i)) break;

    // If this is the typical "Salad" line, add some padding
    if (line.indexOf(' ') == -1 && result.length != 0) result.push('');

    result.push(line);
  }

  return result.join('\n');
}

function processMenu(baseDate, buffer) {
  var data = buffer.utf8Slice();
  var parts = data.split(/\n\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday)[^\r\n]*/i);
  console.log('Split menu into ' + parts.length + ' parts');

  for (var i = 1; i < 6; i++) {
    console.log('Processing menu piece ' + i);
    var dailyMenu = normalizeMenu(parts[i]);
    var date = addDays(baseDate, i - 1);
    var dailyMenuName = date.toISOString().split('T')[0]
    s3.putObject({
      Bucket: bucketName,
      Key: 'menus/' + dailyMenuName,
      Body: dailyMenu
    }, function(err, data) {
      if (err) {
        console.log("Failed to save daily menu " + dailyMenuName);
        console.log(err, err.stack);
      } else {
        console.log("Saved daily menu " + dailyMenuName);
      }
    });
  }
}

exports.handler = function(event, context, callback) {
  var key = event.Records[0].s3.object.key;
  console.log("Triggered to process key " + key);
  if (!key.match(/menumessages\/\d\d\d\d-\d\d-\d\d/)) return;
  var menuName = key.split('/')[1];
  console.log("Will attempt to process menu " + menuName);

  s3.getObject({
    Bucket: bucketName,
    Key: key
  }, function(err, data) {
    if (err) {
      console.log("Failed to fetch " + menuName);
      console.log(err, err.stack);
    } else {
      console.log("Processing " + menuName);
      processMenu(new Date(menuName), data.Body);
    }
  });
};
